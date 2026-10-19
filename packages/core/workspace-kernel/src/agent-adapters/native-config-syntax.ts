/** Whole-file grammar shared by every structured native reader. */
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import { parse, type ParseError } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
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

/**
 * Parse a native document whose root must be an object. An empty or
 * whitespace-only file is an empty object in every format.
 */
export const parseNativeConfigRoot = <E>(args: {
  readonly format: McpConfigTarget["format"];
  readonly raw: string;
  readonly onFailure: (failure: NativeConfigRootFailure) => E;
}): Effect.Effect<Readonly<Record<string, unknown>>, E> =>
  Effect.gen(function* () {
    if (args.raw.trim().length === 0) return {};
    const root = yield* Effect.try({
      try: () => parseRoot(args.format, args.raw),
      catch: (cause) => args.onFailure({ reason: "syntax", cause }),
    });
    if (!Predicate.isObject(root)) return yield* Effect.fail(args.onFailure({ reason: "shape" }));
    return root;
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
