import { describe, it, expect } from "vitest";
import {
  validAddress,
  normalizeTx,
  parseSafeGEN,
  execution,
  nextAction,
  type Covenant,
} from "./protocol";
const c = {
  sponsor: "0x" + "a".repeat(40),
  terms: { contributor: "0x" + "b".repeat(40) },
  phase: "DRAFT",
} as Covenant;
describe("frontend authority", () => {
  it("validates identities", () => {
    expect(validAddress(c.sponsor)).toBe(true);
    expect(validAddress("0x0")).toBe(false);
  });
  it("normalizes SDK hashes", () => {
    const h = "0x" + "1".repeat(64);
    expect(normalizeTx({ txId: h })).toBe(h);
    expect(() => normalizeTx({ txId: "bad" })).toThrow();
  });
  it("parses GEN without unsafe integer rounding", () => {
    expect(parseSafeGEN("0.001")).toBe(1_000_000_000_000_000);
    expect(() => parseSafeGEN("1")).toThrow(/exact integer range/);
  });
  it("requires finalized successful leader execution and consensus", () => {
    const tx = { status: 7, consensus_data: { votes: { a: "agree", b: "agree", c: "agree" }, leader_receipt: [{ mode: "leader", execution_result: "SUCCESS", result: { status: "return", payload: { readable: '"FUNDED"' } } }] } };
    expect(execution(tx)).toBe("FUNDED");
    expect(() => execution({ ...tx, consensus_data: { ...tx.consensus_data, votes: { a: "agree" } } })).toThrow(/consensus/);
    expect(() => execution({ ...tx, consensus_data: { ...tx.consensus_data, leader_receipt: [{ mode: "leader", execution_result: "ERROR", result: { status: "contract_error", payload: "exit_code 1" } }] } })).toThrow(/exit_code 1/);
  });
  it("derives action from authoritative role", () => {
    expect(nextAction("DRAFT", c.sponsor, c)).toBe("FUND");
    expect(nextAction("FUNDED", c.terms.contributor, c)).toBe("SUBMIT MERGE");
    expect(nextAction("SETTLED", c.sponsor, c)).toBe("COMPLETE");
  });
});
