/** Reader and policy facts for native artifacts whose writer established ownership. */
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import type { CodingAgent } from "../agent-adapters/index.js";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  resolveNativeEntry,
  resolveNativeReferent,
  readCopiedDirectory,
  combineNativeLocationOutcomes,
  type NativeLocationOutcome,
} from "../locations/index.js";

export const nativeArtifactLocationOutcomes = (args: {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly agents: ReadonlyArray<CodingAgent>;
  readonly configuredAgentIds: ReadonlySet<string>;
  readonly sharedSkillPolicy: boolean;
  readonly targets: ReadonlyArray<{
    readonly path: string;
    readonly kind: "skill" | "subagent";
    readonly state: NativeLocationOutcome["state"];
    readonly sourcePath?: string;
  }>;
}) =>
  Effect.gen(function* () {
    if (args.targets.length === 0) return [];
    const path = yield* Path.Path;
    const shared = args.sharedSkillPolicy
      ? yield* resolveNativeReferent(path.join(args.workspaceRoot, ".agents/skills"))
      : undefined;
    const readers = yield* Effect.forEach(args.agents, (agent) =>
      Effect.forEach(["skill", "subagent"] as const, (kind) =>
        agent
          .resolveNativeReadLocations({
            workspaceRoot: args.workspaceRoot,
            scope: args.scope,
            kind,
          })
          .pipe(
            Effect.flatMap((locations) =>
              Effect.forEach(locations, (location) =>
                resolveNativeReferent(location.path).pipe(
                  Effect.option,
                  Effect.map((physical) =>
                    Option.map(physical, (physical) => ({
                      agentId: agent.id,
                      kind,
                      location,
                      physical,
                    })),
                  ),
                ),
              ),
            ),
          ),
      ).pipe(Effect.map((locations) => locations.flat())),
    ).pipe(
      Effect.map((locations) =>
        locations.flat().flatMap((location) => (Option.isSome(location) ? [location.value] : [])),
      ),
    );
    const stateRank = (state: NativeLocationOutcome["state"]) =>
      state === "created" ? 2 : state === "updated" ? 1 : 0;
    const outcomes = yield* Effect.forEach(
      [...args.targets].sort((left, right) => stateRank(left.state) - stateRank(right.state)),
      (target) =>
        Effect.gen(function* () {
          const lexical = path.resolve(args.workspaceRoot, target.path);
          const address = yield* resolveNativeEntry(lexical);
          const physical =
            target.kind === "skill"
              ? address.entryPath
              : (address.referentPath ?? address.entryPath);
          const parent = path.dirname(physical);
          const claimants = readers.filter(
            (reader) =>
              reader.kind === target.kind &&
              (reader.location.declaration.shape === "file"
                ? reader.physical === physical
                : reader.physical === parent),
          );
          const potentialReaders = [...new Set(claimants.map((reader) => reader.agentId))].sort();
          const aliases = [
            ...new Set([
              lexical,
              ...claimants.map((reader) =>
                reader.location.declaration.shape === "file"
                  ? reader.location.path
                  : path.join(reader.location.path, path.basename(lexical)),
              ),
            ]),
          ].sort();
          const receipt =
            target.kind === "skill" && address.kind === "directory"
              ? yield* readCopiedDirectory(physical)
              : Option.none();
          const source =
            target.sourcePath === undefined
              ? undefined
              : yield* resolveNativeReferent(target.sourcePath);
          const sourceCoincidence = source === address.entryPath;
          const mechanism =
            target.kind === "subagent"
              ? "generated-file"
              : address.kind === "symlink"
                ? "symlink"
                : Option.isSome(receipt)
                  ? "copied-directory"
                  : undefined;
          const ownership =
            address.kind === "absent"
              ? "absent"
              : mechanism !== undefined || sourceCoincidence
                ? "owned"
                : "unverified";
          return {
            scope: args.scope,
            address: { kind: target.kind === "skill" ? "entry" : "file", path: physical },
            aliases,
            configuredConsumers: potentialReaders.filter((id) => args.configuredAgentIds.has(id)),
            potentialReaders,
            policyReasons:
              args.sharedSkillPolicy && target.kind === "skill" && parent === shared
                ? ["workspace-shared-skills"]
                : [],
            ownership,
            ...(ownership === "owned"
              ? {
                  proof: sourceCoincidence
                    ? "canonical-source-coincidence"
                    : mechanism === "symlink"
                      ? "exact-canonical-source-link"
                      : mechanism === "copied-directory"
                        ? "bounded-copy-receipt"
                        : "exact-accepted-managed-file",
                }
              : {}),
            ...(mechanism === undefined ? {} : { mechanism }),
            state: target.state,
            availability: potentialReaders.map((agentId) => ({
              agentId,
              state: "unverified",
              reason:
                "The catalog declares this reader; native runtime path selection was not inspected.",
            })),
          } satisfies NativeLocationOutcome;
        }),
    );
    return combineNativeLocationOutcomes(outcomes);
  });

/** Recheck withdrawn artifacts: bounded retirement can leave user-owned contents. */
export const retiredNativeArtifactLocationOutcomes = (
  previous: ReadonlyArray<NativeLocationOutcome>,
) =>
  Effect.forEach(previous, (before) =>
    Effect.gen(function* () {
      const current = yield* resolveNativeEntry(before.address.path);
      const { proof: _proof, ...facts } = before;
      if (current.kind === "absent")
        return {
          ...facts,
          ownership: "absent",
          state: "removed",
        } satisfies NativeLocationOutcome;
      const receipt =
        before.mechanism === "copied-directory" && current.kind === "directory"
          ? yield* readCopiedDirectory(before.address.path)
          : Option.none();
      if (Option.isSome(receipt))
        return {
          ...facts,
          ownership: "unverified",
          state: "retained",
          reason: "A copied projection remains; its accepted ownership must be checked again.",
        } satisfies NativeLocationOutcome;
      return {
        ...facts,
        ownership:
          before.mechanism === "copied-directory" && current.kind === "directory"
            ? "unowned"
            : "unverified",
        state: "retained",
        reason:
          before.mechanism === "copied-directory" && current.kind === "directory"
            ? "Owned copied contents were withdrawn; user additions or modified entries remain."
            : "The native entry remains and its current ownership was not verified.",
      } satisfies NativeLocationOutcome;
    }),
  );
