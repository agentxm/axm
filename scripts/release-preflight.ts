import { requireFullSha } from "./release-identity.js";

export const validateReleasePreparationSource = (
  declaredSourceSha: string,
  checkoutSha: string,
  originMainSha: string,
): void => {
  requireFullSha(declaredSourceSha, "Release preparation");
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
