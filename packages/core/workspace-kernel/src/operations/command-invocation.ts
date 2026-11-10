import { isSafeSuggestedAxmCommand } from "@agentxm/registry-protocol/unstable/suggested-action";
import * as Schema from "effect/Schema";

/** Safe invocation data independent of approval, retry selection, or workspace policy. */
const CommandInvocationValueSchema = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("Public"), value: Schema.String }),
  Schema.Struct({ _tag: Schema.Literal("Protected") }),
  Schema.Struct({ _tag: Schema.Literal("Unclassified") }),
]);
export type CommandInvocationValue = typeof CommandInvocationValueSchema.Type;
const CommandInvocationArgumentSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("Option"),
    flag: Schema.String,
    value: CommandInvocationValueSchema,
  }),
  Schema.Struct({ _tag: Schema.Literal("Positional"), value: CommandInvocationValueSchema }),
  Schema.Struct({ _tag: Schema.Literal("Switch"), flag: Schema.String, enabled: Schema.Boolean }),
]);
export type CommandInvocationArgument = typeof CommandInvocationArgumentSchema.Type;
export const CommandInvocationSchema = Schema.Struct({
  command: Schema.Array(Schema.String),
  arguments: Schema.Array(CommandInvocationArgumentSchema),
});
export type CommandInvocation = typeof CommandInvocationSchema.Type;

export const publicRecoveryValue = (value: string): CommandInvocationValue => ({
  _tag: "Public",
  value,
});

export const protectedRecoveryValue = (): CommandInvocationValue => ({ _tag: "Protected" });

export const unclassifiedRecoveryValue = (): CommandInvocationValue => ({
  _tag: "Unclassified",
});

export const credentialFreeLocatorRecoveryValue = (value: string): CommandInvocationValue => {
  try {
    const parsed = new URL(value);
    const hasSensitiveQuery = [...parsed.searchParams.keys()].some((key) =>
      /(?:auth|key|password|secret|signature|token)/i.test(key),
    );
    return parsed.username.length === 0 && parsed.password.length === 0 && !hasSensitiveQuery
      ? publicRecoveryValue(value)
      : protectedRecoveryValue();
  } catch {
    return publicRecoveryValue(value);
  }
};

export const recoveryOption = (
  flag: string,
  value: CommandInvocationValue,
): CommandInvocationArgument => ({ _tag: "Option", flag, value });

export const recoveryPositional = (value: CommandInvocationValue): CommandInvocationArgument => ({
  _tag: "Positional",
  value,
});

export const recoverySwitch = (flag: string, enabled: boolean): CommandInvocationArgument => ({
  _tag: "Switch",
  flag,
  enabled,
});

const safeShellToken = /^[A-Za-z0-9_@%+=:,./^-]+$/;

const quoteShellToken = (value: string, shell: "posix" | "powershell"): string =>
  value.length > 0 && safeShellToken.test(value)
    ? value
    : shell === "powershell"
      ? `'${value.replaceAll("'", "''")}'`
      : `'${value.replaceAll("'", `'"'"'`)}'`;

const isReplayable = (argument: CommandInvocationArgument): boolean =>
  argument._tag === "Switch" || argument.value._tag === "Public";

const renderValue = (
  value: CommandInvocationValue,
  shell: "posix" | "powershell",
): string | undefined =>
  value._tag === "Public" ? quoteShellToken(value.value, shell) : undefined;

/** Serialize classified arguments only. Policy transformations happen before rendering. */
export const renderCommandInvocation = (
  invocation: CommandInvocation,
  shell: "posix" | "powershell" = process.platform === "win32" ? "powershell" : "posix",
): string | undefined => {
  if (
    invocation.command.length === 0 ||
    !invocation.command.every((word) => /^[a-z][a-z0-9-]*$/u.test(word)) ||
    !invocation.arguments.every(isReplayable)
  )
    return undefined;
  if (
    invocation.arguments.some(
      (argument) => argument._tag !== "Positional" && !/^--?[a-z][a-z0-9-]*$/u.test(argument.flag),
    )
  )
    return undefined;
  const options = invocation.arguments.flatMap((argument): ReadonlyArray<string> => {
    if (argument._tag === "Switch") return argument.enabled ? [argument.flag] : [];
    if (argument._tag === "Positional") return [];
    const value = renderValue(argument.value, shell);
    return value === undefined
      ? []
      : argument.value._tag === "Public" && argument.value.value.startsWith("-")
        ? [`${argument.flag}=${value}`]
        : [argument.flag, value];
  });
  const positionals = invocation.arguments.flatMap((argument): ReadonlyArray<string> => {
    if (argument._tag !== "Positional") return [];
    const value = renderValue(argument.value, shell);
    return value === undefined ? [] : [value];
  });
  const terminator = invocation.arguments.some(
    (argument) =>
      argument._tag === "Positional" &&
      argument.value._tag === "Public" &&
      argument.value.value.startsWith("-"),
  );
  const command = [
    "axm",
    ...invocation.command,
    ...options,
    ...(terminator ? ["--"] : []),
    ...positionals,
  ].join(" ");
  return isSafeSuggestedAxmCommand(command) ? command : undefined;
};

/** Replace one named option without interpreting any rendered shell text. */
export const withInvocationOption = (
  invocation: CommandInvocation,
  flag: string,
  value: CommandInvocationValue,
): CommandInvocation => ({
  ...invocation,
  arguments: [
    ...invocation.arguments.filter(
      (argument) => argument._tag === "Positional" || argument.flag !== flag,
    ),
    recoveryOption(flag, value),
  ],
});
