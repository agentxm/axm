import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeAppError, type AppError } from "../../app-error/index.js";
import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { computePackageContentHash } from "../package-hash.js";
import { validatePathSafety } from "../../extensions/utils.js";
import {
  HookManifestSchema,
  HOOK_MANIFEST_FILENAME,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import type { WorkspaceHookRef } from "../refs/hook.js";
import {
  KnowledgeManifestSchema,
  KNOWLEDGE_MANIFEST_FILENAME,
} from "@agentxm/extension-model/unstable/knowledge/manifest-schema";
import type { WorkspaceKnowledgeRef } from "../refs/knowledge.js";
import {
  McpServerManifestSchema,
  MCP_SERVER_MANIFEST_FILENAME,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import type { WorkspaceMcpServerRef } from "../refs/mcp-server.js";
import {
  PackManifestSchema,
  PACK_MANIFEST_FILENAME,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import type { WorkspacePackRef } from "../refs/pack.js";
import {
  RuleManifestSchema,
  RULE_MANIFEST_FILENAME,
} from "@agentxm/extension-model/unstable/rules/manifest-schema";
import type { WorkspaceRuleRef } from "../refs/rule.js";
import {
  SkillManifestSchema,
  MANIFEST_FILENAME as SKILL_MANIFEST_FILENAME,
} from "@agentxm/extension-model/unstable/skills/manifest-schema";
import type { WorkspaceSkillRef } from "../refs/skill.js";
import type { WorkspaceSource } from "@agentxm/extension-model/unstable/sources/types";
import {
  SubagentManifestSchema,
  MANIFEST_FILENAME as SUBAGENT_MANIFEST_FILENAME,
} from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import type { WorkspaceSubagentRef } from "../refs/subagent.js";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { WorkspaceScope } from "../scope.js";
import type { WorkspaceLayout } from "../layout.js";

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
  readonly layout: WorkspaceLayout;
  readonly scope: WorkspaceScope;
  readonly staticPackage?: {
    readonly owner: Handle;
    readonly name: ExtensionName;
    readonly root: string;
  };
}): Effect.Effect<WorkspaceExtensionRef, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (args.source !== "workspace") {
      return yield* workspaceSourceError(args.source, 'expected the compact selector "workspace"');
    }
    if (args.layout.scope === "user" && args.staticPackage === undefined) {
      return yield* workspaceSourceError(
        args.source,
        "user workspaces do not support workspace-authored packages",
      );
    }
    const owner = args.staticPackage?.owner ?? args.layout.owner;
    if (owner === undefined) {
      return yield* workspaceSourceError(
        args.source,
        "the workspace settings do not declare an owner",
      );
    }
    const source: WorkspaceSource = {
      type: "workspace",
      owner,
      extensionType: args.expectedType,
      name: args.staticPackage?.name ?? decodeExtensionNameSync(args.settingsName),
    };

    const canonicalRoot =
      args.layout.scope === "project"
        ? args.layout.authoredRoot(args.expectedType)
        : path.join(args.layout.acquiredRoot, owner, pluralType(args.expectedType));
    const packageDir = args.staticPackage?.root ?? path.join(canonicalRoot, source.name);
    const containmentRoot =
      args.layout.scope === "project" ? args.layout.projectRoot : args.layout.workspaceRoot;
    yield* validatePathSafety(path, containmentRoot, packageDir);
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
    const json = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
      rawManifest,
    ).pipe(
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
