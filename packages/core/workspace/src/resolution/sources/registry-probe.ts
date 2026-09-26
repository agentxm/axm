/**
 * What each configured registry answered when a bare name was looked up.
 *
 * Every probe is recorded so the application can show, verbatim, which
 * registries were consulted and what each one said.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";

/** What one configured registry host answered when it was consulted. */
export interface RegistryLookupProbe {
  readonly location: string;
  readonly outcome: "matched" | "not-found" | "error";
  readonly reason: Option.Option<string>;
}

/** Render one probe as the line the application prints under `--verbose`. */
export const formatRegistryProbe = (probe: RegistryLookupProbe): string => {
  switch (probe.outcome) {
    case "matched":
      return `${probe.location}: matched`;
    case "not-found":
      return `${probe.location}: no match`;
    case "error":
      return Option.match(probe.reason, {
        onNone: () => `${probe.location}: error`,
        onSome: (reason) => `${probe.location}: ${reason}`,
      });
  }
};
