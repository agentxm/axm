import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as semver from "semver";

import { makeAppError } from "../../app-error/index.js";
import {
  extensionTypeToPlural,
  parseFqn,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { fqnInvalidErrorToAppError } from "../../app-error/conversions.js";
import { MCP_SERVER_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { PACK_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { MANIFEST_FILENAME as SKILL_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/skills/manifest-schema";
import { MANIFEST_FILENAME as SUBAGENT_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import { HOOK_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import { KNOWLEDGE_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/knowledge";
import { RULE_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/rules/manifest-schema";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { VersionSchema, type Version } from "@agentxm/extension-model/unstable/version-constraints";

/**
 * Version-bump policy, total over every extension type: a new type cannot be
 * added without deciding whether `axm version` can bump it. The `false` rows
 * are capability gaps the parity program closes deliberately, not catalog
 * data.
 */
export const VERSIONABLE_TYPES = {
  skill: true,
  "mcp-server": true,
  subagent: true,
  rule: true,
  hook: true,
  knowledge: true,
  pack: true,
} as const satisfies Record<ExtensionType, boolean>;

type TruthyKeys<T> = { [K in keyof T]: T[K] extends true ? K : never }[keyof T];

export type VersionableExtensionType = TruthyKeys<typeof VERSIONABLE_TYPES>;

// Explicit order is user-visible in `axm version` help and error suggestions.
export const versionableTypes = [
  "skill",
  "subagent",
  "mcp-server",
  "rule",
  "hook",
  "knowledge",
  "pack",
] as const satisfies ReadonlyArray<VersionableExtensionType>;
export type VersionBump = "patch" | "minor" | "major" | "prerelease";

export interface ManifestVersionInfo {
  readonly fqn: string;
  readonly type: VersionableExtensionType;
  readonly manifestPath: string;
  readonly version: Version;
}

export interface BumpManifestVersionResult extends ManifestVersionInfo {
  readonly from: Version;
  readonly to: Version;
  readonly written: boolean;
}

export const isVersionableType = (type: ExtensionType): type is VersionableExtensionType =>
  VERSIONABLE_TYPES[type];

const manifestFilenameByType: Record<VersionableExtensionType, string> = {
  skill: SKILL_MANIFEST_FILENAME,
  subagent: SUBAGENT_MANIFEST_FILENAME,
  "mcp-server": MCP_SERVER_MANIFEST_FILENAME,
  rule: RULE_MANIFEST_FILENAME,
  hook: HOOK_MANIFEST_FILENAME,
  knowledge: KNOWLEDGE_MANIFEST_FILENAME,
  pack: PACK_MANIFEST_FILENAME,
};

const manifestFilename = (type: VersionableExtensionType): string => manifestFilenameByType[type];

const decodeExactVersion = (value: unknown, manifestPath: string) =>
  Schema.decodeUnknownEffect(VersionSchema)(value).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "validation",
        detail: `Invalid version in manifest: ${manifestPath}`,
        cause: e,
      }),
    ),
  );

const parseManifestJson = (content: string, manifestPath: string) =>
  Effect.try({
    try: () => {
      const parsed: unknown = JSON.parse(content);
      return parsed;
    },
    catch: (e) =>
      makeAppError({
        code: "validation",
        detail: `Invalid JSON in manifest: ${manifestPath}`,
        cause: e,
      }),
  });

const readManifestRecord = (manifestPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );
    const manifest = yield* parseManifestJson(content, manifestPath);
    if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Manifest must be a JSON object: ${manifestPath}`,
      });
    }
    return { content, manifest: Object.fromEntries(Object.entries(manifest)) };
  });

export const resolveManifestVersionInfo = (
  fqnInput: string,
  expectedType: VersionableExtensionType,
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const fqn = yield* Effect.fromResult(
      Result.mapError(parseFqn(fqnInput), fqnInvalidErrorToAppError),
    );

    if (!isVersionableType(fqn.type) || fqn.type !== expectedType) {
      return yield* makeAppError({
        code: "validation",
        detail: `Expected ${extensionTypeToPlural[expectedType]} handle, got ${fqnInput}`,
      });
    }
    if (ws.layout.scope !== "project") {
      return yield* makeAppError({
        code: "validation",
        detail: "Versioning workspace-authored extensions requires project scope.",
      });
    }

    const manifestPath = path.join(
      ws.layout.authoredRoot(fqn.type),
      fqn.name,
      manifestFilename(fqn.type),
    );

    const exists = yield* fs.exists(manifestPath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Manifest not found: ${manifestPath}`,
        suggestions: [
          {
            description: "Create the managed extension first.",
            cmd: `axm ${extensionTypeToPlural[expectedType]} new`,
          },
        ],
      });
    }

    const { manifest } = yield* readManifestRecord(manifestPath);
    if (
      manifest["owner"] !== fqn.owner ||
      manifest["type"] !== fqn.type ||
      manifest["name"] !== fqn.name
    ) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Manifest identity does not match ${fqnInput}: ${manifestPath}`,
        recover:
          "Use the package's actual identity or repair its manifest before changing its version.",
      });
    }
    const version = yield* decodeExactVersion(manifest["version"], manifestPath);

    return {
      fqn: `${fqn.owner}/${extensionTypeToPlural[fqn.type]}/${fqn.name}`,
      type: fqn.type,
      manifestPath,
      version,
    } satisfies ManifestVersionInfo;
  });

const bumpVersion = (from: Version, bump: VersionBump, manifestPath: string) =>
  Effect.gen(function* () {
    const next = semver.inc(from, bump);
    if (next === null) {
      return yield* makeAppError({
        code: "validation",
        detail: `Could not bump version "${from}" in ${manifestPath}`,
      });
    }
    return yield* decodeExactVersion(next, manifestPath);
  });

export const bumpManifestVersion = (args: {
  readonly fqn: string;
  readonly type: VersionableExtensionType;
  readonly bump: VersionBump | "set";
  readonly targetVersion?: string;
  readonly preview: boolean;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const info = yield* resolveManifestVersionInfo(args.fqn, args.type);
    const { content, manifest } = yield* readManifestRecord(info.manifestPath);
    const from = yield* decodeExactVersion(manifest["version"], info.manifestPath);
    const to =
      args.bump === "set"
        ? yield* decodeExactVersion(args.targetVersion, info.manifestPath)
        : yield* bumpVersion(from, args.bump, info.manifestPath);

    const changed = from !== to;
    if (!args.preview && changed) {
      const updated = { ...manifest, version: to };
      const newline = content.endsWith("\n") ? "\n" : "";
      yield* fs.writeFileString(info.manifestPath, JSON.stringify(updated, null, 2) + newline).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "internal",
            detail: `Failed to write manifest: ${info.manifestPath}`,
            cause: e,
          }),
        ),
      );
    }

    return {
      ...info,
      from,
      to,
      written: !args.preview && changed,
    } satisfies BumpManifestVersionResult;
  });
