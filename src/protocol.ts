export type Covenant = {
  id: number;
  sponsor: string;
  terms: {
    title: string;
    contributor: string;
    repo: string;
    base_branch: string;
    production_prefix: string;
    test_prefix: string;
    criteria: string[];
    budget: number;
    partial_bps: number;
    proof_deadline: number;
    challenge_end: number;
    expires: number;
  };
  terms_digest: string;
  phase: string;
  proof?: { pr: number };
  verdict?: {
    result: { outcome: string; matched: number[] };
    snapshot?: { merge_sha: string; production: string[]; tests: string[] };
  };
  held: number;
  pending: number;
  paid: number;
  refunded: number;
  credits: Record<string, { amount: number; kind: string; status: string }>;
};
export const validAddress = (x: string) =>
  /^0x[0-9a-fA-F]{40}$/.test(x) && !/^0x0{40}$/.test(x);
export const validTx = (x: string) => /^0x[0-9a-fA-F]{64}$/.test(x);
export const normalizeTx = (x: unknown) => {
  if (typeof x === "string" && validTx(x)) return x;
  if (
    x &&
    typeof x === "object" &&
    "txId" in x &&
    typeof (x as { txId: unknown }).txId === "string" &&
    validTx((x as { txId: string }).txId)
  )
    return (x as { txId: string }).txId;
  throw Error("Wallet returned an invalid transaction hash.");
};
export const parseSafeGEN = (text: string) => {
  if (!/^(0|[1-9]\d{0,3})(\.\d{1,18})?$/.test(text))
    throw Error("Enter a positive GEN amount with up to 18 decimals.");
  const [whole, fraction = ""] = text.split(".");
  const wei = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
  if (wei <= 0n || wei > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error("Amount exceeds the exact integer range supported by this form.");
  return Number(wei);
};
export function execution(tx: unknown): unknown {
  const value = tx as {
    status?: string | number;
    consensus_data?: {
      leader_receipt?: Array<{ mode?: string; execution_result?: string; result?: { status?: string; payload?: { readable?: string } | string } }>;
      votes?: Record<string, string>;
    };
  };
  if (value.status !== "FINALIZED" && value.status !== 7) throw Error("Transaction has not finalized.");
  const receipts = value.consensus_data?.leader_receipt || [];
  const receipt = [...receipts].reverse().find((x) => x.mode !== "validator") || receipts.at(-1);
  const payload = receipt?.result?.payload;
  const readable = payload && typeof payload === "object" ? payload.readable : undefined;
  if (!receipt || receipt.execution_result !== "SUCCESS" || receipt.result?.status !== "return" || readable === undefined)
    throw Error(typeof payload === "string" ? payload : "GenVM execution did not succeed.");
  if (Object.values(value.consensus_data?.votes || {}).filter((x) => x === "agree").length < 3)
    throw Error("Validator consensus was not established.");
  return JSON.parse(readable);
}
export const gen = (n: number) => `${(Number(n) / 1e18).toFixed(4)} GEN`;
export const phases = [
  "DRAFT",
  "FUNDED",
  "PROOF_SUBMITTED",
  "VERIFIED",
  "CHALLENGED",
  "SETTLED",
  "RECOVERED",
];
export const nextAction = (phase: string, wallet: string, c?: Covenant) => {
  if (!c) return "SYNC";
  const w = wallet.toLowerCase();
  if (phase === "DRAFT") return w === c.sponsor ? "FUND" : "WAIT FOR SPONSOR";
  if (phase === "FUNDED")
    return w === c.terms.contributor.toLowerCase()
      ? "SUBMIT MERGE"
      : "WAIT FOR CONTRIBUTOR";
  if (phase === "PROOF_SUBMITTED") return "VERIFY MERGE";
  if (phase === "VERIFIED") return "CHALLENGE OR FINALIZE";
  if (phase === "CHALLENGED") return "RECHECK";
  return "COMPLETE";
};
