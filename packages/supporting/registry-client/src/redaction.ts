/**
 * Credential-shape redaction for text that came off the wire.
 *
 * Registry problem details, response bodies, and request URLs can quote a
 * credential back at the caller. Every surface that copies such a string into
 * durable or machine-readable output redacts it through this function first.
 *
 * @experimental This API is unstable and may change without notice.
 */

const REDACTED = "[REDACTED]";

/** Redact common credential shapes in registry-supplied text. */
export const redactRegistryText = (input: string): string =>
  input
    .replaceAll(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`)
    .replaceAll(
      /([?&](?:access_token|refresh_token|token|api_key|apikey|key|secret|password|code|initiator_proof|code_verifier|device_code)=)[^&#\s]*/gi,
      `$1${REDACTED}`,
    )
    .replaceAll(
      /((?:access_token|refresh_token|step_up_token|token|api_key|apikey|client_secret|secret|password|authorization|initiator_?proof|code_?verifier|device_?code)["']?\s*[:=]\s*["']?)[^"',\s&}]+/gi,
      `$1${REDACTED}`,
    )
    .replaceAll(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, REDACTED)
    .replaceAll(/\b(?:sk|npm)_[A-Za-z0-9_-]{16,}\b/g, REDACTED)
    .replaceAll(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, REDACTED);
