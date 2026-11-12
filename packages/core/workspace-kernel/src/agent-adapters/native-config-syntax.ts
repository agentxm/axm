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
      }).pipe(
        Effect.withSpan("axm.parse.native", {
          attributes: { "axm.format": format, "axm.work.count": 1 },
        }),
      );

class NativeConfigReadView extends Context.Service<
  NativeConfigReadView,
  { readonly parse: typeof parseDocument }
>()("@agentxm/workspace-kernel/agent-adapters/NativeConfigReadView") {}

/** Exact syntax results belong to one observation or one locked publication. */
export const withNativeConfigReadView = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const cells = new Map<
      McpConfigTarget["format"],
      Map<string, ReturnType<typeof parseDocument>>
    >();
    let active = true;
    const parse: typeof parseDocument = (format, raw) =>
      Effect.gen(function* () {
        if (!active) return yield* parseDocument(format, raw);
        const documents = cells.get(format) ?? new Map<string, ReturnType<typeof parseDocument>>();
        cells.set(format, documents);
        const previous = documents.get(raw);
        if (previous !== undefined) return yield* previous;
        const created = yield* Effect.cached(parseDocument(format, raw));
        const selected = documents.get(raw) ?? created;
        documents.set(raw, selected);
        return yield* selected;
      });
    return yield* effect.pipe(
      Effect.provideService(NativeConfigReadView, { parse }),
      Effect.ensuring(
        Effect.sync(() => {
          active = false;
          cells.clear();
        }),
      ),
    );
  });

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
      Effect.map((root) =>
        args.format === "toml" ? copyTomlDocument(root) : structuredClone(root),
      ),
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
