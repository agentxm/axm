import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeAppError, type AppError } from "../../app-error/index.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../extensions/constants.js";
import { computePackageContentHash } from "../../extensions/package-hash.js";
import { validatePathSafety } from "../../extensions/utils.js";
import { HookManifestSchema, HOOK_MANIFEST_FILENAME } from "../../hooks/manifest-schema.js";
import type { WorkspaceHookRef } from "../../hooks/refs.js";
import {
  KnowledgeManifestSchema,
  KNOWLEDGE_MANIFEST_FILENAME,
} from "../../knowledge/manifest-schema.js";
import type { WorkspaceKnowledgeRef } from "../../knowledge/refs.js";
import {
  McpServerManifestSchema,
  MCP_SERVER_MANIFEST_FILENAME,
} from "../../mcps/manifest-schema.js";
import type { WorkspaceMcpServerRef } from "../../mcps/refs.js";
import { PackManifestSchema, PACK_MANIFEST_FILENAME } from "../../packs/manifest-schema.js";
import type { WorkspacePackRef } from "../../packs/refs.js";
import { RuleManifestSchema, RULE_MANIFEST_FILENAME } from "../../rules/manifest-schema.js";
import type { WorkspaceRuleRef } from "../../rules/refs.js";
import {
  SkillManifestSchema,
  MANIFEST_FILENAME as SKILL_MANIFEST_FILENAME,
} from "../../skills/manifest-schema.js";
import type { WorkspaceSkillRef } from "../../skills/refs.js";
import { parseInputPattern } from "../../sources/parser.js";
import type { WorkspaceSource } from "../../sources/types.js";
import {
  SubagentManifestSchema,
  MANIFEST_FILENAME as SUBAGENT_MANIFEST_FILENAME,
} from "../../subagents/manifest-schema.js";
import type { WorkspaceSubagentRef } from "../../subagents/refs.js";
import type { ExtensionType } from "../../extensions/common.js";
import type { WorkspaceScope } from "../scope.js";

const WorkspaceManifestSchema = Schema.Union([
  SkillManifestSchema,
  McpServerManifestSchema,
  SubagentManifestSchema,
  RuleManifestSchema,
  HookManifestSchema,
  KnowledgeManifestSchema,
  PackManifestSchema,
]);

type WorkspaceExtensionRef =
  | WorkspaceSkillRef
  | WorkspaceMcpServerRef
  | WorkspaceSubagentRef
  | WorkspaceRuleRef
  | WorkspaceHookRef
  | WorkspaceKnowledgeRef
  | WorkspacePackRef;

const manifestFilename = (type: ExtensionType): string => {
  switch (type) {
    case "skill":
      return SKILL_MANIFEST_FILENAME;
    case "mcp-server":
      return MCP_SERVER_MANIFEST_FILENAME;
    case "subagent":
      return SUBAGENT_MANIFEST_FILENAME;
    case "rule":
      return RULE_MANIFEST_FILENAME;
    case "hook":
      return HOOK_MANIFEST_FILENAME;
    case "knowledge":
      return KNOWLEDGE_MANIFEST_FILENAME;
    case "pack":
      return PACK_MANIFEST_FILENAME;
  }
};

const pluralType = (type: ExtensionType): string => {
  switch (type) {
    case "skill":
      return "skills";
    case "mcp-server":
      return "mcps";
    case "subagent":
      return "subagents";
    case "rule":
      return "rules";
    case "hook":
      return "hooks";
    case "knowledge":
      return "knowledge";
    case "pack":
      return "packs";
  }
};

const workspaceSourceError = (source: string, detail: string, cause?: unknown): AppError =>
  makeAppError({
    code: "validation",
    detail: `Invalid workspace source "${source}": ${detail}`,
    recover: "Restore a valid canonical workspace package or update the settings source.",
    ...(cause === undefined ? {} : { cause }),
  });

