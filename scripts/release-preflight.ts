const FULL_GIT_SHA = /^[0-9a-f]{40}$/u;

export const validateReleasePreparationSource = (
  declaredSourceSha: string,
  checkoutSha: string,
  originMainSha: string,
): void => {
  if (!FULL_GIT_SHA.test(declaredSourceSha)) {
    throw new Error("Release preparation requires an exact 40-character lowercase commit SHA.");
  }
  if (checkoutSha !== declaredSourceSha) {
    throw new Error(
      `Checked out ${checkoutSha}, but release preparation declared ${declaredSourceSha}.`,
    );
  }
  if (originMainSha !== declaredSourceSha) {
    throw new Error(
      `origin/main is ${originMainSha}, not declared source ${declaredSourceSha}; prepare from current main.`,
    );
  }
};
