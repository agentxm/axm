/**
 * Release-age policy vocabulary consumed by source resolution ports.
 *
 * These are the pure evaluation, exemption, and evidence shapes a resolution
 * request commits to. Record construction, maturity checks, and everything
 * coupled to registry version entries stays in `@agentxm/registry-protocol`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as DateTime from "effect/DateTime";
import type * as Duration from "effect/Duration";
import type { ReleaseAgeExcludePattern } from "./fqn-pattern.js";

export interface ScopedReleaseAgeExcludePattern {
  readonly pattern: ReleaseAgeExcludePattern;
  readonly scope: "project" | "user";
}

export interface ReleaseAgeEvaluation {
  readonly minimumReleaseAge: Duration.Duration;
  readonly evaluatedAt: DateTime.Utc;
  readonly mode: "enforce" | "ignore";
  readonly exclude?: ReadonlyArray<ScopedReleaseAgeExcludePattern>;
  readonly grantedExemption?: ReleaseAgeExemption;
}

export type ReleaseAgeExemption =
  | {
      readonly bypassCause: "exclude";
      readonly exemptionScope: "project" | "user";
    }
  | {
      readonly bypassCause: "ignore-flag";
    };

export interface ReleaseAgeEvidence {
  readonly version: string;
  readonly publishedAt: string;
  readonly eligibleAt: string;
  readonly minimumReleaseAgeSeconds: number;
}
