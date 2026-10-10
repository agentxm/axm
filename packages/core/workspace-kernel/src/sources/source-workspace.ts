/**
 * What a source says about itself when it is an AXM workspace.
 *
 * A source root that carries workspace settings has declared where it keeps
 * the packages it authors and which of them it does not distribute. Discovery
 * takes that declaration instead of inferring authorship from wherever a
 * manifest happens to sit. The settings are another project's and may be
 * written by another AXM version, so only the facts discovery needs are read.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import type { ExtensionType, Handle } from "@agentxm/extension-model/unstable/extensions";
import { HandleSchema } from "@agentxm/extension-model/unstable/extensions/handle";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";

import {
  ACQUIRED_EXTENSIONS_DIR,
  DEFAULT_AUTHORED_DIRECTORIES,
  resolveAuthoredDirectories,
} from "../workspace-state/index.js";
import { SourceNotResolvable } from "./errors.js";

const DistributionEntrySchema = Schema.Union([
  Schema.String,
  Schema.Struct({
    source: Schema.optionalKey(Schema.String),
    distribute: Schema.optionalKey(Schema.Boolean),
  }),
]);

const DistributionMapSchema = Schema.Record(Schema.String, DistributionEntrySchema);

const AuthoredDirectorySchema = Schema.Struct({ dir: Schema.optionalKey(Schema.String) });

const SourceSettingsSchema = Schema.Struct({
  owner: Schema.optionalKey(HandleSchema),
  skills: Schema.optionalKey(DistributionMapSchema),
  skillsConfig: Schema.optionalKey(AuthoredDirectorySchema),
  mcpServers: Schema.optionalKey(DistributionMapSchema),
  mcpServersConfig: Schema.optionalKey(AuthoredDirectorySchema),
  subagents: Schema.optionalKey(DistributionMapSchema),
  subagentsConfig: Schema.optionalKey(AuthoredDirectorySchema),
  rules: Schema.optionalKey(DistributionMapSchema),
  rulesConfig: Schema.optionalKey(AuthoredDirectorySchema),
  hooks: Schema.optionalKey(DistributionMapSchema),
  hooksConfig: Schema.optionalKey(AuthoredDirectorySchema),
  knowledge: Schema.optionalKey(DistributionMapSchema),
  knowledgeConfig: Schema.optionalKey(AuthoredDirectorySchema),
  packs: Schema.optionalKey(DistributionMapSchema),
  packsConfig: Schema.optionalKey(AuthoredDirectorySchema),
});

type SourceSettingsDocument = typeof SourceSettingsSchema.Type;

/** One root a workspace source keeps the packages of one type it authors in. */
export interface SourceAuthoredRoot {
  readonly type: ExtensionType;
  readonly directory: string;
}

export interface SourceWorkspace {
  /** The publisher a manifest without its own owner belongs to. */
  readonly owner: Option.Option<Handle>;
  /** `type:name` of every workspace entry the source declines to distribute. */
  readonly distributionOptOuts: ReadonlySet<string>;
  /** Where the source authors packages; none when the root is not a workspace. */
  readonly authoredRoots: Option.Option<ReadonlyArray<SourceAuthoredRoot>>;
  /** Where a source keeps the packages it acquired from other publishers. */
  readonly heldRoot: string;
}

const invalid = (detail: string, cause?: unknown): SourceNotResolvable =>
  new SourceNotResolvable({
    category: "validation",
    detail,
    ...(cause === undefined ? {} : { cause }),
  });

const configuredDirectory = (settings: SourceSettingsDocument, type: ExtensionType): string => {
  switch (type) {
    case "skill":
      return settings.skillsConfig?.dir ?? DEFAULT_AUTHORED_DIRECTORIES.skill;
    case "mcp-server":
      return settings.mcpServersConfig?.dir ?? DEFAULT_AUTHORED_DIRECTORIES["mcp-server"];
    case "subagent":
      return settings.subagentsConfig?.dir ?? DEFAULT_AUTHORED_DIRECTORIES.subagent;
    case "rule":
      return settings.rulesConfig?.dir ?? DEFAULT_AUTHORED_DIRECTORIES.rule;
    case "hook":
      return settings.hooksConfig?.dir ?? DEFAULT_AUTHORED_DIRECTORIES.hook;
    case "knowledge":
      return settings.knowledgeConfig?.dir ?? DEFAULT_AUTHORED_DIRECTORIES.knowledge;
    case "pack":
      return settings.packsConfig?.dir ?? DEFAULT_AUTHORED_DIRECTORIES.pack;
  }
};

const distributionOptOutsOf = (settings: SourceSettingsDocument): ReadonlySet<string> => {
  const optOuts = new Set<string>();
  const collect = (
    type: ExtensionType,
    entries: Readonly<Record<string, typeof DistributionEntrySchema.Type>> | undefined,
  ) => {
    for (const [name, entry] of Object.entries(entries ?? {})) {
      if (typeof entry !== "string" && entry.source === "workspace" && entry.distribute === false) {
        optOuts.add(`${type}:${name}`);
      }
    }
  };
  collect("skill", settings.skills);
  collect("mcp-server", settings.mcpServers);
  collect("subagent", settings.subagents);
  collect("rule", settings.rules);
  collect("hook", settings.hooks);
  collect("knowledge", settings.knowledge);
  collect("pack", settings.packs);
  return optOuts;
};

/**
 * Read the workspace a source root declares. A root without settings is not a
 * workspace and declares nothing; present settings that cannot be read, or
 * that place an authored root where the workspace itself could not use it,
 * refuse the source rather than leave discovery to guess.
 */
export const readSourceWorkspace = (
  root: string,
): Effect.Effect<SourceWorkspace, SourceNotResolvable, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const heldRoot = path.join(root, ACQUIRED_EXTENSIONS_DIR);
    const settingsPath = path.join(root, SETTINGS_FILENAME);
    const exists = yield* fs
      .exists(settingsPath)
      .pipe(
        Effect.mapError((cause) =>
          invalid(`Source settings could not be inspected: ${settingsPath}`, cause),
        ),
      );
    if (!exists) {
      return {
        owner: Option.none<Handle>(),
        distributionOptOuts: new Set<string>(),
        authoredRoots: Option.none(),
        heldRoot,
      };
    }

    const text = yield* fs
      .readFileString(settingsPath)
      .pipe(
        Effect.mapError((cause) =>
          invalid(`Source settings could not be read: ${settingsPath}`, cause),
        ),
      );
    const raw = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(text).pipe(
      Effect.mapError((cause) =>
        invalid(`Source settings contain invalid JSON: ${settingsPath}`, cause),
      ),
    );
    const settings = yield* Schema.decodeUnknownEffect(SourceSettingsSchema)(raw).pipe(
      Effect.mapError((cause) =>
        invalid(
          `Source settings declare an invalid owner, entry, or authored directory: ${settingsPath}`,
          cause,
        ),
      ),
    );
    const directories = yield* resolveAuthoredDirectories(
      path,
      makeAbsolutePath(path, root),
      (type) => configuredDirectory(settings, type),
    ).pipe(
      Effect.mapError((cause) =>
        invalid(
          `Source settings ${settingsPath} are not a usable workspace: ${cause.detail}`,
          cause,
        ),
      ),
    );
    return {
      owner: Option.fromUndefinedOr(settings.owner),
      distributionOptOuts: distributionOptOutsOf(settings),
      authoredRoots: Option.some(
        [...directories].map(([type, directory]) => ({ type, directory })),
      ),
      heldRoot,
    };
  });
