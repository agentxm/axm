/**
 * Desired-state writer: the coupled settings-and-lockfile mutations that
 * declare or undeclare one extension in the selected scope. Declaring writes
 * the desired entry and records its accepted resolution together;
 * undeclaring removes both. The per-type shapes differ where the schemas
 * do — Packs keep their enabled flag, MCP servers keep env and enabled and
 * are keyed by resolution identity, Knowledge keeps its instruction entry —
 * and each family's semantics are preserved here exactly.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type * as Semaphore from "effect/Semaphore";

import { decodeExtensionNameSync, formatFqn } from "@agentxm/extension-model/unstable/extensions";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import { commitLockfileSnapshotUpdateAtPath } from "../lockfile/index.js";
import type { HookLockEntry, Lockfile, RuleLockEntry } from "../lockfile/schema.js";
import {
  writeSettingsAtPath,
  type HookEntry,
  type RuleEntry,
  type Settings,
  type SkillEntry,
  type SubagentEntry,
} from "../settings/index.js";
import {
  lockEntrySemanticallyEqual,
  preserveAcceptedResolutionOnNoop,
  stableCompare,
} from "./accepted-resolution-writer.js";
import { DesiredStateReader, type DesiredStateReaderService } from "./desired-state-reader.js";
import { lockEntries, settingsEntries, type EntriesAccessor } from "./entry-accessors.js";
import { lockEntryToSourceParams } from "./lock-entry-to-source-params.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";
import type {
  SetHookArgs,
  SetKnowledgeArgs,
  SetMcpServerArgs,
  SetPackArgs,
  SetRuleArgs,
  SetSkillArgs,
  SetSubagentArgs,
  WorkspaceStateMutationFailure,
} from "./service-interface.js";
import { WorkspaceStateShared } from "./shared.js";
import { readLockfileCell, readSettingsOrDefault } from "./state-cells.js";

/** The declaration each installable extension type accepts. */
export interface DeclareArgsByType {
  readonly skill: SetSkillArgs;
  readonly pack: SetPackArgs;
  readonly "mcp-server": SetMcpServerArgs;
  readonly subagent: SetSubagentArgs;
  readonly rule: SetRuleArgs;
  readonly hook: SetHookArgs;
  readonly knowledge: SetKnowledgeArgs;
}

type Write = Effect.Effect<void, WorkspaceStateMutationFailure, FileSystem.FileSystem | Path.Path>;

export interface DesiredStateWriterService {
  /** Declare the extension in settings and record its accepted resolution. */
  readonly declare: <T extends InstallableExtensionType>(
    type: T,
    args: DeclareArgsByType[T],
  ) => Write;
  /** Remove the extension from settings and its accepted resolution. No-op when absent. */
  readonly undeclare: (type: InstallableExtensionType, name: string) => Write;
}

export class DesiredStateWriter extends ServiceMap.Service<
  DesiredStateWriter,
  DesiredStateWriterService
>()("@agentxm/workspace-state/DesiredStateWriter") {}

/** The settings source locator a Registry resolution is declared under. */
const registryLocator = (
  sourceName: string,
  fqn: string,
  versionRange: Option.Option<string>,
): string => `${sourceName}:${Option.isSome(versionRange) ? `${fqn}@${versionRange.value}` : fqn}`;

