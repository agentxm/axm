/**
 * SPDX license expression validation for extension manifests.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Result from "effect/Result";
import parseSpdxExpression from "spdx-expression-parse";

const UNLICENSED = "UNLICENSED";

const parseErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Parse and validate an extension manifest license string.
 *
 * Accepts SPDX license expressions plus the npm-compatible `UNLICENSED`
 * escape hatch for proprietary code.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseLicenseExpression = (input: string): Result.Result<void, string> => {
  if (input === UNLICENSED) return Result.void;

  try {
    parseSpdxExpression(input);
    return Result.void;
  } catch (error) {
    return Result.fail(parseErrorMessage(error));
  }
};
