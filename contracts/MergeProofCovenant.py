# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json, hashlib, base64
from datetime import datetime
import typing

SCHEMA = "mergeproof-covenant-v1"
OUTCOMES = ("SATISFIED", "PARTIAL", "INSUFFICIENT", "SOURCE_UNAVAILABLE")
RPC = "https://studio.genlayer.com/api"

def _canon(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)

def _digest(value):
    raw = value if isinstance(value, bytes) else str(value).encode()
    return hashlib.sha256(raw).hexdigest()

def _address(value):
    return "0x" + value.as_bytes.hex()

def _read_json(url):
    response = gl.nondet.web.get(url, headers={"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
    if int(response.status) != 200 or len(response.body) > 700000:
        raise ValueError("SOURCE_UNAVAILABLE")
    return json.loads(response.body.decode())

def _github_snapshot(repo, pr_number, base_branch, production_prefix, test_prefix):
    root = "https://api.github.com/repos/" + repo
    pr = _read_json(root + "/pulls/" + str(pr_number))
    if not pr.get("merged") or pr.get("state") != "closed":
        raise ValueError("PR_NOT_MERGED")
    if pr.get("base", {}).get("ref") != base_branch:
        raise ValueError("WRONG_BASE")
    merge_sha = str(pr.get("merge_commit_sha", "")).lower()
    if len(merge_sha) != 40:
        raise ValueError("MISSING_MERGE_SHA")
    commit = _read_json(root + "/commits/" + merge_sha)
    if str(commit.get("sha", "")).lower() != merge_sha:
        raise ValueError("REVISION_MISMATCH")
    files = []
    page = 1
    while page <= 3:
        rows = _read_json(root + "/pulls/" + str(pr_number) + "/files?per_page=100&page=" + str(page))
        if not isinstance(rows, list):
            raise ValueError("INVALID_FILES")
        files.extend(rows)
        if len(rows) < 100: break
        page += 1
    changed = sorted({str(x.get("filename", "")) for x in files if x.get("filename")})
    production = [x for x in changed if x.startswith(production_prefix)]
    tests = [x for x in changed if x.startswith(test_prefix)]
    return {"repo": repo, "pr": pr_number, "base": base_branch, "merge_sha": merge_sha,
            "head_sha": str(pr.get("head", {}).get("sha", "")).lower(),
            "production": production, "tests": tests, "changed": changed}

def _assess(snapshot, criteria):
    if not snapshot["production"] or not snapshot["tests"]:
        return {"outcome": "INSUFFICIENT", "matched": []}
    prompt = "MERGEPROOF_V1\nReturn only compact JSON {outcome:SATISFIED|PARTIAL|INSUFFICIENT,matched:[criterion_index]}. " \
             "Judge the actual changed implementation/test paths against every sealed criterion. Documentation alone is insufficient.\n" + _canon({"snapshot": snapshot, "criteria": criteria})
    x = json.loads(gl.nondet.exec_prompt(prompt))
    if set(x) != {"outcome", "matched"} or x["outcome"] not in OUTCOMES[:3]: raise ValueError("INVALID_VERDICT")
    if not isinstance(x["matched"], list) or any(type(i) is not int or i < 0 or i >= len(criteria) for i in x["matched"]): raise ValueError("INVALID_MATCHES")
    if len(set(x["matched"])) != len(x["matched"]): raise ValueError("DUPLICATE_MATCH")
    expected = "SATISFIED" if len(x["matched"]) == len(criteria) else ("PARTIAL" if x["matched"] else "INSUFFICIENT")
    if x["outcome"] != expected: raise ValueError("CROSS_FIELD_VERDICT")
    return x

def _verify(repo, pr_number, base_branch, production_prefix, test_prefix, criteria):
    def observe():
        try:
            snap = _github_snapshot(repo, pr_number, base_branch, production_prefix, test_prefix)
            return {"snapshot": snap, "result": _assess(snap, criteria)}
        except Exception:
            return {"snapshot": None, "result": {"outcome":"SOURCE_UNAVAILABLE","matched":[]}}
    return gl.vm.run_nondet(observe, gl.eq_principle.strict_eq)

@gl.evm.contract_interface
class _Recipient:
    class View: pass
    class Write: pass

def _rpc_transaction(tx_hash):
    response = gl.nondet.web.post(RPC, headers={"Content-Type":"application/json"}, body=_canon({"jsonrpc":"2.0","id":1,"method":"eth_getTransactionByHash","params":[tx_hash]}))
    if int(response.status) != 200 or response.body is None or len(response.body) > 2000000: raise ValueError("RECEIPT_UNAVAILABLE")
    value=json.loads(response.body)
    if value.get("error") or not isinstance(value.get("result"),dict): raise ValueError("RECEIPT_MISSING")
    return value["result"]

def _transfer_proof(contract,cid,recipient,amount,parent_hash,child_hash):
    parent,child=_rpc_transaction(parent_hash),_rpc_transaction(child_hash);low=lambda x:str(x).lower()
    if low(parent.get("hash"))!=parent_hash or low(child.get("hash"))!=child_hash: raise ValueError("HASH_BINDING")
    if parent.get("status")!="FINALIZED" or child.get("status")!="FINALIZED": raise ValueError("NOT_FINAL")
    if low(parent.get("to_address"))!=contract or low(parent.get("from_address"))!=recipient: raise ValueError("PARENT_IDENTITY")
    args=calldata.decode(base64.b64decode(parent["data"]["calldata"]))
    if args.get("method")!="request_payout" or list(args.get("args",[]))!=[cid]: raise ValueError("PARENT_ACTION")
    if child_hash not in [low(x) for x in parent.get("triggered_transactions",[])] or low(child.get("triggered_by"))!=parent_hash: raise ValueError("CHILD_BINDING")
    if low(child.get("from_address"))!=contract or low(child.get("to_address"))!=recipient or int(child.get("value",-1))!=amount or int(child.get("type",-1))!=0: raise ValueError("TRANSFER_BINDING")
    if child.get("value_credited") is not True: raise ValueError("TRANSFER_NOT_CREDITED")
    return True

def _confirm_transfer(contract,cid,recipient,amount,parent_hash,child_hash):
    def observe():
        try: return _transfer_proof(contract,cid,recipient,amount,parent_hash,child_hash)
        except Exception: return False
    return gl.eq_principle.strict_eq(observe)

class MergeProofCovenant(gl.Contract):
    covenants: TreeMap[u256, str]
    used_merge: TreeMap[str, bool]
    used_receipts: TreeMap[str, bool]
    count: u256

    def __init__(self):
        self.count = u256(0)

    def _sender(self): return _address(gl.message.sender_address)
    def _now(self): return int(datetime.fromisoformat(gl.message_raw["datetime"].replace("Z", "+00:00")).timestamp())
    def _get(self, cid):
        if cid < 0 or cid >= int(self.count): raise gl.vm.UserError("UNKNOWN_COVENANT")
        return json.loads(self.covenants[u256(cid)])
    def _put(self, cid, value): self.covenants[u256(cid)] = _canon(value)

    @gl.public.view
    def get_config(self) -> typing.Any: return {"schema": SCHEMA, "count": int(self.count), "clock": gl.message_raw["datetime"]}

    @gl.public.view
    def get_covenant(self, cid: int) -> typing.Any: return self._get(cid)

    @gl.public.write
    def create_covenant(self, terms_json: str):
        t = json.loads(terms_json)
        required = {"title","contributor","repo","base_branch","production_prefix","test_prefix","criteria","budget","partial_bps","proof_deadline","challenge_end","expires"}
        if set(t) != required: raise gl.vm.UserError("INVALID_TERMS")
        if not (3 <= len(t["title"]) <= 120 and 1 <= len(t["criteria"]) <= 5): raise gl.vm.UserError("INVALID_SCOPE")
        if any(not isinstance(x, str) or not 12 <= len(x) <= 240 for x in t["criteria"]): raise gl.vm.UserError("INVALID_CRITERIA")
        if not (isinstance(t["budget"], int) and t["budget"] > 0 and 0 <= t["partial_bps"] <= 9000): raise gl.vm.UserError("INVALID_ECONOMICS")
        now = self._now()
        if not (now < t["proof_deadline"] < t["challenge_end"] < t["expires"]): raise gl.vm.UserError("INVALID_DEADLINES")
        if "/" not in t["repo"] or not t["production_prefix"] or not t["test_prefix"]: raise gl.vm.UserError("INVALID_REPOSITORY")
        cid = int(self.count); self.count = u256(cid + 1)
        value = {"id":cid,"sponsor":self._sender(),"terms":t,"terms_digest":_digest(_canon([SCHEMA, cid, self._sender(), t])),"phase":"DRAFT","proof":None,"verdict":None,"challenge":None,"held":0,"pending":0,"paid":0,"refunded":0,"credits":{}}
        self._put(cid, value); return cid

    @gl.public.write.payable
    def fund(self, cid: int):
        v = self._get(cid)
        if self._sender() != v["sponsor"] or v["phase"] != "DRAFT": raise gl.vm.UserError("SPONSOR_DRAFT_ONLY")
        if int(gl.message.value) != v["terms"]["budget"]: raise gl.vm.UserError("EXACT_VALUE_REQUIRED")
        v["held"] = v["terms"]["budget"]; v["phase"] = "FUNDED"; self._put(cid,v); return "FUNDED"

    @gl.public.write
    def submit_merge(self, cid: int, pr_number: int):
        v = self._get(cid)
        if self._sender() != v["terms"]["contributor"].lower() or v["phase"] != "FUNDED": raise gl.vm.UserError("CONTRIBUTOR_FUNDED_ONLY")
        if self._now() >= v["terms"]["proof_deadline"] or pr_number <= 0: raise gl.vm.UserError("PROOF_WINDOW_CLOSED")
        v["proof"] = {"pr":pr_number,"submitter":self._sender()}; v["phase"] = "PROOF_SUBMITTED"; self._put(cid,v); return "PROOF_SUBMITTED"

    @gl.public.write
    def verify_merge(self, cid: int):
        v = self._get(cid)
        if v["phase"] != "PROOF_SUBMITTED": raise gl.vm.UserError("PROOF_REQUIRED")
        t = v["terms"]
        observed = _verify(t["repo"],v["proof"]["pr"],t["base_branch"],t["production_prefix"],t["test_prefix"],t["criteria"])
        snapshot, verdict = observed["snapshot"], observed["result"]
        if snapshot is not None:
            key = t["repo"].lower() + "@" + snapshot["merge_sha"]
            if self.used_merge.get(key, False): raise gl.vm.UserError("MERGE_ALREADY_USED")
        v["verdict"]={"result":verdict,"snapshot":snapshot,"verified_at":self._now()}; v["phase"]="VERIFIED"; self._put(cid,v); return verdict["outcome"]

    @gl.public.write
    def challenge(self, cid: int, reason_digest: str):
        v=self._get(cid)
        if v["phase"]!="VERIFIED" or self._now()>=v["terms"]["challenge_end"]: raise gl.vm.UserError("CHALLENGE_CLOSED")
        if len(reason_digest)!=64: raise gl.vm.UserError("INVALID_REASON_DIGEST")
        v["challenge"]={"challenger":self._sender(),"reason_digest":reason_digest}; v["phase"]="CHALLENGED"; self._put(cid,v); return "CHALLENGED"

    @gl.public.write
    def resolve_challenge(self, cid: int):
        v=self._get(cid)
        if v["phase"]!="CHALLENGED": raise gl.vm.UserError("NOT_CHALLENGED")
        v["phase"]="PROOF_SUBMITTED"; self._put(cid,v)
        return self.verify_merge(cid)

    @gl.public.write
    def finalize(self, cid: int):
        v=self._get(cid)
        if v["phase"]!="VERIFIED" or self._now()<v["terms"]["challenge_end"]: raise gl.vm.UserError("FINALIZATION_BLOCKED")
        result=v["verdict"]["result"]["outcome"]; budget=v["terms"]["budget"]
        award=budget if result=="SATISFIED" else (budget*v["terms"]["partial_bps"]//10000 if result=="PARTIAL" else 0)
        refund=budget-award; credits={}
        if award: credits[v["terms"]["contributor"].lower()]={"amount":award,"kind":"PAYOUT","status":"AVAILABLE"}
        if refund: credits[v["sponsor"]]={"amount":refund,"kind":"REFUND","status":"AVAILABLE"}
        if v["verdict"]["snapshot"]:
            self.used_merge[v["terms"]["repo"].lower()+"@"+v["verdict"]["snapshot"]["merge_sha"]]=True
        v["credits"]=credits; v["phase"]="SETTLED"; self._put(cid,v); return result

    @gl.public.write
    def recover_expired(self, cid: int):
        v=self._get(cid)
        if self._now()<v["terms"]["expires"] or v["phase"] in ("SETTLED","RECOVERED","PAID","REFUNDED"): raise gl.vm.UserError("RECOVERY_BLOCKED")
        v["credits"]={v["sponsor"]:{"amount":v["held"],"kind":"REFUND","status":"AVAILABLE"}}; v["phase"]="RECOVERED"; self._put(cid,v); return "REFUND_AVAILABLE"

    @gl.public.write
    def request_payout(self, cid: int) -> str:
        v=self._get(cid);sender=self._sender();credit=v["credits"].get(sender)
        if gl.message.sender_address!=gl.message.origin_address: raise gl.vm.UserError("DIRECT_WALLET_REQUIRED")
        if credit is None or credit["status"]!="AVAILABLE" or credit["amount"]<=0: raise gl.vm.UserError("NO_AVAILABLE_CREDIT")
        amount=credit["amount"]
        if v["held"]<amount or int(self.balance)<amount: raise gl.vm.UserError("CUSTODY_MISMATCH")
        _Recipient(Address(sender)).emit_transfer(value=u256(amount))
        credit["status"]="TRANSFER_PENDING";v["held"]-=amount;v["pending"]+=amount;self._put(cid,v);return "TRANSFER_PENDING"

    @gl.public.write
    def confirm_payout(self,cid:int,recipient:str,parent_hash:str,child_hash:str)->str:
        recipient=recipient.lower();v=self._get(cid);credit=v["credits"].get(recipient)
        if credit is None or credit["status"]!="TRANSFER_PENDING": raise gl.vm.UserError("NO_PENDING_TRANSFER")
        if len(parent_hash)!=66 or len(child_hash)!=66 or self.used_receipts.get(child_hash,False): raise gl.vm.UserError("RECEIPT_INVALID_OR_USED")
        contract="0x"+gl.message.contract_address.as_bytes.hex();amount=credit["amount"]
        valid=_confirm_transfer(contract,cid,recipient,amount,parent_hash.lower(),child_hash.lower())
        if valid is not True: raise gl.vm.UserError("TRANSFER_NOT_PROVEN")
        credit["status"]="PAID";credit["parent_hash"]=parent_hash;credit["child_hash"]=child_hash;v["pending"]-=amount;v["refunded" if credit["kind"]=="REFUND" else "paid"]+=amount;self.used_receipts[child_hash]=True;self._put(cid,v)
        return "REFUNDED" if credit["kind"]=="REFUND" else "PAID"
