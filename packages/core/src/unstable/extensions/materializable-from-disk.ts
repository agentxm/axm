import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { makeAppError, type AppError } from "../app-error/index.js";
import type { CommandExtensionRef } from "../commands/refs.js";
import { COMMAND_MANIFEST_FILENAME, CommandManifestSchema } from "../commands/manifest-schema.js";
import { REGISTRY_EXTENSIONS_DIR } from "./constants.js";
import type {
  ConfiguredExtensionRef,
  ConfiguredSkill,
  ConfiguredSubagent,
} from "../workspace/read-model-record-types.js";
import { parseRegistrySourceRef } from "./registry-source.js";
import type { McpServerExtensionRef } from "../mcp-servers/refs.js";
import {
  MCP_SERVER_MANIFEST_FILENAME,
  McpServerManifestSchema,
} from "../mcp-servers/manifest-schema.js";
import type { SkillExtensionRef } from "../skills/refs.js";
import {
  MANIFEST_FILENAME as SKILL_MANIFEST_FILENAME,
  SkillManifestSchema,
} from "../skills/manifest-schema.js";
import type { SubagentExtensionRef } from "../subagents/refs.js";
import {
  MANIFEST_FILENAME as SUBAGENT_MANIFEST_FILENAME,
  SubagentManifestSchema,
} from "../subagents/manifest-schema.js";
import type { RegistrySource } from "../sources/types.js";
import type { Handle } from "./handle.js";
import type { PackRef } from "../packs/refs.js";
import { PACK_MANIFEST_FILENAME, PackManifestSchema } from "../packs/manifest-schema.js";

interface DiskRefEnv {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly baseDir: string;
}

const syntheticRegistrySource = (owner: Handle): RegistrySource => ({
  type: "registry",
  location: new URL("file:///"),
  owner: Option.some(owner),
});

const canonicalExtensionPath = (
  env: DiskRefEnv,
  owner: string,
  kind: "commands" | "mcp-servers" | "skills" | "subagents",
  name: string,
) => env.path.join(env.baseDir, REGISTRY_EXTENSIONS_DIR, owner, kind, name);

const resolveRegistryDiskLocation = (
  env: DiskRefEnv,
  source: string,
  expectedKind: "commands" | "mcp-servers" | "skills" | "subagents",
  settingsName: string,
) =>
  Effect.gen(function* () {
    const parsed = parseRegistrySourceRef(source);
    if (parsed !== undefined && parsed.type === expectedKind) {
      return Option.some({
        owner: parsed.owner,
        name: parsed.name,
        dir: canonicalExtensionPath(env, parsed.owner, expectedKind, parsed.name),
      });
    }

    const extensionsDir = env.path.join(env.baseDir, REGISTRY_EXTENSIONS_DIR);
    const exists = yield* env.fs
      .exists(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return Option.none();

    const owners = yield* env.fs
      .readDirectory(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));
    const matches = yield* Effect.forEach(
      owners,
      (owner) => {
        if (!owner.startsWith("@")) return Effect.succeed(Option.none());
        const dir = canonicalExtensionPath(env, owner, expectedKind, settingsName);
        return env.fs.exists(dir).pipe(
          Effect.catch(() => Effect.succeed(false)),
          Effect.map((existsOnDisk) =>
            existsOnDisk ? Option.some({ owner, name: settingsName, dir }) : Option.none(),
          ),
        );
      },
      { concurrency: "unbounded" },
    );

    return matches.find(Option.isSome) ?? Option.none();
  });

const readManifestJson = (env: DiskRefEnv, manifestPath: string) =>
  Effect.gen(function* () {
    const raw = yield* env.fs.readFileString(manifestPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          message: `Failed to read manifest at ${manifestPath}`,
          cause: error,
        }),
      ),
    );
    return yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(raw).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "validation",
          message: `Manifest at ${manifestPath} is not valid JSON`,
          cause: error,
        }),
      ),
    );
  });

