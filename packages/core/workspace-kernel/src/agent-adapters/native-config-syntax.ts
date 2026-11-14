import { withWork } from "@agentxm/host-primitives/work-observation";
/** Whole-file grammar shared by every structured native reader. */
import * as Context from "effect/Context";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import { parse, type ParseError } from "jsonc-parser";
import { parse as parseToml, TomlDate } from "smol-toml";
import type { McpConfigTarget } from "@agentxm/extension-model/unstable/agent-capabilities";
import { McpConfigInvalid } from "./errors.js";
import { parseYaml } from "./yaml.js";

/** Why a native document is not an object document: its text does not parse, or its root is not an object. */
export type NativeConfigRootFailure =
  { readonly reason: "syntax"; readonly cause: unknown } | { readonly reason: "shape" };

const parseRoot = (format: McpConfigTarget["format"], raw: string): unknown => {
  if (format === "toml") return parseToml(raw);
  // A YAML document holding only comments has no value, like an empty file.
  if (format === "yaml") return parseYaml(raw) ?? {};
  const errors: Array<ParseError> = [];
  const root: unknown = parse(raw, errors, {
    allowTrailingComma: format !== "json",
    disallowComments: format === "json",
  });
  if (errors.length > 0) throw errors;
  return root;
};

type NativeDocument = Readonly<Record<string, unknown>>;
// TOML's date subclass retains local/offset kinds which structuredClone drops.
// Its parsed values are acyclic records and arrays, so no general object copier is needed.
const copyTomlDocument = (root: NativeDocument): NativeDocument =>
  Object.fromEntries(Object.entries(root).map(([key, value]) => [key, copyTomlValue(value)]));
const copyTomlValue = (value: unknown): unknown =>
  value instanceof TomlDate
    ? new TomlDate(value.toISOString())
    : Array.isArray(value)
      ? value.map(copyTomlValue)
      : Predicate.isObject(value)
        ? copyTomlDocument(value)
        : value;

/**
 * An unshared JSON, JSONC or TOML parse as each consumer would receive it: own
 * enumerable keys stay own keys (TOML's `__proto__` included), null-prototype
 * TOML records keep a null prototype, and a JSONC `__proto__` member that set a
 * prototype is copied as that prototype. YAML never uses this copier: its tagged
 * values (dates, sets, maps, binary) and alias sharing are kept by structuredClone.
 */
const copyFaithfulValue = (value: unknown): unknown =>
  value instanceof TomlDate
    ? new TomlDate(value.toISOString())
    : Array.isArray(value)
      ? value.map(copyFaithfulValue)
      : Predicate.isObject(value)
        ? copyFaithfulRecord(value)
        : value;
