import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { DISCOVERY_MAX_DEPTH } from "@agentxm/extension-model/unstable/discovery-walk";
import type { DistributionDescriptor } from "@agentxm/extension-model/unstable/extensions/refs/ref-base";
import type { PluginMarketplaceSelection } from "./plugin-marketplace.js";
import { SourceNotResolvable } from "./errors.js";

// Agent Plugins 1.0 core fields are typed; descriptive strings are opaque.
// Unknown top-level fields remain payload, with no activation semantics.
const AgentPluginAuthor = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  email: Schema.optionalKey(Schema.String),
  url: Schema.optionalKey(Schema.String),
});
const AgentPluginManifest = Schema.Struct({
  name: Schema.String.check(
    Schema.isPattern(/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/u),
  ),
  version: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  author: Schema.optionalKey(AgentPluginAuthor),
  homepage: Schema.optionalKey(Schema.String),
  repository: Schema.optionalKey(Schema.String),
  license: Schema.optionalKey(Schema.String),
  keywords: Schema.optionalKey(Schema.Array(Schema.String)),
});

const PluginHints = Schema.Struct({
  skills: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
});
const formats: ReadonlyArray<{
  readonly format: DistributionDescriptor["format"];
  readonly manifestPath: string;
}> = [
  { format: "agent-plugins", manifestPath: "plugin.json" },
  { format: "codex", manifestPath: ".codex-plugin/plugin.json" },
  { format: "claude", manifestPath: ".claude-plugin/plugin.json" },
  { format: "cursor", manifestPath: ".cursor-plugin/plugin.json" },
];

export interface PluginSkillDistribution {
  readonly format: DistributionDescriptor["format"];
  readonly manifestPath?: string;
  readonly skills: ReadonlyArray<string>;
}

