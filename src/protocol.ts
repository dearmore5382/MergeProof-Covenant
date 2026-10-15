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
