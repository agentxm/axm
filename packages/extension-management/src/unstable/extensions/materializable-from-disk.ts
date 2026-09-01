import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { AppError } from "../app-error/index.js";
import { CanonicalPackageProbeFailed } from "./errors.js";
import type { SkillLockEntry } from "../lockfile/index.js";
import type { ConfiguredRecordRow } from "../workspace/read-model-record-rows.js";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { SourceHostConfig } from "../settings/index.js";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import { lockEntryToSourceParams } from "../workspace/lock-entry-to-source-params.js";
import { skillLockEntryToRef } from "../workspace/lock-entry-to-ref.js";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import { resolveWorkspaceExtensionRef } from "../workspace/configured-entry-resolution/workspace-ref.js";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { WorkspaceLayout } from "../workspace/layout.js";
import { enabledConfiguredEntries } from "./configured-entry.js";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { stripFileProtocol } from "../utils/fs-helpers.js";

interface DiskRefEnv {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly baseDir: string;
  readonly scope: WorkspaceScope;
  readonly layout: WorkspaceLayout;
}

interface SkillDiskAcceptedResolutionContext {
  readonly lockEntries: Readonly<Record<string, SkillLockEntry>>;
  readonly getConfiguredSources: () => Effect.Effect<ReadonlyArray<SourceHostConfig>, AppError>;
  readonly getConfiguredSourceByName: (
    name: string,
  ) => Effect.Effect<Option.Option<SourceHostConfig>, AppError>;
}

const isGitHostedLockEntry = (
  entry: SkillLockEntry,
): entry is Exclude<SkillLockEntry, { readonly type: "registry" | "local" }> => {
  switch (entry.type) {
    case "github":
    case "gitlab":
    case "bitbucket":
    case "azurerepos":
    case "git":
      return true;
    case "registry":
    case "local":
      return false;
  }
};

const resolveWorkspaceFromDisk = (
  env: DiskRefEnv,
  settingsName: string,
  source: string,
  expectedType: "skill" | "mcp-server" | "subagent" | "pack",
) =>
  resolveWorkspaceExtensionRef({
    settingsName,
    source,
    expectedType,
    layout: env.layout,
    scope: env.scope,
  }).pipe(
    Effect.provideService(FileSystem.FileSystem, env.fs),
    Effect.provideService(Path.Path, env.path),
  );

export const configuredSkillsToDiskRefs = (
  env: DiskRefEnv,
  configured: Readonly<Record<string, ConfiguredRecordRow>>,
  accepted?: SkillDiskAcceptedResolutionContext,
): Effect.Effect<ReadonlyArray<SkillExtensionRef>, AppError | CanonicalPackageProbeFailed> =>
  Effect.forEach(
    enabledConfiguredEntries(configured),
    ([settingsName, entry]) => {
      if (entry.origin === "bundled") {
        const owner = decodeHandleSync("@agentxm");
        const packageName = decodeExtensionNameSync(settingsName);
        const packageRoot = env.path.join(
          env.layout.acquiredRoot,
          "agentxm",
          owner,
          "skills",
          settingsName,
        );
        return resolveWorkspaceExtensionRef({
          settingsName,
          source: "workspace",
          expectedType: "skill",
          layout: env.layout,
          scope: env.scope,
          staticPackage: {
            owner,
            name: packageName,
            root: packageRoot,
          },
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, env.fs),
          Effect.provideService(Path.Path, env.path),
          Effect.map((ref) =>
            ref.type === "skill" ? Option.some(ref) : Option.none<SkillExtensionRef>(),
          ),
        );
      }
      if (entry.source !== undefined && isWorkspaceSourceLocator(entry.source)) {
        return resolveWorkspaceFromDisk(env, settingsName, entry.source, "skill").pipe(
          Effect.map((ref) =>
            ref.type === "skill" ? Option.some(ref) : Option.none<SkillExtensionRef>(),
          ),
        );
      }
      if (accepted === undefined) return Effect.succeed(Option.none<SkillExtensionRef>());

      const lockEntry = accepted.lockEntries[settingsName];
      if (
        lockEntry === undefined ||
        !isGitHostedLockEntry(lockEntry) ||
        printSourceParams(lockEntryToSourceParams(lockEntry)) !== entry.source
      ) {
        return Effect.succeed(Option.none<SkillExtensionRef>());
      }

      return skillLockEntryToRef(settingsName, lockEntry, {
        baseDir: env.baseDir,
        path: env.path,
        scope: env.scope,
        getConfiguredSourceByName: accepted.getConfiguredSourceByName,
      }).pipe(
        Effect.flatMap((ref) => {
          if (ref.refType !== "git-hosted") {
            return Effect.succeed(Option.none<SkillExtensionRef>());
          }
          const skillFile = env.path.join(
            stripFileProtocol(ref.location),
            ...(ref.portable === true ? [] : ["src"]),
            "SKILL.md",
          );
          return env.fs.exists(skillFile).pipe(
            Effect.mapError(
              (cause) =>
                new CanonicalPackageProbeFailed({
                  detail: `Failed to inspect canonical skill content for "${settingsName}"`,
                  cause,
                }),
            ),
            Effect.map((exists) => (exists ? Option.some(ref) : Option.none<SkillExtensionRef>())),
          );
        }),
      );
    },
    { concurrency: "unbounded" },
  ).pipe(Effect.map((refs) => refs.filter(Option.isSome).map((ref) => ref.value)));

export const configuredMcpServersToDiskRefs = (
  env: DiskRefEnv,
  configured: Readonly<Record<string, ConfiguredRecordRow>>,
): Effect.Effect<ReadonlyArray<McpServerExtensionRef>, AppError> =>
  Effect.forEach(
    enabledConfiguredEntries(configured),
    ([settingsName, entry]) =>
      entry.source !== undefined && isWorkspaceSourceLocator(entry.source)
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
      entry.source !== undefined && isWorkspaceSourceLocator(entry.source)
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
    enabledConfiguredEntries(configured),
    ([settingsName, entry]) =>
      entry.source !== undefined && isWorkspaceSourceLocator(entry.source)
        ? resolveWorkspaceFromDisk(env, settingsName, entry.source, "pack").pipe(
            Effect.map((ref) => (ref.type === "pack" ? Option.some(ref) : Option.none<PackRef>())),
          )
        : Effect.succeed(Option.none<PackRef>()),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((refs) => refs.filter(Option.isSome).map((ref) => ref.value)));