/** Read distribution declarations; unknown vendor metadata does not gate acquisition. */
export const readPluginDistribution = (
  directory: string,
  selection?: PluginMarketplaceSelection,
): Effect.Effect<
  Option.Option<PluginSkillDistribution>,
  SourceNotResolvable,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolvedRoot = yield* fs.realPath(directory).pipe(
      Effect.mapError(
        (cause) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `Plugin root could not be resolved: ${directory}`,
            cause,
          }),
      ),
    );
    const assertContained = (target: string) =>
      Effect.gen(function* () {
        const resolved = yield* fs.realPath(target).pipe(
          Effect.mapError(
            (cause) =>
              new SourceNotResolvable({
                category: "validation",
                detail: `Plugin path could not be resolved: ${target}`,
                cause,
              }),
          ),
        );
        const relative = path.relative(resolvedRoot, resolved);
        if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`))
          return yield* new SourceNotResolvable({
            category: "validation",
            detail: `Plugin path escapes its package: ${target}`,
          });
      });
    for (const format of formats) {
      if (
        selection !== undefined &&
        format.format !== "agent-plugins" &&
        format.format !== selection.format
      )
        continue;
      const manifestPath = path.join(directory, format.manifestPath);
      const exists = yield* fs.exists(manifestPath).pipe(Effect.catch(() => Effect.succeed(false)));
      if (!exists && (selection === undefined || format.format !== selection.format)) continue;
      if (!exists && format.format === "codex")
        return yield* new SourceNotResolvable({
          category: "validation",
          detail: `Codex marketplace package is missing its plugin manifest: ${directory}`,
        });
      if (exists) yield* assertContained(manifestPath);
      const raw = !exists
        ? "{}"
        : yield* fs.readFileString(manifestPath).pipe(
            Effect.mapError(
              (cause) =>
                new SourceNotResolvable({
                  category: "validation",
                  detail: `Plugin manifest could not be read: ${manifestPath}`,
                  cause,
                }),
            ),
          );
      const document = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
      )(raw).pipe(Effect.option);
      if (format.format === "agent-plugins") {
        const schema = Option.isSome(document) ? document.value["$schema"] : undefined;
        if (typeof schema !== "string" || !schema.startsWith("https://agent-plugins.org/schemas/"))
          continue;
        if (schema !== "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json")
          return yield* new SourceNotResolvable({
            category: "validation",
            detail: `Unsupported Agent Plugins schema: ${schema}`,
          });
      }
      if (format.format === "agent-plugins" && Option.isSome(document)) {
        const invalidManifest = (cause: unknown) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `Invalid Agent Plugins manifest: ${manifestPath}`,
            cause,
          });
        yield* Schema.decodeUnknownEffect(AgentPluginManifest)(document.value).pipe(
          Effect.mapError(invalidManifest),
        );
        if (document.value["author"] !== undefined)
          yield* Schema.decodeUnknownEffect(AgentPluginAuthor)(document.value["author"], {
            onExcessProperty: "error",
          }).pipe(Effect.mapError(invalidManifest));
      }
      const decodeHints = (value: unknown) =>
        Schema.decodeUnknownEffect(PluginHints)(value).pipe(
          Effect.mapError(
            (cause) =>
              new SourceNotResolvable({
                category: "validation",
                detail: `Plugin skill declarations could not be read: ${manifestPath}`,
                cause,
              }),
          ),
        );
      const manifest = Option.isSome(document) ? document.value : undefined;
      const entry = selection?.fields;
      if (format.format === "claude" && entry !== undefined) {
        if (entry["strict"] !== undefined && typeof entry["strict"] !== "boolean")
          return yield* new SourceNotResolvable({
            category: "validation",
            detail: "Claude marketplace strict must be a boolean",
          });
        if (
          exists &&
          entry["strict"] === false &&
          ["commands", "agents", "skills", "hooks", "outputStyles", "themes"].some(
            (key) => entry[key] !== undefined,
          )
        )
          return yield* new SourceNotResolvable({
            category: "validation",
            detail: `Claude marketplace entry conflicts with plugin manifest under strict: false: ${directory}`,
          });
      }
      const decoded =
        format.format === "agent-plugins"
          ? { skills: undefined }
          : yield* decodeHints(format.format === "cursor" ? { ...entry, ...manifest } : manifest);
      const entryHints =
        format.format === "claude" && entry !== undefined
          ? yield* decodeHints(entry)
          : { skills: undefined };
      const paths = (value: string | ReadonlyArray<string> | undefined): ReadonlyArray<string> =>
        value === undefined ? [] : typeof value === "string" ? [value] : value;
      // Claude declarations add to defaults. Cursor explicit paths replace
      // defaults. Root-scoped Claude marketplace selections suppress defaults.
      const roots =
        format.format === "agent-plugins"
          ? ["skills"]
          : (format.format === "cursor" && decoded.skills !== undefined) ||
              (format.format === "codex" && paths(decoded.skills).length > 0)
            ? paths(decoded.skills)
            : format.format === "claude" &&
                selection?.atMarketplaceRoot === true &&
                entryHints.skills !== undefined
              ? [...paths(decoded.skills), ...paths(entryHints.skills)]
              : ["skills", ...paths(decoded.skills), ...paths(entryHints.skills)];
      const skills = new Set<string>();
      for (const relative of roots) {
        const selected = path.resolve(directory, relative);
        const selectedRelative = path.relative(directory, selected);
        if (
          path.isAbsolute(relative) ||
          selectedRelative === ".." ||
          selectedRelative.startsWith(`..${path.sep}`)
        ) {
          return yield* new SourceNotResolvable({
            category: "validation",
            detail: `Plugin skill path escapes its package: ${relative}`,
          });
        }
        if (
          !(yield* fs.exists(selected).pipe(
            Effect.mapError(
              (cause) =>
                new SourceNotResolvable({
                  category: "validation",
                  detail: `Plugin path could not be inspected: ${selected}`,
                  cause,
                }),
            ),
          ))
        )
          continue;
        yield* assertContained(selected);
        if (format.format === "codex") {
          const pending = [{ directory: selected, depth: 0 }];
          const seen = new Set<string>();
          const failure = (cause: unknown) =>
            new SourceNotResolvable({
              category: "validation",
              detail: `Codex skill directory could not be inspected: ${selected}`,
              cause,
            });
          while (pending.length > 0) {
            const current = pending.pop();
            if (current === undefined) continue;
            yield* assertContained(current.directory);
            const physical = yield* fs.realPath(current.directory).pipe(Effect.mapError(failure));
            if (seen.has(physical)) continue;
            seen.add(physical);
            if (
              yield* fs
                .exists(path.join(current.directory, "SKILL.md"))
                .pipe(Effect.mapError(failure))
            ) {
              yield* assertContained(path.join(current.directory, "SKILL.md"));
              skills.add(current.directory);
              continue;
            }
            if (current.depth === DISCOVERY_MAX_DEPTH) continue;
            const children = yield* fs
              .readDirectory(current.directory)
              .pipe(Effect.mapError(failure));
            for (const child of [...children].sort().reverse()) {
              const next = path.join(current.directory, child);
              const info = yield* fs.stat(next).pipe(Effect.mapError(failure));
              if (info.type === "Directory")
                pending.push({ directory: next, depth: current.depth + 1 });
            }
          }
          continue;
        }
        if (
          format.format !== "agent-plugins" &&
          (yield* fs
            .exists(path.join(selected, "SKILL.md"))
            .pipe(Effect.catch(() => Effect.succeed(false))))
        ) {
          yield* assertContained(path.join(selected, "SKILL.md"));
          skills.add(selected);
          continue;
        }
        const entries = yield* fs
          .readDirectory(selected)
          .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));
        for (const entry of [...entries].sort()) {
          const skill = path.join(selected, entry);
          if (
            yield* fs
              .exists(path.join(skill, "SKILL.md"))
              .pipe(Effect.catch(() => Effect.succeed(false)))
          ) {
            yield* assertContained(path.join(skill, "SKILL.md"));
            skills.add(skill);
          }
        }
      }
      return Option.some({
        format: format.format,
        ...(exists ? { manifestPath: format.manifestPath } : {}),
        skills: [...skills].sort(),
      });
    }
    return Option.none();
  });
