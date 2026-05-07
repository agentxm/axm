import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as semver from "semver";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  REGISTRY_EXTENSIONS_DIR,
  extensionTypeToPlural,
  parseFqn,
  type ExtensionType,
} from "@agentxm/client-core/unstable/extensions";
import { COMMAND_MANIFEST_FILENAME } from "@agentxm/client-core/unstable/commands";
import { MCP_SERVER_MANIFEST_FILENAME } from "@agentxm/client-core/unstable/mcp-servers";
import { EXTENSION_PACK_MANIFEST_FILENAME } from "@agentxm/client-core/unstable/packs";
import { MANIFEST_FILENAME as SKILL_MANIFEST_FILENAME } from "@agentxm/client-core/unstable/skills";
import { MANIFEST_FILENAME as SUBAGENT_MANIFEST_FILENAME } from "@agentxm/client-core/unstable/subagents";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import {
  ExactSemverVersionSchema,
  type ExactSemverVersion,
} from "@agentxm/client-core/unstable/version-constraints";

export const versionableTypes = [
  "command",
  "skill",
  "subagent",
  "mcp-server",
  "pack",
] as const satisfies ReadonlyArray<ExtensionType>;

export type VersionableExtensionType = (typeof versionableTypes)[number];
export type VersionBump = "patch" | "minor" | "major" | "prerelease";

export interface ManifestVersionInfo {
  readonly fqn: string;
  readonly type: VersionableExtensionType;
  readonly manifestPath: string;
  readonly version: ExactSemverVersion;
}

export interface BumpManifestVersionResult extends ManifestVersionInfo {
  readonly from: ExactSemverVersion;
  readonly to: ExactSemverVersion;
  readonly written: boolean;
}

const versionableTypeSet: ReadonlySet<ExtensionType> = new Set(versionableTypes);

export const isVersionableType = (type: ExtensionType): type is VersionableExtensionType =>
  versionableTypeSet.has(type);

const manifestFilenameByType: Record<VersionableExtensionType, string> = {
  command: COMMAND_MANIFEST_FILENAME,
  skill: SKILL_MANIFEST_FILENAME,
  subagent: SUBAGENT_MANIFEST_FILENAME,
  "mcp-server": MCP_SERVER_MANIFEST_FILENAME,
  pack: EXTENSION_PACK_MANIFEST_FILENAME,
};

const manifestFilename = (type: VersionableExtensionType): string => manifestFilenameByType[type];

const decodeExactVersion = (value: unknown, manifestPath: string) =>
  Schema.decodeUnknownEffect(ExactSemverVersionSchema)(value).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "INVALID_MANIFEST_VERSION",
        what: `Invalid version in manifest: ${manifestPath}`,
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
        code: "MANIFEST_PARSE_FAILED",
        what: `Invalid JSON in manifest: ${manifestPath}`,
        cause: e,
      }),
  });

const readManifestRecord = (manifestPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "MANIFEST_READ_FAILED",
          what: `Failed to read manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );
    const manifest = yield* parseManifestJson(content, manifestPath);
    if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
      return yield* makeAppError({
        code: "MANIFEST_SCHEMA_INVALID",
        what: `Manifest must be a JSON object: ${manifestPath}`,
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
    const fqn = yield* parseFqn(fqnInput);

    if (!isVersionableType(fqn.type) || fqn.type !== expectedType) {
      return yield* makeAppError({
        code: "INVALID_EXTENSION_TYPE",
        what: `Expected ${extensionTypeToPlural[expectedType]} handle, got ${fqnInput}`,
        details: [
          `Supported types: ${versionableTypes.map((type) => extensionTypeToPlural[type]).join(", ")}`,
        ],
      });
    }

    const manifestPath = path.join(
      ws.baseDir,
      REGISTRY_EXTENSIONS_DIR,
      fqn.owner,
      extensionTypeToPlural[fqn.type],
      fqn.name,
      manifestFilename(fqn.type),
    );

    const exists = yield* fs.exists(manifestPath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* makeAppError({
        code: "MANIFEST_NOT_FOUND",
        what: `Manifest not found: ${manifestPath}`,
        howToFix: `Create the managed extension with \`axm ${extensionTypeToPlural[expectedType]} new\` before running \`axm ${extensionTypeToPlural[expectedType]} version\`.`,
      });
    }

    const { manifest } = yield* readManifestRecord(manifestPath);
    const version = yield* decodeExactVersion(manifest["version"], manifestPath);

    return {
      fqn: `${fqn.owner}/${extensionTypeToPlural[fqn.type]}/${fqn.name}`,
      type: fqn.type,
      manifestPath,
      version,
    } satisfies ManifestVersionInfo;
  });

const bumpVersion = (from: ExactSemverVersion, bump: VersionBump, manifestPath: string) =>
  Effect.gen(function* () {
    const next = semver.inc(from, bump);
    if (next === null) {
      return yield* makeAppError({
        code: "INVALID_VERSION_BUMP",
        what: `Could not bump version "${from}" in ${manifestPath}`,
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

    if (!args.preview) {
      const updated = { ...manifest, version: to };
      const newline = content.endsWith("\n") ? "\n" : "";
      yield* fs.writeFileString(info.manifestPath, JSON.stringify(updated, null, 2) + newline).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "MANIFEST_WRITE_FAILED",
            what: `Failed to write manifest: ${info.manifestPath}`,
            cause: e,
          }),
        ),
      );
    }

    return {
      ...info,
      from,
      to,
      written: !args.preview,
    } satisfies BumpManifestVersionResult;
  });
