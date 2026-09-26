import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  decodeExtensionNameSync,
  toExtensionTypePlural,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions/common";
import { manifestFilenameForType, readExtensionManifest } from "@agentxm/extension-content";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { computePackageContentHash } from "../package-hash.js";
import { WorkspaceSourceInvalid, type PackageContentHashFailed } from "../errors.js";
import type { PathTraversalDetected } from "../../utils/path-safety.js";
import { validatePathSafety } from "../../utils/path-safety.js";
import type { WorkspaceHookRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { WorkspaceKnowledgeRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { WorkspaceMcpServerRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { WorkspacePackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { WorkspaceRuleRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { WorkspaceSkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { WorkspaceSource } from "@agentxm/extension-model/unstable/sources/types";
import type { WorkspaceSubagentRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { WorkspaceLayout } from "../layout.js";

type WorkspaceExtensionRef =
  | WorkspaceSkillRef
  | WorkspaceMcpServerRef
  | WorkspaceSubagentRef
  | WorkspaceRuleRef
  | WorkspaceHookRef
  | WorkspaceKnowledgeRef
  | WorkspacePackRef;

const workspaceSourceError = (
  source: string,
  detail: string,
  cause?: unknown,
): WorkspaceSourceInvalid =>
  new WorkspaceSourceInvalid({ source, detail, ...(cause === undefined ? {} : { cause }) });

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
}): Effect.Effect<
  WorkspaceExtensionRef,
  WorkspaceSourceInvalid | PathTraversalDetected | PackageContentHashFailed,
  FileSystem.FileSystem | Path.Path
> =>
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
        : path.join(args.layout.acquiredRoot, owner, toExtensionTypePlural(args.expectedType));
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

    const manifestPath = path.join(packageDir, manifestFilenameForType(args.expectedType));
    const { manifest } = yield* readExtensionManifest(packageDir, args.expectedType).pipe(
      Effect.mapError((cause) => {
        const detail =
          cause.code === "manifest_missing" || cause.code === "manifest_unreadable"
            ? `the expected manifest is missing at ${manifestPath}`
            : cause.code === "manifest_invalid_json"
              ? `the manifest at ${manifestPath} is not valid JSON`
              : `the manifest at ${manifestPath} is invalid`;
        return workspaceSourceError(args.source, detail, cause);
      }),
    );
    if (manifest.owner !== source.owner || manifest.name !== source.name) {
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
