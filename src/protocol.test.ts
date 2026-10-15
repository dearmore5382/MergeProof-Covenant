import { describe, it, expect } from "vitest";
import {
  validAddress,
  normalizeTx,
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
  it("derives action from authoritative role", () => {
    expect(nextAction("DRAFT", c.sponsor, c)).toBe("FUND");
    expect(nextAction("FUNDED", c.terms.contributor, c)).toBe("SUBMIT MERGE");
    expect(nextAction("SETTLED", c.sponsor, c)).toBe("COMPLETE");
  });
});
