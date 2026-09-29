/** Whole-file grammar shared by every structured native reader. */
import * as Effect from "effect/Effect";
import { parse, type ParseError } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import type { McpConfigTarget } from "@agentxm/extension-model/unstable/agent-capabilities";
import { McpConfigInvalid } from "./errors.js";
import { parseYaml } from "./yaml.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseNativeConfigRoot = (args: {
  readonly format: McpConfigTarget["format"];
  readonly configPath: string;
  readonly raw: string;
}): Effect.Effect<Readonly<Record<string, unknown>>, McpConfigInvalid> =>
  Effect.try({
    try: () => {
      if (args.raw.trim().length === 0) return {};
      let root: unknown;
      if (args.format === "toml") root = parseToml(args.raw);
      else if (args.format === "yaml") root = parseYaml(args.raw);
      else {
        const errors: ParseError[] = [];
        root = parse(args.raw, errors, {
          allowTrailingComma: args.format !== "json",
          disallowComments: args.format === "json",
        });
        if (errors.length > 0) throw errors;
      }
      if (!isRecord(root)) throw new Error("Native configuration root must be an object");
      return root;
    },
    catch: (cause) =>
      new McpConfigInvalid({
        detail: `Invalid native ${args.format} configuration: ${args.configPath}`,
        cause,
      }),
  });