export const configuredSkillsToDiskRefs = (
  env: DiskRefEnv,
  configured: Readonly<Record<string, ConfiguredSkill>>,
): Effect.Effect<ReadonlyArray<SkillExtensionRef>, AppError> =>
  Effect.forEach(
    Object.entries(configured).filter(([, entry]) => entry.enabled),
    ([settingsName, entry]) =>
      Effect.gen(function* () {
        const location = yield* resolveRegistryDiskLocation(
          env,
          entry.source,
          "skills",
          settingsName,
        );
        if (Option.isNone(location)) return Option.none<SkillExtensionRef>();
        const manifestPath = env.path.join(location.value.dir, SKILL_MANIFEST_FILENAME);
        const manifestExists = yield* env.fs
          .exists(manifestPath)
          .pipe(Effect.catch(() => Effect.succeed(false)));
        if (!manifestExists) return Option.none<SkillExtensionRef>();
        const json = yield* readManifestJson(env, manifestPath);
        const manifest = yield* Schema.decodeUnknownEffect(SkillManifestSchema)(json).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "validation",
              message: `Skill manifest at ${manifestPath} is invalid`,
              cause: error,
            }),
          ),
        );
        return Option.some({
          type: "skill",
          refType: "registry",
          source: syntheticRegistrySource(manifest.owner),
          owner: manifest.owner,
          name: manifest.name,
          version: manifest.version,
          integrity: Option.none(),
          compatiblePackages: [],
          skill: {
            name: manifest.name,
            description: Option.fromUndefinedOr(manifest.description),
            metadata: Option.none(),
          },
        } satisfies SkillExtensionRef);
      }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((refs) => refs.filter(Option.isSome).map((ref) => ref.value)));

export const configuredCommandsToDiskRefs = (
  env: DiskRefEnv,
  configured: Readonly<Record<string, ConfiguredExtensionRef & { readonly enabled: boolean }>>,
): Effect.Effect<ReadonlyArray<CommandExtensionRef>, AppError> =>
  Effect.forEach(
    Object.entries(configured).filter(([, entry]) => entry.enabled),
    ([settingsName, entry]) =>
      Effect.gen(function* () {
        const location = yield* resolveRegistryDiskLocation(
          env,
          entry.source,
          "commands",
          settingsName,
        );
        if (Option.isNone(location)) return Option.none<CommandExtensionRef>();
        const manifestPath = env.path.join(location.value.dir, COMMAND_MANIFEST_FILENAME);
        const manifestExists = yield* env.fs
          .exists(manifestPath)
          .pipe(Effect.catch(() => Effect.succeed(false)));
        if (!manifestExists) return Option.none<CommandExtensionRef>();
        const json = yield* readManifestJson(env, manifestPath);
        const manifest = yield* Schema.decodeUnknownEffect(CommandManifestSchema)(json).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "validation",
              message: `Command manifest at ${manifestPath} is invalid`,
              cause: error,
            }),
          ),
        );
        return Option.some({
          type: "command",
          refType: "registry",
          source: syntheticRegistrySource(manifest.owner),
          owner: manifest.owner,
          name: manifest.name,
          version: manifest.version,
          integrity: Option.none(),
          compatiblePackages: [],
          command: { name: manifest.name },
        } satisfies CommandExtensionRef);
      }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((refs) => refs.filter(Option.isSome).map((ref) => ref.value)));

export const configuredMcpServersToDiskRefs = (
  env: DiskRefEnv,
  configured: Readonly<Record<string, ConfiguredExtensionRef>>,
): Effect.Effect<ReadonlyArray<McpServerExtensionRef>, AppError> =>
  Effect.forEach(
    Object.entries(configured),
    ([settingsName, entry]) =>
      Effect.gen(function* () {
        const location = yield* resolveRegistryDiskLocation(
          env,
          entry.source,
          "mcp-servers",
          settingsName,
        );
        if (Option.isNone(location)) return Option.none<McpServerExtensionRef>();
        const manifestPath = env.path.join(location.value.dir, MCP_SERVER_MANIFEST_FILENAME);
        const manifestExists = yield* env.fs
          .exists(manifestPath)
          .pipe(Effect.catch(() => Effect.succeed(false)));
        if (!manifestExists) return Option.none<McpServerExtensionRef>();
        const json = yield* readManifestJson(env, manifestPath);
        const manifest = yield* Schema.decodeUnknownEffect(McpServerManifestSchema)(json).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "validation",
              message: `MCP server manifest at ${manifestPath} is invalid`,
              cause: error,
            }),
          ),
        );
        return Option.some({
          type: "mcp-server",
          refType: "registry",
          source: syntheticRegistrySource(manifest.owner),
          owner: manifest.owner,
          name: manifest.name,
          version: manifest.version,
          integrity: Option.none(),
          compatiblePackages: [],
          server: { name: manifest.name },
        } satisfies McpServerExtensionRef);
      }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((refs) => refs.filter(Option.isSome).map((ref) => ref.value)));