const copyFaithfulRecord = (record: { readonly [key: PropertyKey]: unknown }) => {
  const copy: Record<string, unknown> = {};
  const prototype: unknown = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype)
    Object.setPrototypeOf(
      copy,
      Array.isArray(prototype)
        ? prototype.map(copyFaithfulValue)
        : Predicate.isObject(prototype)
          ? copyFaithfulRecord(prototype)
          : null,
    );
  for (const key of Object.keys(record))
    Object.defineProperty(copy, key, {
      value: copyFaithfulValue(record[key]),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  return copy;
};

/** How a view copies a shared syntax result for each consumer. */
type NativeConfigCopyMode = "structured" | "faithful";

const copyDocument = (
  mode: NativeConfigCopyMode,
  format: McpConfigTarget["format"],
  root: NativeDocument,
): NativeDocument =>
  format === "yaml"
    ? structuredClone(root)
    : mode === "faithful"
      ? copyFaithfulRecord(root)
      : format === "toml"
        ? copyTomlDocument(root)
        : structuredClone(root);

const parseDocument = (
  format: McpConfigTarget["format"],
  raw: string,
): Effect.Effect<NativeDocument, NativeConfigRootFailure> =>
  raw.trim().length === 0
    ? Effect.succeed({})
    : Effect.gen(function* () {
        const root = yield* Effect.try({
          try: () => parseRoot(format, raw),
          catch: (cause): NativeConfigRootFailure => ({ reason: "syntax", cause }),
        });
        if (!Predicate.isObject(root))
          return yield* Effect.fail<NativeConfigRootFailure>({ reason: "shape" });
        return root;
      }).pipe((effect) =>
        withWork("axm.parse.native", effect, {
          attributes: { "axm.format": format, "axm.work.count": 1 },
        }),
      );

class NativeConfigReadView extends Context.Service<
  NativeConfigReadView,
  {
    readonly parse: typeof parseDocument;
    readonly mode: NativeConfigCopyMode;
    readonly isActive: () => boolean;
  }
>()("@agentxm/workspace-kernel/agent-adapters/NativeConfigReadView") {}

const openNativeConfigReadView =
  (mode: NativeConfigCopyMode) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.gen(function* () {
      const cells = new Map<
        McpConfigTarget["format"],
        Map<string, ReturnType<typeof parseDocument>>
      >();
      let active = true;
      const parse: typeof parseDocument = (format, raw) =>
        Effect.gen(function* () {
          if (!active) return yield* parseDocument(format, raw);
          const documents =
            cells.get(format) ?? new Map<string, ReturnType<typeof parseDocument>>();
          cells.set(format, documents);
          const previous = documents.get(raw);
          if (previous !== undefined) return yield* previous;
          const created = yield* Effect.cached(parseDocument(format, raw));
          const selected = documents.get(raw) ?? created;
          documents.set(raw, selected);
          return yield* selected;
        });
      return yield* effect.pipe(
        Effect.provideService(NativeConfigReadView, { parse, mode, isActive: () => active }),
        Effect.ensuring(
          Effect.sync(() => {
            active = false;
            cells.clear();
          }),
        ),
      );
    });

const activeNativeConfigReadView = Effect.map(
  Effect.serviceOption(NativeConfigReadView),
  Option.filter((view) => view.isActive()),
);

/** Exact syntax results belong to one observation or one locked publication. */
export const withNativeConfigReadView = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => openNativeConfigReadView("structured")(effect);

/**
 * One observation: join the enclosing active view, with its results and copies,
 * or share exact results privately with copies equal to unshared parses.
 */
export const withNativeConfigObservationView = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.flatMap(activeNativeConfigReadView, (view) =>
    Option.isSome(view) ? effect : openNativeConfigReadView("faithful")(effect),
  );

/**
 * One locked publication: never reuses another run's results, and gives each
 * consumer the copies it receives today inside or outside an enclosing view.
 */
export const withNativeConfigPublicationView = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.flatMap(activeNativeConfigReadView, (view) =>
    openNativeConfigReadView(Option.isSome(view) ? view.value.mode : "faithful")(effect),
  );

/** Parse the exact grammar; sharing never substitutes a weaker reader or its error vocabulary. */
export const parseNativeConfigRoot = <E>(args: {
  readonly format: McpConfigTarget["format"];
  readonly raw: string;
  readonly onFailure: (failure: NativeConfigRootFailure) => E;
}): Effect.Effect<NativeDocument, E> =>
  Effect.gen(function* () {
    const view = yield* Effect.serviceOption(NativeConfigReadView);
    if (Option.isNone(view))
      return yield* parseDocument(args.format, args.raw).pipe(Effect.mapError(args.onFailure));
    return yield* view.value.parse(args.format, args.raw).pipe(
      // Shared syntax remains private; readers keep independently owned values.
      Effect.map((root) => copyDocument(view.value.mode, args.format, root)),
      Effect.mapError(args.onFailure),
    );
  });

/** The failure readers without their own vocabulary report for a document they cannot parse. */
export const invalidNativeConfig =
  (format: McpConfigTarget["format"], configPath: string) =>
  (failure: NativeConfigRootFailure): McpConfigInvalid =>
    new McpConfigInvalid({
      detail: `Invalid native ${format} configuration: ${configPath}`,
      cause:
        failure.reason === "syntax"
          ? failure.cause
          : new Error("Native configuration root must be an object"),
    });
