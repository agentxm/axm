/**
 * The diagnostic sentence an assessment reports when a source could not be
 * compared.
 *
 * Source resolution and host providers already state why they refused; an
 * inspection result relays that sentence rather than asking the application to
 * render one for it.
 *
 * @experimental This API is unstable and may change without notice.
 */

/** The sentence a typed failure carries, or its tag when it carries none. */
export const describeInspectionFailure = (failure: unknown): string => {
  if (typeof failure === "object" && failure !== null) {
    for (const key of ["detail", "subject", "message"] as const) {
      if (key in failure) {
        const candidate = Reflect.get(failure, key);
        if (typeof candidate === "string" && candidate.length > 0) return candidate;
      }
    }
    if ("_tag" in failure && typeof failure._tag === "string") return failure._tag;
  }
  return String(failure);
};