export const configuredSubagentsToDiskRefs = (
  env: DiskRefEnv,
  configured: Readonly<Record<string, ConfiguredSubagent>>,
): Effect.Effect<ReadonlyArray<SubagentExtensionRef>, AppError> =>
  Effect.forEach(
    Object.entries(configured).filter(([, entry]) => entry.enabled),
    ([settingsName, entry]) =>
      Effect.gen(function* () {
        const location = yield* resolveRegistryDiskLocation(
          env,
          entry.source,
          "subagents",
          settingsName,
        );
        if (Option.isNone(location)) return Option.none<SubagentExtensionRef>();
        const manifestPath = env.path.join(location.value.dir, SUBAGENT_MANIFEST_FILENAME);
        const manifestExists = yield* env.fs
          .exists(manifestPath)
          .pipe(Effect.catch(() => Effect.succeed(false)));
        if (!manifestExists) return Option.none<SubagentExtensionRef>();
        const json = yield* readManifestJson(env, manifestPath);
        const manifest = yield* Schema.decodeUnknownEffect(SubagentManifestSchema)(json).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "validation",
              message: `Subagent manifest at ${manifestPath} is invalid`,
              cause: error,
            }),
          ),
        );
        return Option.some({
          type: "subagent",
          refType: "registry",
          source: syntheticRegistrySource(manifest.owner),
          owner: manifest.owner,
          name: manifest.name,
          version: manifest.version,
          integrity: Option.none(),
          compatiblePackages: [],
          subagent: {
            name: manifest.name,
            description: Option.fromUndefinedOr(manifest.description),
          },
        } satisfies SubagentExtensionRef);
      }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((refs) => refs.filter(Option.isSome).map((ref) => ref.value)));

export const configuredPacksToDiskRefs = (
  env: DiskRefEnv,
  configured: Readonly<Record<string, ConfiguredExtensionRef>>,
): Effect.Effect<ReadonlyArray<PackRef>, AppError> =>
  Effect.forEach(
    Object.entries(configured),
    ([settingsName, entry]) =>
      Effect.gen(function* () {
        const parsed = parseRegistrySourceRef(entry.source);
        const location =
          parsed !== undefined && parsed.type === "packs"
            ? Option.some({
                owner: parsed.owner,
                name: parsed.name,
                dir: env.path.join(
                  env.baseDir,
                  REGISTRY_EXTENSIONS_DIR,
                  parsed.owner,
                  "packs",
                  parsed.name,
                ),
              })
            : yield* Effect.gen(function* () {
                const extensionsDir = env.path.join(env.baseDir, REGISTRY_EXTENSIONS_DIR);
                const exists = yield* env.fs
                  .exists(extensionsDir)
                  .pipe(Effect.catch(() => Effect.succeed(false)));
                if (!exists) return Option.none<{ owner: string; name: string; dir: string }>();
                const owners = yield* env.fs
                  .readDirectory(extensionsDir)
                  .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));
                const matches = yield* Effect.forEach(
                  owners,
                  (owner) => {
                    if (!owner.startsWith("@")) return Effect.succeed(Option.none());
                    const dir = env.path.join(
                      env.baseDir,
                      REGISTRY_EXTENSIONS_DIR,
                      owner,
                      "packs",
                      settingsName,
                    );
                    return env.fs.exists(dir).pipe(
                      Effect.catch(() => Effect.succeed(false)),
                      Effect.map((existsOnDisk) =>
                        existsOnDisk
                          ? Option.some({ owner, name: settingsName, dir })
                          : Option.none(),
                      ),
                    );
                  },
                  { concurrency: "unbounded" },
                );
                return matches.find(Option.isSome) ?? Option.none();
              });

        if (Option.isNone(location)) return Option.none<PackRef>();
        const manifestPath = env.path.join(location.value.dir, PACK_MANIFEST_FILENAME);
        const manifestExists = yield* env.fs
          .exists(manifestPath)
          .pipe(Effect.catch(() => Effect.succeed(false)));
        if (!manifestExists) return Option.none<PackRef>();
        const json = yield* readManifestJson(env, manifestPath);
        const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(json).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "validation",
              message: `Extension pack manifest at ${manifestPath} is invalid`,
              cause: error,
            }),
          ),
        );
        return Option.some({
          type: "pack",
          refType: "registry",
          source: syntheticRegistrySource(manifest.owner),
          owner: manifest.owner,
          name: manifest.name,
          version: manifest.version,
          integrity: Option.none(),
          compatiblePackages: [],
          pack: {
            name: manifest.name,
            skills: manifest.skills ?? {},
            commands: manifest.commands ?? {},
            mcpServers: manifest["mcp-servers"] ?? {},
            subagents: manifest.subagents ?? {},
          },
        } satisfies PackRef);
      }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((refs) => refs.filter(Option.isSome).map((ref) => ref.value)));
