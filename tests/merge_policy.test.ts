import { describe, expect, it } from "vitest";
import { validateMergeArtifact } from "../src/mergePolicy";

const valid = {
  repository: "dearmore5382/MergeProof-Covenant",
  baseBranch: "main",
  mergeSha: "a".repeat(40),
  productionPaths: ["src/mergePolicy.ts"],
  regressionPaths: ["tests/merge_policy.test.ts"],
};

describe("merge artifact preflight", () => {
  it("accepts exact implementation and regression paths", () => {
    expect(validateMergeArtifact(valid)).toEqual([]);
  });
  it("rejects documentation-only evidence", () => {
    expect(validateMergeArtifact({ ...valid, productionPaths: ["README.md"], regressionPaths: [] })).toEqual([
      "MISSING_PRODUCTION_CHANGE",
      "MISSING_REGRESSION_CHANGE",
    ]);
  });
  it("rejects mutable revision identities", () => {
    expect(validateMergeArtifact({ ...valid, mergeSha: "main" })).toContain("INVALID_MERGE_SHA");
  });
});
