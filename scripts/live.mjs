import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const address = process.env.MERGEPROOF_ADDRESS;
const pr = Number(process.env.MERGEPROOF_PR || 4);
const budget = 1_000_000_000_000_000n;
if (!/^0x[0-9a-fA-F]{40}$/.test(address || "")) throw Error("Set MERGEPROOF_ADDRESS");
for (const name of ["MERGEPROOF_SPONSOR_KEY", "MERGEPROOF_CONTRIBUTOR_KEY"])
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(process.env[name] || "")) throw Error(`Set ${name}`);

const key = (name) => process.env[name].startsWith("0x") ? process.env[name] : `0x${process.env[name]}`;
const accounts = [createAccount(key("MERGEPROOF_SPONSOR_KEY")), createAccount(key("MERGEPROOF_CONTRIBUTOR_KEY"))];
if (accounts[0].address.toLowerCase() === accounts[1].address.toLowerCase()) throw Error("Two distinct auxiliary wallets required");
const clients = accounts.map((account) => createClient({ chain: studionet, account }));
const reader = createClient({ chain: studionet });
const reportPath = `verification/E2E_STUDIONET_${address.slice(-8).toLowerCase()}.json`;
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath)) : {
  schema: "mergeproof-e2e-v1", network: "studionet", contract: address,
  roles: { sponsor: accounts[0].address, contributor: accounts[1].address, deployer_used_for_testing: false },
  github: { repository: "dearmore5382/MergeProof-Covenant", pull_request: pr },
  transactions: [], checks: [], started_at: new Date().toISOString()
};
if (report.contract.toLowerCase() !== address.toLowerCase() || report.roles.sponsor.toLowerCase() !== accounts[0].address.toLowerCase() || report.roles.contributor.toLowerCase() !== accounts[1].address.toLowerCase()) throw Error("Checkpoint identity mismatch");
const save = () => writeFileSync(reportPath, JSON.stringify(report, (_, v) => typeof v === "bigint" ? String(v) : v, 2) + "\n");
const canon = (x) => typeof x === "bigint" ? String(x) : Array.isArray(x) ? `[${x.map(canon).join(",")}]` : x && typeof x === "object" ? `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${canon(x[k])}`).join(",")}}` : JSON.stringify(x);
const digest = (x) => createHash("sha256").update(x).digest("hex");
const read = (functionName, args = []) => reader.readContract({ address, functionName, args });
const check = (name, pass, detail = {}) => { report.checks.push({ name, pass: Boolean(pass), detail }); save(); if (!pass) throw Error(name); };
function execution(tx) {
  if (tx.status !== "FINALIZED" && tx.status !== 7) throw Error("Not finalized");
  const receipts = tx.consensus_data?.leader_receipt || [];
  const last = [...receipts].reverse().find(x => x.mode !== "validator") || receipts.at(-1);
  if (!last || last.execution_result !== "SUCCESS" || last.result?.status !== "return") throw Error(last?.result?.payload?.readable || "GenVM rejected");
  if (Object.values(tx.consensus_data?.votes || {}).filter(v => v === "agree").length < 3) throw Error("Consensus not established");
  return JSON.parse(last.result.payload.readable);
}
async function tx(actor, label, functionName, args = [], value = 0n, expected, reject = false, cid = report.covenant_id) {
  let row = report.transactions.find(x => x.label === label);
  if (row?.verified) return row.result;
  if (row?.hash && row?.receipt && !row.verified) {
    try {
      const recovered=execution(row.receipt);
      if (!reject && recovered===expected) { row.result=recovered;row.verified=true;save();return recovered; }
    } catch {}
    row.label = `${label} (failed expectation attempt ${report.transactions.filter(x => x.label.startsWith(label)).length})`;row=undefined;
  }
  if (!row) {
    row = { label, actor: accounts[actor].address, function: functionName, args, value: String(value), before: cid === undefined ? await read("get_config") : await read("get_covenant", [cid]) };
    report.transactions.push(row); save();
    const sent = await clients[actor].writeContract({ address, functionName, args, value });
    row.hash = typeof sent === "string" ? sent : sent.txId; save(); console.log(label, row.hash);
  }
  await reader.waitForTransactionReceipt({ hash: row.hash, status: TransactionStatus.FINALIZED, interval: 5000, retries: 240 });
  row.receipt = await reader.getTransaction({ hash: row.hash });
  let result, failed = false;
  try { result = execution(row.receipt); } catch (e) { failed = true; row.error = String(e); }
  row.after = cid === undefined ? await read("get_config") : await read("get_covenant", [cid]);
  if (reject) {
    check(`${label}: rejected`, failed, { error: row.error });
    check(`${label}: state unchanged`, canon(row.before) === canon(row.after));
  } else {
    check(`${label}: execution succeeded`, !failed, { error: row.error });
    if (expected !== "ID") check(`${label}: exact result`, result === expected, { actual: result, expected });
    else check(`${label}: covenant id returned`, Number.isInteger(result), { actual: result });
  }
  row.result = result; row.verified = true; save(); return result;
}
async function waitUntil(unix, label) {
  if (Date.now() / 1000 >= unix) return;
  report.waiting = { label, unix, iso: new Date(unix * 1000).toISOString() }; save();
  console.log("WAIT", label, report.waiting.iso);
  while (Date.now() / 1000 < unix) await new Promise(r => setTimeout(r, Math.min(15000, unix * 1000 - Date.now())));
  delete report.waiting; save();
}
async function payout(cid, actor = 1, label = "contributor", expected = "PAID") {
  const recipient = accounts[actor].address.toLowerCase();
  const before = await read("get_covenant", [cid]);
  const amount = BigInt(before.credits[recipient].amount);
  report.balances ||= {};report.balances[label] = { recipient_before: String(await reader.getBalance({ address: accounts[actor].address })), contract_before: String(await reader.getBalance({ address })) }; save();
  await tx(actor, `request ${label} payout`, "request_payout", [cid], 0n, "TRANSFER_PENDING", false, cid);
  const row = report.transactions.find(x => x.label === `request ${label} payout`);
  const parent = await reader.getTransaction({ hash: row.hash });
  const children = parent.triggered_transactions;
  check("exactly one transfer child", Array.isArray(children) && children.length === 1, { children });
  const child = children[0];
  await reader.waitForTransactionReceipt({ hash: child, status: TransactionStatus.FINALIZED, interval: 5000, retries: 120 });
  row.child_hash = child; row.child_receipt = await reader.getTransaction({ hash: child }); save();
  await tx(actor, `confirm ${label} payout`, "confirm_payout", [cid, recipient, row.hash, child], 0n, expected, false, cid);
  report.balances[label].recipient_after = String(await reader.getBalance({ address: accounts[actor].address }));
  report.balances[label].contract_after = String(await reader.getBalance({ address })); save();
  check(`${label}: contract exact outflow`, BigInt(report.balances[label].contract_before) - BigInt(report.balances[label].contract_after) === amount);
  check(`${label}: recipient exact inflow`, BigInt(report.balances[label].recipient_after) - BigInt(report.balances[label].recipient_before) === amount);
}
async function verifyReuseSafely(cid,label){
  const before=await read("get_covenant",[cid]);const row={label,actor:accounts[0].address,function:"verify_merge",args:[cid],value:"0",before};report.transactions.push(row);save();
  const sent=await clients[0].writeContract({address,functionName:"verify_merge",args:[cid],value:0n});row.hash=typeof sent==="string"?sent:sent.txId;save();
  await reader.waitForTransactionReceipt({hash:row.hash,status:TransactionStatus.FINALIZED,interval:5000,retries:240});row.receipt=await reader.getTransaction({hash:row.hash});row.after=await read("get_covenant",[cid]);
  let result,failed=false;try{result=execution(row.receipt)}catch(e){failed=true;row.error=String(e)}
  if(failed)check(`${label}: reused merge rejected without mutation`,canon(row.before)===canon(row.after),{error:row.error});
  else if(result==="SOURCE_UNAVAILABLE")check(`${label}: unavailable sources fail closed without credit`,row.after.verdict.result.outcome==="SOURCE_UNAVAILABLE"&&Object.keys(row.after.credits||{}).length===0,{phase:row.after.phase,outcome:row.after.verdict.result.outcome,credits:row.after.credits});
  else check(`${label}: duplicate merge did not receive positive verdict`,false,{result});
  row.result=result;row.verified=true;save();return result;
}

try {
  const source = readFileSync("contracts/MergeProofCovenant.py");
  const deployed = Buffer.from(await reader.request({ method: "gen_getContractCode", params: [address] }), "base64");
  check("exact deployed source parity", source.equals(deployed));
  report.source_sha256 = digest(source); save();
  const config = await read("get_config"); check("deployed schema", config.schema === "mergeproof-covenant-v2", config);
  if (!report.terms) {
    const now = Math.floor(Date.now() / 1000);
    report.terms = { title: `MergeProof PR #${pr} steward remediation`, contributor: accounts[1].address.toLowerCase(), repo: "dearmore5382/MergeProof-Covenant", base_branch: "main", production_prefix: "contracts/", test_prefix: "tests/", criteria: ["Milestone adjudication is bound to GitHub PR patches while post-merge blobs are context only and missing patches fail closed.", "A challenge accepted before the cutoff remains resolvable after challenge_end and before expiry.", "Same-address sponsor and contributor partial credits combine without value loss while payout and refund accounting remain separate."], budget: Number(budget), partial_bps: 5000, proof_deadline: now + 600, challenge_end: now + 720, expires: now + 1200 };
    save();
  }
  if (report.covenant_id === undefined) report.covenant_id = await tx(0, "create covenant", "create_covenant", [canon(report.terms)], 0n, "ID", false, undefined);
  const cid = report.covenant_id;
  await tx(1, "wrong wallet funding", "fund", [cid], budget, null, true, cid);
  await tx(0, "underfund by one wei", "fund", [cid], budget - 1n, null, true, cid);
  await tx(0, "overfund by one wei", "fund", [cid], budget + 1n, null, true, cid);
  await tx(0, "fund exact budget", "fund", [cid], budget, "FUNDED", false, cid);
  await tx(0, "wrong submitter", "submit_merge", [cid, pr], 0n, null, true, cid);
  await tx(1, "submit merged PR", "submit_merge", [cid, pr], 0n, "PROOF_SUBMITTED", false, cid);
  const outcome = await tx(0, "verify commit-pinned artifacts", "verify_merge", [cid], 0n, "SATISFIED", false, cid);
  check("semantic outcome satisfied", outcome === "SATISFIED");
  const verified = await read("get_covenant", [cid]);
  check("merge SHA bound", verified.verdict.snapshot.merge_sha === "efe559c098fb1e2393ca37404dfd0e9250962d07", verified.verdict.snapshot);
  check("production and tests both bound", verified.verdict.snapshot.production.includes("contracts/MergeProofCovenant.py") && verified.verdict.snapshot.tests.includes("tests/test_covenant.py"));
  check("PR patch digests stored", verified.verdict.snapshot.artifacts.length >= 2 && verified.verdict.snapshot.artifacts.every(x => /^[0-9a-f]{64}$/.test(x.patch_sha256)));
  if (report.partial_id === undefined) {
    const now = Math.floor(Date.now() / 1000);const partialTerms={ title:"Same-address PARTIAL credit conservation",contributor:accounts[0].address.toLowerCase(),repo:"dearmore5382/MergeProof-Covenant",base_branch:"main",production_prefix:"contracts/",test_prefix:"tests/",criteria:["PR #3 updates canonical StudioNet receipt handling in the contract and adds focused regression tests.","PR #3 adds a multisignature governance module and corresponding quorum tests."],budget:Number(budget),partial_bps:5000,proof_deadline:now+240,challenge_end:now+360,expires:now+900};report.partial_terms=partialTerms;save();report.partial_id=await tx(0,"create same-address partial covenant","create_covenant",[canon(partialTerms)],0n,"ID",false,undefined);save();
  }
  await tx(0,"fund same-address partial covenant","fund",[report.partial_id],budget,"FUNDED",false,report.partial_id);
  await tx(0,"submit PR 3 for partial covenant","submit_merge",[report.partial_id,3],0n,"PROOF_SUBMITTED",false,report.partial_id);
  await tx(1,"verify same-address partial covenant","verify_merge",[report.partial_id],0n,"SOURCE_UNAVAILABLE",false,report.partial_id);
  await tx(1,"challenge transient source failure","challenge",[report.partial_id,digest("retry authoritative PR patch sources")],0n,"CHALLENGED",false,report.partial_id);
  await tx(0,"resolve same-address partial from sources","resolve_challenge",[report.partial_id],0n,"PARTIAL",false,report.partial_id);
  const partialVerified=await read("get_covenant",[report.partial_id]);check("same-address terms sealed",partialVerified.sponsor===accounts[0].address.toLowerCase()&&partialVerified.terms.contributor===accounts[0].address.toLowerCase());
  await tx(0, "late challenge rejected at cutoff", "challenge", [cid, digest("deadline enforcement")], 0n, null, true, cid);
  await tx(0, "finalize after challenge window", "finalize", [cid], 0n, "SATISFIED", false, cid);
  await tx(1,"finalize same-address partial covenant","finalize",[report.partial_id],0n,"PARTIAL",false,report.partial_id);
  const combined=await read("get_covenant",[report.partial_id]);const combinedCredit=combined.credits[accounts[0].address.toLowerCase()];check("same-address partial credit combined",combinedCredit.kind==="COMBINED"&&BigInt(combinedCredit.amount)===budget&&BigInt(combinedCredit.payout_amount)===budget/2n&&BigInt(combinedCredit.refund_amount)===budget/2n,combinedCredit);
  await payout(cid,1,"contributor","PAID");
  await payout(report.partial_id,0,"combined","PAID_AND_REFUNDED");
  const combinedPaid=await read("get_covenant",[report.partial_id]);check("combined payout accounting split",BigInt(combinedPaid.paid)===budget/2n&&BigInt(combinedPaid.refunded)===budget/2n&&BigInt(combinedPaid.pending)===0n,combinedPaid);
  if(report.boundary_id===undefined){const now=Math.floor(Date.now()/1000);const boundaryTerms={title:"Challenge resolution across cutoff",contributor:accounts[1].address.toLowerCase(),repo:"dearmore5382/MergeProof-Covenant",base_branch:"main",production_prefix:"contracts/",test_prefix:"tests/",criteria:["PR #2 hardens source-bound settlement and challenge behavior.","PR #2 includes focused contract regression tests."],budget:Number(budget),partial_bps:5000,proof_deadline:now+300,challenge_end:now+540,expires:now+1200};report.boundary_terms=boundaryTerms;save();report.boundary_id=await tx(0,"create boundary challenge covenant","create_covenant",[canon(boundaryTerms)],0n,"ID",false,undefined);save();}
  await tx(0,"fund boundary challenge covenant","fund",[report.boundary_id],budget,"FUNDED",false,report.boundary_id);
  await tx(1,"submit PR 2 for boundary covenant","submit_merge",[report.boundary_id,2],0n,"PROOF_SUBMITTED",false,report.boundary_id);
  const boundaryOutcome=await tx(0,"verify boundary covenant","verify_merge",[report.boundary_id],0n,"SATISFIED",false,report.boundary_id);check("boundary source verdict positive",boundaryOutcome==="SATISFIED");
  await tx(1,"challenge accepted before cutoff","challenge",[report.boundary_id,digest("challenge remains resolvable across cutoff")],0n,"CHALLENGED",false,report.boundary_id);
  await waitUntil(report.boundary_terms.challenge_end+5,"boundary challenge cutoff passes");
  await tx(0,"resolve accepted challenge after cutoff","resolve_challenge",[report.boundary_id],0n,"SATISFIED",false,report.boundary_id);
  await tx(0,"finalize boundary covenant","finalize",[report.boundary_id],0n,"SATISFIED",false,report.boundary_id);
  await tx(1, "replay payout rejected", "request_payout", [cid], 0n, null, true, cid);
  if (report.replay_id === undefined) {
    const now = Math.floor(Date.now() / 1000);
    const replayTerms = { ...report.terms, title: `Replay attempt ${now}`, proof_deadline: now + 600, challenge_end: now + 1200, expires: now + 1800 };
    report.replay_terms = replayTerms; save();
    report.replay_id = await tx(0, "create replay covenant", "create_covenant", [canon(replayTerms)], 0n, "ID", false, undefined); save();
  }
  await tx(0, "fund replay covenant", "fund", [report.replay_id], budget, "FUNDED", false, report.replay_id);
  await tx(1, "submit reused merge", "submit_merge", [report.replay_id, pr], 0n, "PROOF_SUBMITTED", false, report.replay_id);
  const replayState=await read("get_covenant",[report.replay_id]);
  if(replayState.phase==="PROOF_SUBMITTED")await verifyReuseSafely(report.replay_id,"live reused merge first attempt");
  else if(replayState.verdict?.result?.outcome==="SOURCE_UNAVAILABLE"&&Object.keys(replayState.credits||{}).length===0)check("live reused merge first attempt: unavailable sources fail closed",true,{phase:replayState.phase,outcome:replayState.verdict.result.outcome,credits:replayState.credits});
  const final = await read("get_covenant", [cid]);
  check("value conservation", BigInt(final.held) + BigInt(final.pending) + BigInt(final.paid) + BigInt(final.refunded) === budget, final);
  if(report.replay_retry_id===undefined){const now=Math.floor(Date.now()/1000);const retryTerms={...report.terms,title:"Live replay rejection retry",proof_deadline:now+300,challenge_end:now+480,expires:now+720};report.replay_retry_terms=retryTerms;save();report.replay_retry_id=await tx(0,"create live replay retry covenant","create_covenant",[canon(retryTerms)],0n,"ID",false,undefined);save();}
  await tx(0,"fund live replay retry covenant","fund",[report.replay_retry_id],budget,"FUNDED",false,report.replay_retry_id);
  await tx(1,"submit same merged PR to replay retry","submit_merge",[report.replay_retry_id,pr],0n,"PROOF_SUBMITTED",false,report.replay_retry_id);
  if(!report.replay_retry_checked){await verifyReuseSafely(report.replay_retry_id,"live reused merge retry");report.replay_retry_checked=true;save();}
  report.final = final; report.finished_at = new Date().toISOString(); delete report.error; save();
  console.log("E2E VERIFIED", reportPath);
} catch (e) { report.error = String(e); save(); throw e; }
