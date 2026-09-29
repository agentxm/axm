/** Interpret newly introduced Hook commands without claiming untouched foreign commands. */
import type {
  HookEntryDialect,
  HookEventMapping,
  HookToolMapping,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import * as Equal from "effect/Equal";
import * as Option from "effect/Option";

const record = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const hasNativeHookIntroductions = (before: unknown, after: unknown): boolean => {
  if (!Array.isArray(after)) return true;
  const priorGroups: ReadonlyArray<unknown> = Array.isArray(before) ? before : [];
  return after.some((group) => {
    if (!record(group) || !Array.isArray(group["hooks"])) return true;
    const properties = Object.fromEntries(Object.entries(group).filter(([key]) => key !== "hooks"));
    const prior = priorGroups.find(
      (candidate) =>
        record(candidate) &&
        Equal.equals(
          Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== "hooks")),
          properties,
        ),
    );
    const commands = record(prior) ? prior["hooks"] : undefined;
    return !Array.isArray(commands)
      ? group["hooks"].length > 0
      : group["hooks"].some(
          (command) => !commands.some((existing) => Equal.equals(existing, command)),
        );
  });
};

export const interpretNativeHookChanges = (args: {
  readonly before: unknown;
  readonly after: unknown;
  readonly event: HookEventMapping;
  readonly tools: ReadonlyArray<HookToolMapping>;
  readonly dialect: HookEntryDialect;
}): Option.Option<ReadonlyArray<Readonly<Record<string, unknown>>>> => {
  if (!Array.isArray(args.after)) return Option.none();
  const priorGroups: ReadonlyArray<unknown> = Array.isArray(args.before) ? args.before : [];
  const meanings: Array<Readonly<Record<string, unknown>>> = [];
  for (const group of args.after) {
    if (priorGroups.some((prior) => Equal.equals(prior, group))) continue;
    if (!record(group) || !Array.isArray(group["hooks"])) return Option.none();
    const matcher = group["matcher"];
    if (matcher !== undefined && typeof matcher !== "string") return Option.none();
    if (matcher !== undefined && args.event.matcher.kind === "none-imperative")
      return Option.none();
    let normalizedMatcher = matcher ?? null;
    if (typeof matcher === "string" && args.dialect.matcherSerialization === "slash-delimited") {
      if (!matcher.startsWith("/") || !matcher.endsWith("/")) return Option.none();
      normalizedMatcher = matcher.slice(1, -1);
    }
    const priorCommands = priorGroups.flatMap((prior) =>
      record(prior) && Equal.equals(prior["matcher"], matcher) && Array.isArray(prior["hooks"])
        ? prior["hooks"]
        : [],
    );
    for (const command of group["hooks"]) {
      if (priorCommands.some((prior) => Equal.equals(prior, command))) continue;
      if (
        !record(command) ||
        command["type"] !== "command" ||
        typeof command["command"] !== "string"
      )
        return Option.none();
      const timeout = command["timeout"];
      if (
        timeout !== undefined &&
        (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0)
      )
        return Option.none();
      if (
        args.dialect.commandNameSerialization === "manifest" &&
        typeof command["name"] !== "string"
      )
        return Option.none();
      meanings.push({
        event: args.event.canonical,
        matcher: normalizedMatcher,
        matcherKind: matcher === undefined ? null : args.event.matcher.kind,
        toolNames:
          matcher === undefined
            ? []
            : args.tools
                .map(({ nativeName, canonical }) => ({ nativeName, canonical }))
                .sort((left, right) => left.nativeName.localeCompare(right.nativeName)),
        command: command["command"],
        timeoutMs:
          typeof timeout === "number"
            ? timeout * (args.dialect.timeoutSerialization === "seconds" ? 1000 : 1)
            : null,
      });
    }
  }
  return Option.some(meanings);
};
