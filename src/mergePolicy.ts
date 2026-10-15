export type MergeArtifact = {
  repository: string;
  baseBranch: string;
  mergeSha: string;
  productionPaths: string[];
  regressionPaths: string[];
};

const fullSha = /^[0-9a-f]{40}$/;

/** Client preflight only; the Intelligent Contract remains authoritative. */
export function validateMergeArtifact(value: MergeArtifact): string[] {
  const errors: string[] = [];
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository))
    errors.push("INVALID_REPOSITORY");
  if (!value.baseBranch.trim()) errors.push("MISSING_BASE_BRANCH");
  if (!fullSha.test(value.mergeSha)) errors.push("INVALID_MERGE_SHA");
  if (!value.productionPaths.some((path) => path.startsWith("src/")))
    errors.push("MISSING_PRODUCTION_CHANGE");
  if (!value.regressionPaths.some((path) => path.startsWith("tests/")))
    errors.push("MISSING_REGRESSION_CHANGE");
  return errors;
}