export const makeDesiredStateWriter = (
  location: WorkspaceLocationService,
  desiredState: DesiredStateReaderService,
  mutex: Semaphore.Semaphore,
): DesiredStateWriterService => {
  const settings = readSettingsOrDefault(location, location.runtimeDir);
  const lockfile = readLockfileCell(location, location.runtimeDir);
  const writeSettings = (next: Settings) => writeSettingsAtPath(location.settingsPath, next);
  const commit = (base: Lockfile, next: Lockfile) =>
    commitLockfileSnapshotUpdateAtPath(location.lockPath, base, next);
  const serialized = mutex.withPermits(1);

  /** Declare a sourced entry then record the resolution, always writing both. */
  const declareSourced = <SettingsEntry, LockEntry extends RuleLockEntry | HookLockEntry>(
    type: "rule" | "hook",
    configured: EntriesAccessor<Settings, SettingsEntry>,
    accepted: EntriesAccessor<Lockfile, LockEntry>,
    makeEntry: (source: string) => SettingsEntry,
    name: string,
    lockEntry: LockEntry,
    versionRange: Option.Option<string>,
  ): Write =>
    Effect.gen(function* () {
      const source =
        lockEntry.type === "registry"
          ? registryLocator(
              lockEntry.sourceName,
              formatFqn({ owner: lockEntry.owner, type, name: decodeExtensionNameSync(name) }),
              versionRange,
            )
          : printSourceParams(lockEntryToSourceParams(lockEntry));
      yield* writeSettings(configured.set(yield* settings, name, makeEntry(source)));
      const current = yield* lockfile;
      const previous = accepted.entries(current)[name];
      yield* commit(
        current,
        accepted.set(current, name, preserveAcceptedResolutionOnNoop(previous, lockEntry)),
      );
    });

  const declareSkill = ({ name, lockEntry, versionRange }: SetSkillArgs): Write =>
    Effect.gen(function* () {
      const source =
        lockEntry.type === "registry"
          ? registryLocator(
              lockEntry.sourceName,
              formatFqn({
                owner: lockEntry.owner,
                type: "skill",
                name: decodeExtensionNameSync(name),
              }),
              versionRange,
            )
          : printSourceParams(lockEntryToSourceParams(lockEntry));
      const current = yield* settings;
      const nextEntry: SkillEntry = { source, enabled: true };
      const currentLockfile = yield* lockfile;
      const currentLockEntry = currentLockfile.skills[name];
      if (!stableCompare(settingsEntries.skill.entries(current)[name], nextEntry)) {
        yield* writeSettings(settingsEntries.skill.set(current, name, nextEntry));
      }
      if (lockEntrySemanticallyEqual(currentLockEntry, lockEntry)) return;
      yield* commit(
        currentLockfile,
        lockEntries.skill.set(
          currentLockfile,
          name,
          preserveAcceptedResolutionOnNoop(currentLockEntry, lockEntry),
        ),
      );
    });

  const declareSubagent = ({ name, lockEntry, versionRange }: SetSubagentArgs): Write =>
    Effect.gen(function* () {
      const source =
        lockEntry.type === "registry"
          ? registryLocator(
              lockEntry.sourceName,
              formatFqn({
                owner: lockEntry.owner,
                type: "subagent",
                name: decodeExtensionNameSync(name),
              }),
              versionRange,
            )
          : printSourceParams(lockEntryToSourceParams(lockEntry));
      const current = yield* settings;
      const nextEntry: SubagentEntry = { source, enabled: true };
      const currentLockfile = yield* lockfile;
      const currentLockEntry = lockEntries.subagent.entries(currentLockfile)[name];
      if (!stableCompare(settingsEntries.subagent.entries(current)[name], nextEntry)) {
        yield* writeSettings(settingsEntries.subagent.set(current, name, nextEntry));
      }
      if (lockEntrySemanticallyEqual(currentLockEntry, lockEntry)) return;
      yield* commit(
        currentLockfile,
        lockEntries.subagent.set(
          currentLockfile,
          name,
          preserveAcceptedResolutionOnNoop(currentLockEntry, lockEntry),
        ),
      );
    });

  const declareKnowledge = ({ name, lockEntry, versionRange }: SetKnowledgeArgs): Write =>
    Effect.gen(function* () {
      const source =
        lockEntry.type === "registry"
          ? registryLocator(
              lockEntry.sourceName,
              formatFqn({
                owner: lockEntry.owner,
                type: "knowledge",
                name: decodeExtensionNameSync(name),
              }),
              versionRange,
            )
          : printSourceParams(lockEntryToSourceParams(lockEntry));
      const current = yield* settings;
      const currentEntry = settingsEntries.knowledge.entries(current)[name];
      yield* writeSettings(
        settingsEntries.knowledge.set(current, name, {
          source,
          enabled: true,
          ...(currentEntry?.instructionEntry === undefined
            ? {}
            : { instructionEntry: currentEntry.instructionEntry }),
        }),
      );
      const currentLockfile = yield* lockfile;
      const previous = lockEntries.knowledge.entries(currentLockfile)[name];
      yield* commit(
        currentLockfile,
        lockEntries.knowledge.set(
          currentLockfile,
          name,
          preserveAcceptedResolutionOnNoop(previous, lockEntry),
        ),
      );
    });

  const declarePack = (args: SetPackArgs): Write =>
    Effect.gen(function* () {
      const { versionRange, ...lockEntry } = args;
      const name = lockEntry.name;
      const source = registryLocator(
        lockEntry.sourceName,
        formatFqn({ owner: args.owner, type: "pack", name: decodeExtensionNameSync(name) }),
        versionRange,
      );
      const current = yield* settings;
      const enabled = settingsEntries.pack.entries(current)[name]?.enabled ?? true;
      yield* writeSettings(settingsEntries.pack.set(current, name, { source, enabled }));
      const currentLockfile = yield* lockfile;
      const previous = lockEntries.pack.entries(currentLockfile)[name];
      yield* commit(
        currentLockfile,
        lockEntries.pack.set(
          currentLockfile,
          name,
          preserveAcceptedResolutionOnNoop(previous, lockEntry),
        ),
      );
    });

  const declareMcpServer = ({
    name,
    resolutionKey,
    lockEntry,
    versionRange,
    env,
    enabled,
  }: SetMcpServerArgs): Write =>
    Effect.gen(function* () {
      const current = yield* settings;
      const existing = settingsEntries["mcp-server"].entries(current)[name];
      yield* writeSettings(
        settingsEntries["mcp-server"].set(current, name, {
          kind: "sourced" as const,
          source:
            lockEntry.type === "registry"
              ? registryLocator(
                  lockEntry.sourceName,
                  formatFqn({ owner: lockEntry.owner, type: "mcp-server", name: lockEntry.name }),
                  versionRange,
                )
              : printSourceParams(lockEntryToSourceParams(lockEntry)),
          enabled: enabled ?? existing?.enabled ?? true,
          env: env ?? existing?.env ?? {},
        }),
      );
      const currentLockfile = yield* lockfile;
      const previous = lockEntries["mcp-server"].entries(currentLockfile)[resolutionKey];
      yield* commit(
        currentLockfile,
        lockEntries["mcp-server"].set(
          currentLockfile,
          resolutionKey,
          preserveAcceptedResolutionOnNoop(previous, lockEntry),
        ),
      );
    });

  const declareByType: {
    readonly [T in InstallableExtensionType]: (args: DeclareArgsByType[T]) => Write;
  } = {
    skill: declareSkill,
    pack: declarePack,
    "mcp-server": declareMcpServer,
    subagent: declareSubagent,
    rule: ({ name, lockEntry, versionRange }) =>
      declareSourced(
        "rule",
        settingsEntries.rule,
        lockEntries.rule,
        (source): RuleEntry => ({ source, enabled: true }),
        name,
        lockEntry,
        versionRange,
      ),
    hook: ({ name, lockEntry, versionRange }) =>
      declareSourced(
        "hook",
        settingsEntries.hook,
        lockEntries.hook,
        (source): HookEntry => ({ source, enabled: true }),
        name,
        lockEntry,
        versionRange,
      ),
    knowledge: declareKnowledge,
  };

  /** Remove both documents' entries, writing each document unconditionally. */
  const undeclareBoth = <T extends "rule" | "hook" | "knowledge">(type: T, name: string): Write =>
    Effect.gen(function* () {
      const current = yield* settings;
      const currentLockfile = yield* lockfile;
      yield* writeSettings(settingsEntries[type].remove(current, name));
      yield* commit(currentLockfile, lockEntries[type].remove(currentLockfile, name));
    });

  /** Remove each document's entry only when present. */
  const undeclarePresent = <T extends "skill" | "subagent">(type: T, name: string): Write =>
    Effect.gen(function* () {
      const current = yield* settings;
      const configured = settingsEntries[type];
      if (configured.entries(current)[name] !== undefined) {
        yield* writeSettings(configured.remove(current, name));
      }
      const currentLockfile = yield* lockfile;
      const accepted = lockEntries[type];
      if (accepted.entries(currentLockfile)[name] !== undefined) {
        yield* commit(currentLockfile, accepted.remove(currentLockfile, name));
      }
    });

  /** A Pack not declared in settings is left alone entirely. */
  const undeclarePack = (name: string): Write =>
    Effect.gen(function* () {
      const current = yield* settings;
      if (Option.isNone(settingsEntries.pack.entry(current, name))) return;
      yield* writeSettings(settingsEntries.pack.remove(current, name));
      const currentLockfile = yield* lockfile;
      if (Option.isSome(lockEntries.pack.entry(currentLockfile, name))) {
        yield* commit(currentLockfile, lockEntries.pack.remove(currentLockfile, name));
      }
    });

  /**
   * An MCP server's accepted resolution is shared by every connection and
   * Pack member that resolves to the same identity; it is removed only when
   * this connection was its last user.
   */
  const undeclareMcpServer = (name: string): Write =>
    Effect.gen(function* () {
      const graph = yield* desiredState.graph();
      const desiredNode = graph.nodes.find(
        (node) => node.type === "mcp-server" && node.name === name,
      );
      const closure =
        desiredNode === undefined || desiredNode.authority === "inline"
          ? undefined
          : graph.mcpSourceClosures.find(
              (candidate) => candidate.identity === desiredNode.identity,
            );
      const current = yield* settings;
      if (Option.isSome(settingsEntries["mcp-server"].entry(current, name))) {
        yield* writeSettings(settingsEntries["mcp-server"].remove(current, name));
      }
      const currentLockfile = yield* lockfile;
      const resolutionKey = desiredNode?.identity;
      const keepSharedResolution =
        closure !== undefined &&
        (closure.localNames.length > 1 || closure.origins.some((origin) => origin.type === "pack"));
      if (
        resolutionKey !== undefined &&
        !keepSharedResolution &&
        Option.isSome(lockEntries["mcp-server"].entry(currentLockfile, resolutionKey))
      ) {
        yield* commit(
          currentLockfile,
          lockEntries["mcp-server"].remove(currentLockfile, resolutionKey),
        );
      }
    });

  const undeclareByType: {
    readonly [T in InstallableExtensionType]: (name: string) => Write;
  } = {
    skill: (name) => undeclarePresent("skill", name),
    pack: undeclarePack,
    "mcp-server": undeclareMcpServer,
    subagent: (name) => undeclarePresent("subagent", name),
    rule: (name) => undeclareBoth("rule", name),
    hook: (name) => undeclareBoth("hook", name),
    knowledge: (name) => undeclareBoth("knowledge", name),
  };

  return {
    declare: (type, args) =>
      serialized(declareByType[type](args)).pipe(Effect.withSpan("DesiredStateWriter.declare")),
    undeclare: (type, name) =>
      serialized(undeclareByType[type](name)).pipe(Effect.withSpan("DesiredStateWriter.undeclare")),
  };
};

export const DesiredStateWriterLive: Layer.Layer<
  DesiredStateWriter,
  never,
  WorkspaceLocation | DesiredStateReader | WorkspaceStateShared
> = Layer.effect(
  DesiredStateWriter,
  Effect.gen(function* () {
    return makeDesiredStateWriter(
      yield* WorkspaceLocation,
      yield* DesiredStateReader,
      (yield* WorkspaceStateShared).mutex,
    );
  }),
);
