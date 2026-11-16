import * as crypto from "node:crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  GitDirectoryComparison,
  type GitDirectoryComparisonService,
  type GitDirectoryDifference,
  type GitOperationFailed,
} from "@agentxm/workspace-kernel/sources";
import type { PlanRiskCondition } from "@agentxm/workspace-kernel/operations";
import type { ArchivePlan } from "./archive.js";
import type { ResolvedFileSelection } from "@agentxm/workspace-kernel/acquisition";

const PUBLIC_DIFFERENCE_LIMIT = 50;

interface PublishSourceDifference {
  readonly path: string;
  readonly change: "added" | "modified" | "deleted";
}

export interface PublishSourceState {
  readonly basis: "git-head";
  readonly status: "matches-head" | "differs-from-head" | "no-head";
  readonly revision?: string;
  readonly directory: string;
  readonly differences: ReadonlyArray<PublishSourceDifference>;
  readonly differenceCount: number;
  readonly truncated: boolean;
}

export interface PublishSourceAssessment {
  /** Complete identity used to reject source evidence that changed after planning. */
  readonly fingerprint: string;
  /** Omitted when the package is not contained in a Git worktree. */
  readonly state?: PublishSourceState;
}

const sourceFingerprint = (value: unknown): string =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const publicDifferences = (
  differences: ReadonlyArray<GitDirectoryDifference>,
): ReadonlyArray<PublishSourceDifference> =>
  differences.slice(0, PUBLIC_DIFFERENCE_LIMIT).map(({ path, change }) => ({ path, change }));

type RepositoryHead = NonNullable<
  NonNullable<Parameters<GitDirectoryComparisonService["compare"]>[0]["repository"]>["head"]
>;

/**
 * The repository HEAD facts one sequential pass of source assessments has
 * observed, by repository root. The pass that makes it owns it and drops it
 * when its last assessment settles; a comparison that fails records nothing.
 */
export const makeRepositoryHeads = () => {
  const heads = new Map<string, RepositoryHead>();
  return {
    get: (root: string) => heads.get(root),
    record: (root: string, head: RepositoryHead) => void heads.set(root, head),
  };
};

/** Assess only source differences that can change the filtered Registry archive. */
export const assessPublishSourceState = (args: {
  readonly directory: string;
  readonly archivePlan: ArchivePlan;
  readonly selection: ResolvedFileSelection;
  /** A generated envelope prefixes payload paths but is not upstream source. */
  readonly payloadPrefix?: string;
  /** The Git root the same preparation's walk from `directory` found. */
  readonly repositoryRoot?: Option.Option<string>;
  /** HEAD facts earlier assessments of the same pass observed. */
  readonly repositoryHeads?: ReturnType<typeof makeRepositoryHeads>;
}): Effect.Effect<PublishSourceAssessment, GitOperationFailed, GitDirectoryComparison> =>
  Effect.gen(function* () {
    const git = yield* GitDirectoryComparison;
    const currentPaths = [...args.archivePlan.included, ...args.archivePlan.excluded]
      .flatMap(({ path }) =>
        args.payloadPrefix === undefined
          ? [path]
          : path.startsWith(args.payloadPrefix)
            ? [path.slice(args.payloadPrefix.length)]
            : [],
      )
      .sort((left, right) => left.localeCompare(right));
    const root = args.repositoryRoot;
    const head =
      root === undefined || Option.isNone(root) ? undefined : args.repositoryHeads?.get(root.value);
    const comparison = yield* git.compare({
      directory: args.directory,
      currentPaths,
      ...(root === undefined
        ? {}
        : { repository: { root, ...(head === undefined ? {} : { head }) } }),
    });
    if (Option.isSome(comparison) && comparison.value.head !== undefined)
      args.repositoryHeads?.record(comparison.value.repositoryRoot, comparison.value.head);
    if (Option.isNone(comparison)) {
      return { fingerprint: sourceFingerprint({ status: "outside-git" }) };
    }

    const materialDifferences = comparison.value.differences.filter(
      ({ path, headKind, workingKind }) =>
        [headKind, workingKind].some(
          (kind) =>
            kind !== undefined &&
            args.selection.evaluate({ path: path.replace(/\/$/, ""), kind }).included,
        ) ||
        (headKind === undefined &&
          workingKind === undefined &&
          args.selection.evaluate({
            path: path.replace(/\/$/, ""),
            kind: path.endsWith("/") ? "directory" : "file",
          }).included),
    );
    const status =
      comparison.value.headRevision === undefined
        ? "no-head"
        : materialDifferences.length === 0
          ? "matches-head"
          : "differs-from-head";
    const state: PublishSourceState = {
      basis: "git-head",
      status,
      ...(comparison.value.headRevision === undefined
        ? {}
        : { revision: comparison.value.headRevision }),
      directory: comparison.value.repositoryDirectory,
      differences: publicDifferences(materialDifferences),
      differenceCount: materialDifferences.length,
      truncated: materialDifferences.length > PUBLIC_DIFFERENCE_LIMIT,
    };
    return {
      state,
      fingerprint: sourceFingerprint({
        state,
        differences: materialDifferences,
      }),
    };
  });

export const publishSourceRiskCondition = (
  fqn: string,
  state: PublishSourceState | undefined,
): PlanRiskCondition | undefined => {
  if (state === undefined || state.status === "matches-head") return undefined;
  const detail =
    state.status === "no-head"
      ? `${fqn} is inside a Git worktree with no HEAD commit.`
      : `${fqn} has ${state.differenceCount} Registry archive ${state.differenceCount === 1 ? "path" : "paths"} not represented by Git HEAD ${state.revision ?? "unknown"}.`;
  return {
    level: "override-required",
    id: `publish/archive-not-at-head:${fqn}`,
    policy: "accept-warnings",
    requiredFlag: "--accept-warnings",
    detail,
  };
};
