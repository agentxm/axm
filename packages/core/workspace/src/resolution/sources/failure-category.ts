/**
 * Failure category vocabulary carried by this package's composition-root
 * ports. The literals are the same strings as the CLI's `AppErrorCode`; the
 * application's conversion site asserts the parity at compile time by
 * assigning this type to its own.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CarriedFailureCategory =
  | "issues"
  | "usage"
  | "not_found"
  | "auth"
  | "forbidden"
  | "conflict"
  | "rate_limit"
  | "network"
  | "validation"
  | "internal"
  | "unavailable"
  | "quota"
  | "auth_required"
  | "auth_expired"
  | "auth_denied"
  | "timeout";
