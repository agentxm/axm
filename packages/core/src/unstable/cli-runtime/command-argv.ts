import * as ServiceMap from "effect/Context";
import { Command } from "effect/unstable/cli";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface CommandArgvService {
  readonly value: Record<string, unknown>;
  readonly paramKinds: Record<string, "argument" | "flag">;
}

export class CommandArgv extends ServiceMap.Service<CommandArgv, CommandArgvService>()(
  "@agentxm/client-core/unstable/cli-runtime/command-argv/CommandArgv",
) {}

// ---------------------------------------------------------------------------
// Config introspection
// ---------------------------------------------------------------------------

const isParam = (value: unknown): value is { readonly kind: "argument" | "flag" } =>
  value != null &&
  typeof value === "object" &&
  "kind" in value &&
  (value.kind === "argument" || value.kind === "flag");

export const extractParamKinds = (
  config: Record<string, unknown>,
): Record<string, "argument" | "flag"> => {
  const result: Record<string, "argument" | "flag"> = {};
  for (const [key, value] of Object.entries(config)) {
    if (isParam(value)) {
      result[key] = value.kind;
    }
  }
  return result;
};

// ---------------------------------------------------------------------------
// Tracking middleware
// ---------------------------------------------------------------------------

export const withArgvTracking =
  (config: Record<string, unknown>) =>
  <const Name extends string, Input extends Record<string, unknown>, ContextInput, E, R>(
    self: Command.Command<Name, Input, ContextInput, E, R>,
  ) =>
    Command.provideSync(CommandArgv, (input: Input) => ({
      value: input,
      paramKinds: extractParamKinds(config),
    }))(self);

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export const serializeArgv = (
  argv: Record<string, unknown>,
  paramKinds: Record<string, "argument" | "flag">,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(argv)) {
    if (value == null) continue;
    const prefix = paramKinds[key] === "argument" ? "cli.arg" : "cli.flag";
    if (Array.isArray(value)) {
      result[`${prefix}.${key}`] = value.join(",");
    } else {
      result[`${prefix}.${key}`] = String(value);
    }
  }
  return result;
};
