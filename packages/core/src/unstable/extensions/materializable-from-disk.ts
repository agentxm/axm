import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import type { CommandExtensionRef } from "../commands/refs.js";
import type { SkillLockEntry } from "../lockfile/index.js";
import type { ConfiguredRecordRow } from "../workspace/read-model-record-rows.js";
import type { McpServerExtensionRef } from "../mcps/refs.js";
import type { PackRef } from "../packs/refs.js";
import type { SourceHostConfig } from "../settings/index.js";
import type { SkillExtensionRef } from "../skills/refs.js";
import {
  lockEntryToSourceParams,
  printSourceParams,
  skillLockEntryToRef,
} from "../sources/index.js";
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

interface SkillDiskTrustContext {
  readonly lockEntries: Readonly<Record<string, SkillLockEntry>>;
  readonly getConfiguredSources: () => Effect.Effect<ReadonlyArray<SourceHostConfig>, AppError>;
  readonly getConfiguredSourceByName: (
    name: string,
  ) => Effect.Effect<Option.Option<SourceHostConfig>, AppError>;
}

const isGitHostedLockEntry = (
  entry: SkillLockEntry,
): entry is Exclude<
  SkillLockEntry,
  { readonly type: "registry" | "local" | "inline" | "workspace" }
> => {
  switch (entry.type) {
    case "github":
    case "gitlab":
    case "bitbucket":
    case "azurerepos":
    case "git":
      return true;
    case "registry":
    case "local":
    case "workspace":
      return false;
  }
};

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
  configured: Readonly<Record<string, ConfiguredRecordRow>>,
  trust?: SkillDiskTrustContext,
): Effect.Effect<ReadonlyArray<SkillExtensionRef>, AppError> =>
  Effect.forEach(
    enabledConfiguredEntries(configured),
    ([settingsName, entry]) => {
      if (isWorkspaceSourceLocator(entry.source)) {
        return resolveWorkspaceFromDisk(env, settingsName, entry.source, "skill").pipe(
          Effect.map((ref) =>
            ref.type === "skill" ? Option.some(ref) : Option.none<SkillExtensionRef>(),
          ),
        );
      }
      if (trust === undefined) return Effect.succeed(Option.none<SkillExtensionRef>());

      const lockEntry = trust.lockEntries[settingsName];
      if (
        lockEntry === undefined ||
        !isGitHostedLockEntry(lockEntry) ||
        printSourceParams(lockEntryToSourceParams(lockEntry)) !== entry.source
      ) {
        return Effect.succeed(Option.none<SkillExtensionRef>());
      }

      const skillFile = env.path.join(
        env.baseDir,
        ".axm",
        "extensions",
        "external",
        "skills",
        settingsName,
        "SKILL.md",
      );
      return env.fs.exists(skillFile).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            detail: `Failed to inspect canonical skill content for "${settingsName}"`,
            cause,
          }),
        ),
        Effect.flatMap((exists) =>
          exists
            ? skillLockEntryToRef(settingsName, lockEntry, {
                baseDir: env.baseDir,
                path: env.path,
                scope: env.scope,
                getConfiguredSources: trust.getConfiguredSources,
                getConfiguredSourceByName: trust.getConfiguredSourceByName,
              }).pipe(
                Effect.map((ref) =>
                  ref.refType === "git-hosted"
                    ? Option.some(ref)
                    : Option.none<SkillExtensionRef>(),
                ),
              )
            : Effect.succeed(Option.none<SkillExtensionRef>()),
        ),
      );
    },
    { concurrency: "unbounded" },
  ).pipe(Effect.map((refs) => refs.filter(Option.isSome).map((ref) => ref.value)));

export const configuredCommandsToDiskRefs = (
  env: DiskRefEnv,
  configured: Readonly<Record<string, ConfiguredRecordRow>>,
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
  configured: Readonly<Record<string, ConfiguredRecordRow>>,
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
  configured: Readonly<Record<string, ConfiguredRecordRow>>,
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
  configured: Readonly<Record<string, ConfiguredRecordRow>>,
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
