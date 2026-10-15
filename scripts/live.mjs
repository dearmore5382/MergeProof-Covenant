import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const address = process.env.MERGEPROOF_ADDRESS;
const pr = Number(process.env.MERGEPROOF_PR || 1);
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
    row.label = `${label} (failed consensus attempt ${report.transactions.filter(x => x.label.startsWith(label)).length})`;
    row = undefined;
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
async function payout(cid) {
  const recipient = accounts[1].address.toLowerCase();
  const before = await read("get_covenant", [cid]);
  const amount = BigInt(before.credits[recipient].amount);
  report.balances = { recipient_before: String(await reader.getBalance({ address: accounts[1].address })), contract_before: String(await reader.getBalance({ address })) }; save();
  await tx(1, "request contributor payout", "request_payout", [cid], 0n, "TRANSFER_PENDING", false, cid);
  const row = report.transactions.find(x => x.label === "request contributor payout");
  const parent = await reader.getTransaction({ hash: row.hash });
  const children = parent.triggered_transactions;
  check("exactly one transfer child", Array.isArray(children) && children.length === 1, { children });
  const child = children[0];
  await reader.waitForTransactionReceipt({ hash: child, status: TransactionStatus.FINALIZED, interval: 5000, retries: 120 });
  row.child_hash = child; row.child_receipt = await reader.getTransaction({ hash: child }); save();
  await tx(1, "confirm contributor payout", "confirm_payout", [cid, recipient, row.hash, child], 0n, "PAID", false, cid);
  report.balances.recipient_after = String(await reader.getBalance({ address: accounts[1].address }));
  report.balances.contract_after = String(await reader.getBalance({ address })); save();
  check("contract exact outflow", BigInt(report.balances.contract_before) - BigInt(report.balances.contract_after) === amount);
  check("recipient exact inflow", BigInt(report.balances.recipient_after) - BigInt(report.balances.recipient_before) === amount);
}

try {
  const source = readFileSync("contracts/MergeProofCovenant.py");
  const deployed = Buffer.from(await reader.request({ method: "gen_getContractCode", params: [address] }), "base64");
  check("exact deployed source parity", source.equals(deployed));
  report.source_sha256 = digest(source); save();
  const config = await read("get_config"); check("deployed schema", config.schema === "mergeproof-covenant-v1", config);
  if (!report.terms) {
    const now = Math.floor(Date.now() / 1000);
    report.terms = { title: `MergeProof PR #${pr} source-bound settlement`, contributor: accounts[1].address.toLowerCase(), repo: "dearmore5382/MergeProof-Covenant", base_branch: "main", production_prefix: "src/", test_prefix: "tests/", criteria: ["The implementation rejects malformed repository identities, mutable merge revisions, and milestones without production changes.", "Regression tests cover valid merge artifacts, documentation-only evidence, and malformed revision identities."], budget: Number(budget), partial_bps: 5000, proof_deadline: now + 900, challenge_end: now + 1800, expires: now + 2700 };
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
  check("merge SHA bound", verified.verdict.snapshot.merge_sha === "174ef5dfa9c4ea92171c7d00f562464519f9e008", verified.verdict.snapshot);
  check("production and tests both bound", verified.verdict.snapshot.production.includes("src/mergePolicy.ts") && verified.verdict.snapshot.tests.includes("tests/merge_policy.test.ts"));
  await tx(0, "adversarial challenge", "challenge", [cid, digest("re-evaluate exact merged bytes")], 0n, "CHALLENGED", false, cid);
  await tx(1, "resolve challenge from sources", "resolve_challenge", [cid], 0n, "SATISFIED", false, cid);
  await tx(0, "second challenge rejected", "challenge", [cid, digest("attempt duplicate challenge")], 0n, null, true, cid);
  await tx(0, "early finalize rejected", "finalize", [cid], 0n, null, true, cid);
  await waitUntil(report.terms.challenge_end + 5, "challenge window close");
  await tx(0, "finalize after challenge window", "finalize", [cid], 0n, "SATISFIED", false, cid);
  await payout(cid);
  await tx(1, "replay payout rejected", "request_payout", [cid], 0n, null, true, cid);
  if (report.replay_id === undefined) {
    const now = Math.floor(Date.now() / 1000);
    const replayTerms = { ...report.terms, title: `Replay attempt ${now}`, proof_deadline: now + 600, challenge_end: now + 1200, expires: now + 1800 };
    report.replay_terms = replayTerms; save();
    report.replay_id = await tx(0, "create replay covenant", "create_covenant", [canon(replayTerms)], 0n, "ID", false, undefined); save();
  }
  await tx(0, "fund replay covenant", "fund", [report.replay_id], budget, "FUNDED", false, report.replay_id);
  await tx(1, "submit reused merge", "submit_merge", [report.replay_id, pr], 0n, "PROOF_SUBMITTED", false, report.replay_id);
  await tx(0, "reused merge rejected", "verify_merge", [report.replay_id], 0n, null, true, report.replay_id);
  const final = await read("get_covenant", [cid]);
  check("value conservation", BigInt(final.held) + BigInt(final.pending) + BigInt(final.paid) + BigInt(final.refunded) === budget, final);
  report.final = final; report.finished_at = new Date().toISOString(); delete report.error; save();
  console.log("E2E VERIFIED", reportPath);
} catch (e) { report.error = String(e); save(); throw e; }
