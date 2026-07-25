import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { AppError } from "../app-error/index.js";
import type { CommandExtensionRef } from "../commands/refs.js";
import type {
  ConfiguredExtensionRef,
  ConfiguredSkill,
  ConfiguredSubagent,
} from "../workspace/read-model-record-types.js";
import type { McpServerExtensionRef } from "../mcps/refs.js";
import type { PackRef } from "../packs/refs.js";
import type { SkillExtensionRef } from "../skills/refs.js";
import { isWorkspaceSourceLocator } from "../sources/workspace.js";
import type { SubagentExtensionRef } from "../subagents/refs.js";
import { resolveWorkspaceExtensionRef } from "../workspace/configured-entry-resolution/workspace-ref.js";
import type { WorkspaceScope } from "../workspace/scope.js";
import { enabledConfiguredEntries } from "./configured-entry.js";

interface DiskRefEnv {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly baseDir: string;
  readonly scope: WorkspaceScope;
}

const resolveWorkspaceFromDisk = (
  env: DiskRefEnv,
  settingsName: string,
  source: string,
  expectedType: "skill" | "command" | "mcp-server" | "subagent" | "pack",
) =>
  resolveWorkspaceExtensionRef({
    settingsName,
    source,
    expectedType,
    baseDir: env.baseDir,
    scope: env.scope,
  }).pipe(
    Effect.provideService(FileSystem.FileSystem, env.fs),
    Effect.provideService(Path.Path, env.path),
  );

export const configuredSkillsToDiskRefs = (
  env: DiskRefEnv,
  configured: Readonly<Record<string, ConfiguredSkill>>,
): Effect.Effect<ReadonlyArray<SkillExtensionRef>, AppError> =>
  Effect.forEach(
    enabledConfiguredEntries(configured),
    ([settingsName, entry]) =>
      isWorkspaceSourceLocator(entry.source)
        ? resolveWorkspaceFromDisk(env, settingsName, entry.source, "skill").pipe(
            Effect.map((ref) =>
              ref.type === "skill" ? Option.some(ref) : Option.none<SkillExtensionRef>(),
            ),
          )
        : Effect.succeed(Option.none<SkillExtensionRef>()),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((refs) => refs.filter(Option.isSome).map((ref) => ref.value)));

export const configuredCommandsToDiskRefs = (
  env: DiskRefEnv,
  configured: Readonly<Record<string, ConfiguredExtensionRef & { readonly enabled: boolean }>>,
): Effect.Effect<ReadonlyArray<CommandExtensionRef>, AppError> =>
  Effect.forEach(
    enabledConfiguredEntries(configured),
    ([settingsName, entry]) =>
      isWorkspaceSourceLocator(entry.source)
        ? resolveWorkspaceFromDisk(env, settingsName, entry.source, "command").pipe(
            Effect.map((ref) =>
              ref.type === "command" ? Option.some(ref) : Option.none<CommandExtensionRef>(),
            ),
          )
        : Effect.succeed(Option.none<CommandExtensionRef>()),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((refs) => refs.filter(Option.isSome).map((ref) => ref.value)));

export const configuredMcpServersToDiskRefs = (
  env: DiskRefEnv,
  configured: Readonly<Record<string, ConfiguredExtensionRef>>,
): Effect.Effect<ReadonlyArray<McpServerExtensionRef>, AppError> =>
  Effect.forEach(
    enabledConfiguredEntries(configured),
    ([settingsName, entry]) =>
      isWorkspaceSourceLocator(entry.source)
        ? resolveWorkspaceFromDisk(env, settingsName, entry.source, "mcp-server").pipe(
            Effect.map((ref) =>
              ref.type === "mcp-server" ? Option.some(ref) : Option.none<McpServerExtensionRef>(),
            ),
          )
        : Effect.succeed(Option.none<McpServerExtensionRef>()),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((refs) => refs.filter(Option.isSome).map((ref) => ref.value)));

export const configuredSubagentsToDiskRefs = (
  env: DiskRefEnv,
  configured: Readonly<Record<string, ConfiguredSubagent>>,
): Effect.Effect<ReadonlyArray<SubagentExtensionRef>, AppError> =>
  Effect.forEach(
    enabledConfiguredEntries(configured),
    ([settingsName, entry]) =>
      isWorkspaceSourceLocator(entry.source)
        ? resolveWorkspaceFromDisk(env, settingsName, entry.source, "subagent").pipe(
            Effect.map((ref) =>
              ref.type === "subagent" ? Option.some(ref) : Option.none<SubagentExtensionRef>(),
            ),
          )
        : Effect.succeed(Option.none<SubagentExtensionRef>()),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((refs) => refs.filter(Option.isSome).map((ref) => ref.value)));

export const configuredPacksToDiskRefs = (
  env: DiskRefEnv,
  configured: Readonly<Record<string, ConfiguredExtensionRef>>,
): Effect.Effect<ReadonlyArray<PackRef>, AppError> =>
  Effect.forEach(
    Object.entries(configured),
    ([settingsName, entry]) =>
      isWorkspaceSourceLocator(entry.source)
        ? resolveWorkspaceFromDisk(env, settingsName, entry.source, "pack").pipe(
            Effect.map((ref) => (ref.type === "pack" ? Option.some(ref) : Option.none<PackRef>())),
          )
        : Effect.succeed(Option.none<PackRef>()),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((refs) => refs.filter(Option.isSome).map((ref) => ref.value)));