export const resolveWorkspaceExtensionRef = (args: {
  readonly settingsName: string;
  readonly source: string;
  readonly expectedType: ExtensionType;
  readonly baseDir: string;
  readonly scope: WorkspaceScope;
}): Effect.Effect<WorkspaceExtensionRef, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const parsed = parseInputPattern(args.source);
    if (Option.isNone(parsed) || parsed.value.pattern.pattern !== "workspace-pattern-input") {
      return yield* workspaceSourceError(args.source, "the locator is malformed");
    }
    const source: WorkspaceSource = {
      type: "workspace",
      owner: parsed.value.pattern.owner,
      extensionType: parsed.value.pattern.type,
      name: parsed.value.pattern.name,
    };
    if (source.extensionType !== args.expectedType || source.name !== args.settingsName) {
      return yield* workspaceSourceError(
        args.source,
        `expected ${args.expectedType} named "${args.settingsName}"`,
      );
    }

    const packageDir = path.join(
      args.baseDir,
      REGISTRY_EXTENSIONS_DIR,
      source.owner,
      pluralType(args.expectedType),
      source.name,
    );
    yield* validatePathSafety(args.baseDir, packageDir);
    const packageExists = yield* fs
      .exists(packageDir)
      .pipe(
        Effect.mapError((cause) =>
          workspaceSourceError(args.source, "the canonical package could not be inspected", cause),
        ),
      );
    if (!packageExists) {
      return yield* workspaceSourceError(
        args.source,
        `the canonical package is missing at ${packageDir}`,
      );
    }

    const manifestPath = path.join(packageDir, manifestFilename(args.expectedType));
    const rawManifest = yield* fs
      .readFileString(manifestPath)
      .pipe(
        Effect.mapError((cause) =>
          workspaceSourceError(
            args.source,
            `the expected manifest is missing at ${manifestPath}`,
            cause,
          ),
        ),
      );
    const json = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(rawManifest).pipe(
      Effect.mapError((cause) =>
        workspaceSourceError(
          args.source,
          `the manifest at ${manifestPath} is not valid JSON`,
          cause,
        ),
      ),
    );
    const manifest = yield* Schema.decodeUnknownEffect(WorkspaceManifestSchema)(json).pipe(
      Effect.mapError((cause) =>
        workspaceSourceError(args.source, `the manifest at ${manifestPath} is invalid`, cause),
      ),
    );
    if (
      manifest.type !== args.expectedType ||
      manifest.owner !== source.owner ||
      manifest.name !== source.name
    ) {
      return yield* workspaceSourceError(
        args.source,
        `manifest identity ${manifest.owner}/${manifest.type}/${manifest.name} does not match the locator`,
      );
    }

    const sourceHash = yield* computePackageContentHash(packageDir);
    const details = {
      source,
      owner: source.owner,
      name: source.name,
      version: manifest.version,
      scope: args.scope,
      location: packageDir,
      sourceHash,
    };

    switch (manifest.type) {
      case "skill":
        return {
          type: "skill",
          refType: "workspace",
          ...details,
          skill: {
            name: manifest.name,
            description: Option.fromUndefinedOr(manifest.description),
            metadata: Option.none(),
          },
        };
      case "mcp-server":
        return {
          type: "mcp-server",
          refType: "workspace",
          ...details,
          server: { name: manifest.name },
        };
      case "subagent":
        return {
          type: "subagent",
          refType: "workspace",
          ...details,
          subagent: {
            name: manifest.name,
            description: Option.fromUndefinedOr(manifest.description),
          },
          ...(manifest.fallback === undefined ? {} : { fallback: manifest.fallback }),
        };
      case "rule":
        return {
          type: "rule",
          refType: "workspace",
          ...details,
          rule: { name: manifest.name },
        };
      case "hook":
        return {
          type: "hook",
          refType: "workspace",
          ...details,
          hook: { name: manifest.name },
          ...(manifest.fallback === undefined ? {} : { fallback: manifest.fallback }),
        };
      case "knowledge":
        return {
          type: "knowledge",
          refType: "workspace",
          ...details,
          knowledge: { name: manifest.name },
        };
      case "pack":
        return {
          type: "pack",
          refType: "workspace",
          ...details,
          pack: { name: manifest.name, dependencies: manifest.dependencies },
        };
    }
  });
