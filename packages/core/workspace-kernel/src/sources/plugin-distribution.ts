import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { DISCOVERY_MAX_DEPTH } from "@agentxm/extension-model/unstable/discovery-walk";
import type { DistributionDescriptor } from "@agentxm/extension-model/unstable/extensions/refs/ref-base";
import type { PluginMarketplaceSelection } from "./plugin-marketplace.js";
import { SourceNotResolvable } from "./errors.js";
import { isLexicallyWithin, isRelativeWithin } from "@agentxm/host-primitives";

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
  /** The physical path of the plugin directory this distribution was read from. */
  readonly resolvedRoot: string;
}

/** The physical path of a directory inspected as a plugin or marketplace root. */
export const resolvePluginRoot = (
  directory: string,
): Effect.Effect<string, SourceNotResolvable, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.realPath(directory).pipe(
      Effect.mapError(
        (cause) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `Plugin root could not be resolved: ${directory}`,
            cause,
          }),
      ),
    );
  });

/** How a skills root is walked: Codex descends, Agent Plugins skips a root SKILL.md. */
type SkillsWalk = "codex" | "agent-plugins" | "skill-root";

/**
 * What one completed distribution read of a directory observed: each plugin
 * manifest it probed, with the text it read when the manifest exists, and the
 * skills each skills root it walked contributed. Immutable; only steps that
 * completed are recorded.
 */
export interface PluginDistributionObservations {
  readonly manifests: HashMap.HashMap<string, Option.Option<string>>;
  readonly skillRoots: HashMap.HashMap<string, ReadonlyArray<string>>;
}

const skillRootKey = (walk: SkillsWalk, selected: string) => JSON.stringify([walk, selected]);

/**
 * Read distribution declarations; unknown vendor metadata does not gate
 * acquisition. Every path is joined to, and reported from, the lexical
 * `directory`; `physicalRoot` is that directory's resolved path, against which
 * each resolved target is checked for containment.
 */
export const readPluginDistribution = (
  directory: string,
  options: {
    readonly physicalRoot: string;
    readonly selection?: PluginMarketplaceSelection;
    readonly observed?: PluginDistributionObservations;
  },
): Effect.Effect<
  Option.Option<PluginSkillDistribution>,
  SourceNotResolvable,
  FileSystem.FileSystem | Path.Path
> =>
  observePluginDistribution(directory, options).pipe(
    Effect.map(({ distribution }) => distribution),
  );

/**
 * Read a directory's distribution, as `readPluginDistribution` does, and
 * return what that read observed. `observed`, when given, is what an earlier
 * read of this same lexical directory observed within the same inspection:
 * the manifest probes and reads and the skills-root walks it recorded are
 * taken from it in place, and every step it did not record, together with
 * every selection-dependent check, runs live in today's order.
 */
export const observePluginDistribution = (
  directory: string,
  options: {
    readonly physicalRoot: string;
    readonly selection?: PluginMarketplaceSelection;
    readonly observed?: PluginDistributionObservations;
  },
): Effect.Effect<
  {
    readonly distribution: Option.Option<PluginSkillDistribution>;
    readonly observations: PluginDistributionObservations;
  },
  SourceNotResolvable,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolvedRoot = options.physicalRoot;
    const selection = options.selection;
    const observed = options.observed;
    let manifests = HashMap.empty<string, Option.Option<string>>();
    let skillRoots = HashMap.empty<string, ReadonlyArray<string>>();
    const observations = (): PluginDistributionObservations => ({ manifests, skillRoots });
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
        if (!isLexicallyWithin(path, resolvedRoot, resolved))
          return yield* new SourceNotResolvable({
            category: "validation",
            detail: `Plugin path escapes its package: ${target}`,
          });
        return resolved;
      });
    for (const format of formats) {
      if (
        selection !== undefined &&
        format.format !== "agent-plugins" &&
        format.format !== selection.format
      )
        continue;
      const manifestPath = path.join(directory, format.manifestPath);
      const prior =
        observed === undefined ? Option.none() : HashMap.get(observed.manifests, manifestPath);
      const exists = Option.isSome(prior)
        ? Option.isSome(prior.value)
        : yield* fs.exists(manifestPath).pipe(Effect.catch(() => Effect.succeed(false)));
      if (!exists) manifests = HashMap.set(manifests, manifestPath, Option.none());
      if (!exists && (selection === undefined || format.format !== selection.format)) continue;
      if (!exists && format.format === "codex")
        return yield* new SourceNotResolvable({
          category: "validation",
          detail: `Codex marketplace package is missing its plugin manifest: ${directory}`,
        });
      const raw = !exists
        ? "{}"
        : Option.isSome(prior) && Option.isSome(prior.value)
          ? prior.value.value
          : yield* Effect.gen(function* () {
              yield* assertContained(manifestPath);
              return yield* fs.readFileString(manifestPath).pipe(
                Effect.mapError(
                  (cause) =>
                    new SourceNotResolvable({
                      category: "validation",
                      detail: `Plugin manifest could not be read: ${manifestPath}`,
                      cause,
                    }),
                ),
              );
            });
      if (exists) manifests = HashMap.set(manifests, manifestPath, Option.some(raw));
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
      const walk: SkillsWalk =
        format.format === "codex" || format.format === "agent-plugins"
          ? format.format
          : "skill-root";
      // The skills one root contributes, from its exists probe onward.
      const rootSkills = (selected: string) =>
        Effect.gen(function* () {
          const contributed: Array<string> = [];
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
            return contributed;
          if (walk === "codex") {
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
              // The skills root is first contained here, as each directory beneath it is.
              const physical = yield* assertContained(current.directory);
              if (seen.has(physical)) continue;
              seen.add(physical);
              if (
                yield* fs
                  .exists(path.join(current.directory, "SKILL.md"))
                  .pipe(Effect.mapError(failure))
              ) {
                yield* assertContained(path.join(current.directory, "SKILL.md"));
                contributed.push(current.directory);
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
            return contributed;
          }
          yield* assertContained(selected);
          if (
            walk !== "agent-plugins" &&
            (yield* fs
              .exists(path.join(selected, "SKILL.md"))
              .pipe(Effect.catch(() => Effect.succeed(false))))
          ) {
            yield* assertContained(path.join(selected, "SKILL.md"));
            contributed.push(selected);
            return contributed;
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
              contributed.push(skill);
            }
          }
          return contributed;
        });
      for (const relative of roots) {
        const selected = path.resolve(directory, relative);
        const selectedRelative = path.relative(directory, selected);
        if (path.isAbsolute(relative) || !isRelativeWithin(path, selectedRelative)) {
          return yield* new SourceNotResolvable({
            category: "validation",
            detail: `Plugin skill path escapes its package: ${relative}`,
          });
        }
        const key = skillRootKey(walk, selected);
        const recorded =
          observed === undefined ? Option.none() : HashMap.get(observed.skillRoots, key);
        const contributed = Option.isSome(recorded)
          ? recorded.value
          : Object.freeze(yield* rootSkills(selected));
        skillRoots = HashMap.set(skillRoots, key, contributed);
        for (const skill of contributed) skills.add(skill);
      }
      return {
        distribution: Option.some({
          format: format.format,
          ...(exists ? { manifestPath: format.manifestPath } : {}),
          skills: [...skills].sort(),
          resolvedRoot,
        }),
        observations: observations(),
      };
    }
    return { distribution: Option.none(), observations: observations() };
  });
