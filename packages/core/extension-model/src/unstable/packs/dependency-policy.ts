import * as semver from "semver";
import type {
  ExtensionFqnParts,
  ExtensionType,
  ExtensionVisibility,
} from "../extensions/common.js";
import type { DeprecationView } from "../extensions/deprecation.js";
import { formatFqn } from "../extensions/fqn.js";
import {
  decodeVersionSync,
  type Version,
  type VersionRange,
} from "../version-constraints/version-constraints.js";

export interface PackDependencyTarget extends ExtensionFqnParts {
  readonly type: Exclude<ExtensionType, "pack">;
}

export interface PackDependency extends PackDependencyTarget {
  readonly range: VersionRange;
}

/** Registry facts are independent of the constraint chosen by any one pack. */
export interface PackDependencySnapshot {
  readonly target: PackDependencyTarget;
  readonly exists: boolean;
  readonly visibility: ExtensionVisibility | null;
  readonly lifecycleState: "active" | "unavailable" | null;
  readonly deprecation: DeprecationView | null;
  readonly versions: ReadonlyArray<{
    readonly version: Version;
    readonly status: "available" | "unavailable";
    readonly yanked: boolean;
    readonly purged: boolean;
  }>;
}

export type PackPublicationCandidate =
  | { readonly target: ExtensionFqnParts; readonly kind: "unavailable" }
  | {
      readonly target: ExtensionFqnParts & { readonly version: Version };
      readonly kind: "resolved";
      readonly participation: "publish" | "verified-existing";
      readonly visibility: ExtensionVisibility | null;
    };

/** Findings contain only disclosable domain facts; interfaces own their wording. */
export interface PackDependencyPolicyFinding {
  readonly dependency: PackDependency;
  readonly severity: "error" | "warning";
  readonly reason:
    | "missing"
    | "not-public"
    | "selected-unavailable"
    | "selected-new-private"
    | "selected-existing-private"
    | "lifecycle-unavailable"
    | "no-installable-version"
    | "range-unsatisfied"
    | "deprecated";
  readonly effectiveVisibility?: ExtensionVisibility;
  readonly lifecycle?: "active" | "unavailable";
  readonly deprecation?: DeprecationView;
}

export interface PackDependencyPolicyResult {
  readonly findings: ReadonlyArray<PackDependencyPolicyFinding>;
  readonly resolutions: ReadonlyArray<{
    readonly dependency: PackDependency;
    readonly effectiveVersion: Version;
  }>;
}

const identityKey = (target: ExtensionFqnParts): string =>
  `${target.owner}\u0000${target.type}\u0000${target.name}`;

const disclosedState = (snapshot: PackDependencySnapshot) => ({
  ...(snapshot.visibility === null ? {} : { effectiveVisibility: snapshot.visibility }),
  ...(snapshot.lifecycleState === null ? {} : { lifecycle: snapshot.lifecycleState }),
});

const evaluateDependency = (
  dependency: PackDependency,
  current: PackDependencySnapshot,
  selected: PackPublicationCandidate | undefined,
  packVisibility: ExtensionVisibility,
): PackDependencyPolicyResult => {
  const reject = (
    reason: PackDependencyPolicyFinding["reason"],
    state: ReturnType<typeof disclosedState> = {},
  ): PackDependencyPolicyResult => ({
    findings: [{ dependency, severity: "error", reason, ...state }],
    resolutions: [],
  });
  if (selected?.kind === "unavailable") return reject("selected-unavailable");
  if (packVisibility === "public" && selected?.visibility === "private") {
    return reject(current.exists ? "selected-existing-private" : "selected-new-private", {
      ...disclosedState(current),
      effectiveVisibility: "private",
    });
  }
  const prospective: PackDependencySnapshot =
    selected === undefined
      ? current
      : {
          ...current,
          exists: true,
          visibility: selected.visibility ?? current.visibility,
          lifecycleState: current.exists ? current.lifecycleState : "active",
          versions:
            selected.participation === "publish"
              ? [
                  ...current.versions,
                  {
                    version: selected.target.version,
                    status: "available",
                    yanked: false,
                    purged: false,
                  },
                ]
              : current.versions,
        };
  if (!prospective.exists) return reject("missing");
  if (packVisibility === "public" && prospective.visibility !== "public")
    return reject("not-public");
  const state = disclosedState(prospective);
  if (prospective.lifecycleState !== "active") return reject("lifecycle-unavailable", state);
  const installable = prospective.versions.filter(
    (version) => version.status === "available" && !version.yanked && !version.purged,
  );
  if (installable.length === 0) return reject("no-installable-version", state);
  const effectiveVersion = semver.maxSatisfying(
    installable.map((version) => version.version),
    dependency.range,
  );
  if (effectiveVersion === null) return reject("range-unsatisfied", state);
  return {
    findings:
      prospective.deprecation === null
        ? []
        : [
            {
              dependency,
              severity: "warning",
              reason: "deprecated",
              effectiveVisibility: prospective.visibility === "private" ? "private" : "public",
              lifecycle: "active",
              deprecation: prospective.deprecation,
            },
          ],
    resolutions: [{ dependency, effectiveVersion: decodeVersionSync(effectiveVersion) }],
  };
};

/** Evaluate admission and version selection once against the same prospective facts. */
export const evaluatePackDependencies = (input: {
  readonly packVisibility: ExtensionVisibility;
  readonly dependencies: ReadonlyArray<PackDependency>;
  readonly snapshots: ReadonlyArray<PackDependencySnapshot>;
  readonly candidates?: ReadonlyArray<PackPublicationCandidate>;
}): PackDependencyPolicyResult => {
  const snapshots = new Map(
    input.snapshots.map((snapshot) => [identityKey(snapshot.target), snapshot]),
  );
  const candidates = new Map(
    (input.candidates ?? []).map((candidate) => [identityKey(candidate.target), candidate]),
  );
  const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
  const evaluated = [...input.dependencies]
    .sort(
      (left, right) =>
        compare(formatFqn(left), formatFqn(right)) || compare(left.range, right.range),
    )
    .map((dependency) =>
      evaluateDependency(
        dependency,
        snapshots.get(identityKey(dependency)) ?? {
          target: dependency,
          exists: false,
          visibility: null,
          lifecycleState: null,
          deprecation: null,
          versions: [],
        },
        candidates.get(identityKey(dependency)),
        input.packVisibility,
      ),
    );
  return {
    findings: evaluated.flatMap((result) => result.findings),
    resolutions: evaluated.flatMap((result) => result.resolutions),
  };
};
