/** Ownership-safe handler for the single `axm prune` surface. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/client-core/unstable/extensions";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  hasAxmManagedMarker,
  WorkspaceMutations,
  unmanagedRowsByName,
} from "@agentxm/client-core/unstable/workspace";
import { expandGlobs } from "@agentxm/client-core/unstable/utils";
import { pruneManagedMcpServersForAgent } from "@agentxm/client-core/unstable/agents";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { emitAppliedPlanOutcome } from "../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";

export interface RootPruneHandlerArgs {
  readonly patterns: ReadonlyArray<string>;
}

export interface RootPruneHandlerFlags {
  readonly yes: boolean;
}

type Ownership =
  | { readonly kind: "axm"; readonly evidence: string }
  | { readonly kind: "unknown"; readonly evidence: string };

interface PruneCandidate {
  readonly key: string;
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly location: string;
  readonly ownership: Ownership;
  readonly remove: Effect.Effect<void, AppError>;
}

const isWithin = (path: Path.Path, parent: string, child: string): boolean => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const inspectPathOwnership = Effect.fn("RootPrune.inspectOwnership")(function* (location: string) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const absolute = path.resolve(ws.baseDir, location);
  const canonicalRoot = path.resolve(ws.baseDir, ".axm", "extensions");

  if (absolute !== canonicalRoot && isWithin(path, canonicalRoot, absolute)) {
    return {
      kind: "axm",
      evidence: `canonical-extension-path:${path.relative(ws.baseDir, absolute)}`,
    } as const;
  }

  if (!isWithin(path, ws.baseDir, absolute)) {
    return { kind: "unknown", evidence: `path-outside-workspace:${location}` } as const;
  }

  const link = yield* fs.readLink(absolute).pipe(Effect.option);
  if (Option.isSome(link)) {
    const target = path.resolve(path.dirname(absolute), link.value);
    return isWithin(path, canonicalRoot, target)
      ? ({ kind: "axm", evidence: `symlink-target:${path.relative(ws.baseDir, target)}` } as const)
      : ({ kind: "unknown", evidence: `symlink-target-outside-axm:${link.value}` } as const);
  }

  const stat = yield* fs.stat(absolute).pipe(Effect.option);
  if (Option.isNone(stat)) {
    return { kind: "unknown", evidence: "path-missing" } as const;
  }

  const markerPath = stat.value.type === "Directory" ? path.join(absolute, "SKILL.md") : absolute;
  const content = yield* fs.readFileString(markerPath).pipe(Effect.catch(() => Effect.succeed("")));
  return hasAxmManagedMarker(content)
    ? ({
        kind: "axm",
        evidence: `managed-marker:${path.relative(ws.baseDir, markerPath)}`,
      } as const)
    : ({ kind: "unknown", evidence: "no-axm-ownership-marker" } as const);
});

const pathCandidate = Effect.fn("RootPrune.pathCandidate")(function* (
  type: InstallableExtensionType,
  name: string,
  location: string,
  recordedEvidence: ReadonlyArray<string>,
  agents: ReadonlyArray<string>,
  desiredMcpNames: ReadonlySet<string>,
) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const managedMcpEntry = type === "mcp-server" && recordedEvidence.includes("x-axm:managed-entry");
  const ownership: Ownership =
    managedMcpEntry && agents.length > 0
      ? { kind: "axm", evidence: "x-axm:managed-entry" }
      : yield* inspectPathOwnership(location);
  const absolute = path.resolve(ws.baseDir, location);
  const remove =
    managedMcpEntry && agents.length > 0
      ? Effect.forEach(
          agents,
          (agent) =>
            pruneManagedMcpServersForAgent(agent, {
              workspaceRoot: ws.baseDir,
              declaredServerNames: desiredMcpNames,
              scope: ws.scope,
            }),
          { discard: true },
        ).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        )
      : ownership.kind === "axm"
        ? fs.remove(absolute, { recursive: true }).pipe(
            Effect.mapError((cause) =>
              makeAppError({
                code: "internal",
                detail: `Failed to prune AXM-owned artifact at ${location}`,
                cause,
              }),
            ),
          )
        : Effect.void;
  return {
    key: `path:${type}:${name}:${location}`,
    type,
    name,
    location,
    ownership,
    remove,
  } satisfies PruneCandidate;
});

const collectObservedCandidates = Effect.fn("RootPrune.collectObserved")(function* (
  patterns: ReadonlyArray<string>,
) {
  const ws = yield* WorkspaceMutations;
  const graph = yield* ws.getDesiredStateGraph();
  const desiredMcpNames = new Set(
    graph.nodes.filter((node) => node.type === "mcp-server").map((node) => node.name),
  );
  const rowsByType = yield* Effect.forEach(
    installableExtensionTypes,
    (type) => ws.records.rows(type).pipe(Effect.map((rows) => [type, rows] as const)),
    { concurrency: "unbounded" },
  );

  const observed = rowsByType.flatMap(([type, rows]) => {
    const unmanaged = unmanagedRowsByName(rows);
    return Object.entries(unmanaged).flatMap(([name, row]) =>
      row.locations.map((location) => ({
        type,
        name,
        location,
        recordedEvidence: row.ownershipEvidence,
        agents: row.agents,
      })),
    );
  });
  const observedNames = [...new Set(observed.map((candidate) => candidate.name))];
  const matchedNames =
    patterns.length === 0 ? new Set(observedNames) : new Set(expandGlobs(patterns, observedNames));

  for (const candidate of observed) {
    if (candidate.type === "mcp-server" && !matchedNames.has(candidate.name)) {
      desiredMcpNames.add(candidate.name);
    }
  }

  return yield* Effect.forEach(
    observed.filter((candidate) => matchedNames.has(candidate.name)),
    ({ type, name, location, recordedEvidence, agents }) =>
      pathCandidate(type, name, location, recordedEvidence, agents, desiredMcpNames),
    { concurrency: "unbounded" },
  );
});

const staleLockCandidates = (
  type: InstallableExtensionType,
  entries: Readonly<Record<string, unknown>>,
  desired: ReadonlySet<string>,
  remove: (name: string) => Effect.Effect<void, AppError>,
): ReadonlyArray<PruneCandidate> =>
  Object.keys(entries)
    .filter((name) => !desired.has(`${type}:${name}`))
    .map((name) => ({
      key: `lock:${type}:${name}`,
      type,
      name,
      location: ".axm/axm-lock.yaml",
      ownership: { kind: "axm", evidence: "stale-lock:not-in-desired-state" },
      remove: remove(name),
    }));

const collectStateCandidates = Effect.fn("RootPrune.collectState")(function* () {
  const ws = yield* WorkspaceMutations;
  const graph = yield* ws.getDesiredStateGraph();
  if (!graph.complete) {
    return yield* makeAppError({
      code: "conflict",
      detail: "Cannot prune while the desired extension graph is incomplete",
      recover: "Resolve the reported pack or desired-state problems before pruning again",
      cause: graph.problems,
    });
  }

  const desired = new Set(graph.nodes.map((node) => `${node.type}:${node.name}`));
  const [skills, commands, mcpServers, subagents, packs, files, rules, hooks, knowledge] =
    yield* Effect.all(
      [
        ws.getLockedSkills(),
        ws.getLockedCommands(),
        ws.getLockedMcpServers(),
        ws.getLockedSubagents(),
        ws.getLockedPacks(),
        ws.getLockedFiles(),
        ws.getLockedRules(),
        ws.getLockedHooks(),
        ws.getLockedKnowledge(),
      ],
      { concurrency: "unbounded" },
    );
  const lockCandidates: ReadonlyArray<PruneCandidate> = [
    ...staleLockCandidates("skill", skills, desired, ws.removeSkillLock),
    ...staleLockCandidates("command", commands, desired, ws.removeCommandLock),
    ...staleLockCandidates("mcp-server", mcpServers, desired, ws.removeMcpServerLock),
    ...staleLockCandidates("subagent", subagents, desired, ws.removeSubagentLock),
    ...staleLockCandidates("pack", packs, desired, ws.removePackLock),
    ...staleLockCandidates("files", files, desired, ws.removeFilesLock),
    ...staleLockCandidates("rule", rules, desired, ws.removeRuleLock),
    ...staleLockCandidates("hook", hooks, desired, ws.removeHookLock),
    ...staleLockCandidates("knowledge", knowledge, desired, ws.removeKnowledgeLock),
  ];

  const trust = yield* ws.getTrustState();
  const trustCandidates = Object.values(trust.records)
    .filter((record) => !desired.has(`${record.extensionType}:${record.name}`))
    .map((record): PruneCandidate => ({
      key: `trust:${record.extensionType}:${record.name}`,
      type: record.extensionType,
      name: record.name,
      location: ".axm/trust.json",
      ownership: { kind: "axm", evidence: "stale-trust:not-in-desired-state" },
      remove: ws.removeTrustRecord(record.extensionType, record.name),
    }));
  return [...lockCandidates, ...trustCandidates];
});

export const collectPruneCandidates = Effect.fn("RootPrune.collect")(function* (
  patterns: ReadonlyArray<string>,
) {
  const observedCandidates = yield* collectObservedCandidates(patterns);
  const stateCandidates = yield* collectStateCandidates();
  const stateNames = [...new Set(stateCandidates.map((candidate) => candidate.name))];
  const matchedStateNames =
    patterns.length === 0 ? new Set(stateNames) : new Set(expandGlobs(patterns, stateNames));
  return [
    ...observedCandidates,
    ...stateCandidates.filter((candidate) => matchedStateNames.has(candidate.name)),
  ];
});

const candidateArtifact = (
  candidate: PruneCandidate,
  scope: "project" | "user",
  change: "removed" | "unchanged",
) =>
  ({
    path: candidate.location,
    scope,
    change,
    source: {
      type: candidate.type,
      origin: candidate.ownership.evidence,
      ref: candidate.name,
    },
  }) as const;

export const makeRootPrunePlan = (
  candidates: ReadonlyArray<PruneCandidate>,
  scope: "project" | "user",
): Plan => ({
  _tag: "Plan",
  name: "Prune AXM-owned state",
  description: Option.some(
    "Remove stale state and ownership-proven artifacts. Unknown or unowned targets are reported and retained.",
  ),
  jobs: [
    {
      concurrency: 1,
      steps: candidates.map<PlannedJobStep>((candidate) => {
        const label = `${candidate.type}:${candidate.name} — ${candidate.ownership.evidence}`;
        if (candidate.ownership.kind === "unknown") {
          const warning = `Retained ${candidate.location}: AXM ownership is not proven`;
          return {
            key: candidate.key,
            readiness: "warn",
            warnMessage: warning,
            label,
            artifact: candidateArtifact(candidate, scope, "unchanged"),
            run: Effect.succeed({
              result: "success",
              message: warning,
              artifact: candidateArtifact(candidate, scope, "unchanged"),
            } satisfies JobStepResult),
          };
        }
        return {
          key: candidate.key,
          readiness: "ready",
          label,
          artifact: candidateArtifact(candidate, scope, "removed"),
          run: candidate.remove.pipe(
            Effect.as({
              result: "success",
              message: `Pruned ${candidate.type}:${candidate.name} (${candidate.ownership.evidence})`,
              artifact: candidateArtifact(candidate, scope, "removed"),
            } satisfies JobStepResult),
          ),
        };
      }),
    },
  ],
});

export const handleRootPrune = Effect.fn("RootPrune.handle")(function* (
  args: RootPruneHandlerArgs,
  flags: RootPruneHandlerFlags,
) {
  const ws = yield* WorkspaceMutations;
  const candidates = yield* collectPruneCandidates(args.patterns);
  if (candidates.length === 0) {
    yield* emitNoOpOutcome("prune", {
      planName: "Prune AXM-owned state",
      message: "No stale or unmanaged state found.",
      withoutSuggestions: true,
    });
    return;
  }

  const resolution = yield* previewOrApplyPlan(makeRootPrunePlan(candidates, ws.scope), {
    yes: flags.yes,
    preview: !flags.yes,
    displayApplied: false,
  });
  yield* emitAppliedPlanOutcome({
    command: "prune",
    headline: "Pruned ownership-proven AXM state; retained unowned targets.",
    resolution,
    suggestions: [],
  });
});
