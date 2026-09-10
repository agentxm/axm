/**
 * Deterministic archive builders for tests that exercise archive guardrails
 * and publish input normalization without a zip tool.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  buildDecompressionBombZip,
  buildMalformedZip,
  buildSymlinkZip,
  buildZip,
  textContent,
} from "./packaging/test-zip-helpers.js";
