/**
 * Declaration-selected hook editing for agent JSON settings files.
 *
 * Pure native command selection and structured edits preserve unrelated hooks
 * without depending on the Hook manager or workspace-state writers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import { parse as parseShell } from "shell-quote";
import { applyEdits, modify } from "jsonc-parser";
import { HookConfigInvalid } from "../errors.js";
import { parseNativeConfigRoot } from "../native-config-syntax.js";

const parseJsonConfig = (
  configPath: string,
  raw: string,
  format: "json" | "jsonc" = "jsonc",
): Effect.Effect<Readonly<Record<string, unknown>>, HookConfigInvalid> =>
  parseNativeConfigRoot({
    format,
    raw,
    onFailure: (failure) =>
      failure.reason === "shape"
        ? new HookConfigInvalid({ detail: `Invalid hooks config format: ${configPath}` })
        : new HookConfigInvalid({
            detail: `Invalid native hooks config JSON/JSONC: ${configPath}`,
            cause: failure.cause,
          }),
  });

const validateHooksShape = (
  configPath: string,
  settingsKey: string,
  parsed: Readonly<Record<string, unknown>>,
): Effect.Effect<void, HookConfigInvalid> => {
  const hooks = parsed[settingsKey];
  if (hooks !== undefined && !Predicate.isObject(hooks)) {
    return Effect.fail(
      new HookConfigInvalid({
        detail: `Invalid hooks config format: ${configPath} (${settingsKey} must be an object)`,
      }),
    );
  }
  if (
    Predicate.isObject(hooks) &&
    Object.values(hooks).some(
      (groups) =>
        !Array.isArray(groups) ||
        groups.some(
          (group) =>
            !Predicate.isObject(group) ||
            (group["hooks"] !== undefined && !Array.isArray(group["hooks"])),
        ),
    )
  ) {
    return Effect.fail(
      new HookConfigInvalid({ detail: `Invalid hook event/group structure: ${configPath}` }),
    );
  }
  return Effect.void;
};

/** A configured package selects command registrations invoking its canonical scripts. */
export interface HookNativeDeclaration {
  readonly name: string;
  readonly ref: string;
  readonly scope: "project" | "user";
  /** Absolute canonical package root captured for the selected scope. */
  readonly root: string;
}

export interface DeclaredHookUnit {
  readonly name: string;
  readonly command?: string;
}

const entriesIn = (group: unknown): ReadonlyArray<unknown> =>
  !Predicate.isObject(group) ? [] : Array.isArray(group["hooks"]) ? group["hooks"] : [group];

const scriptWithin = (script: string, root: string): boolean => {
  const prefix = root.replace(/\\/gu, "/").replace(/\/$/u, "") + "/";
  const normalized = script.replace(/\\/gu, "/");
  const tail = normalized.slice(prefix.length);
  return (
    normalized.startsWith(prefix) &&
    tail.length > 0 &&
    tail.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")
  );
};

/** shell-quote decodes words but does not model command substitution or newline commands. */
const hasShellComposition = (command: string): boolean => {
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (let index = 0; index < command.length; index++) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (character === "'" && quote !== '"') {
      quote = quote === "'" ? undefined : "'";
      continue;
    }
    if (character === '"' && quote !== "'") {
      quote = quote === '"' ? undefined : '"';
      continue;
    }
    if (quote !== "'" && (character === "`" || (character === "$" && command[index + 1] === "(")))
      return true;
    if (quote === undefined && (character === "\n" || character === "\r")) return true;
  }
  return false;
};

/** Decode, never evaluate, the direct runtime-and-script command AXM projects. */
const commandScript = (command: string): string | undefined => {
  if (hasShellComposition(command)) return undefined;
  try {
    const tokens = parseShell(command, () => "__AXM_UNRESOLVED__");
    let index = 0;
    while (
      typeof tokens[index] === "string" &&
      /^[A-Za-z_][A-Za-z0-9_]*=/u.test(String(tokens[index]))
    )
      index++;
    const runtime = tokens[index];
    const script = tokens[index + 1];
    if (
      typeof runtime !== "string" ||
      !["bash", "node", "bun", "python3"].includes(runtime) ||
      typeof script !== "string" ||
      tokens.slice(0, index + 2).some((token) => typeof token !== "string")
    )
      return undefined;
    // Arguments may contain unresolved secret references; shell operators cannot identify a direct registration.
    if (tokens.some((token) => typeof token === "object" && ("op" in token || "comment" in token)))
      return undefined;
    return script;
  } catch {
    return undefined;
  }
};

const declarationForEntry = (
  value: unknown,
  declarations: ReadonlyArray<HookNativeDeclaration>,
) => {
  if (
    !Predicate.isObject(value) ||
    value["type"] !== "command" ||
    typeof value["command"] !== "string"
  )
    return undefined;
  const script = commandScript(value["command"]);
  return script === undefined
    ? undefined
    : declarations.find(({ root }) => scriptWithin(script, root));
};

export const isDeclaredHookEntry = (
  value: unknown,
  declarations: ReadonlyArray<HookNativeDeclaration>,
): value is Readonly<Record<string, unknown>> =>
  declarationForEntry(value, declarations) !== undefined;

export const declaredHookUnits = (
  hooks: unknown,
  declarations: ReadonlyArray<HookNativeDeclaration>,
): ReadonlyArray<DeclaredHookUnit> => {
  if (!Predicate.isObject(hooks)) return [];
  return Object.values(hooks).flatMap((groups) =>
    !Array.isArray(groups)
      ? []
      : groups.flatMap((group) =>
          entriesIn(group).flatMap((entry) => {
            const declaration = declarationForEntry(entry, declarations);
            return declaration === undefined || !Predicate.isObject(entry)
              ? []
              : [
                  {
                    name: declaration.name,
                    ...(typeof entry["command"] === "string" ? { command: entry["command"] } : {}),
                  },
                ];
          }),
        ),
  );
};

export const readDeclaredHookUnits = (
  configPath: string,
  settingsKey: string,
  raw: string,
  declarations: ReadonlyArray<HookNativeDeclaration>,
) =>
  Effect.gen(function* () {
    const parsed = yield* parseJsonConfig(configPath, raw);
    yield* validateHooksShape(configPath, settingsKey, parsed);
    return declaredHookUnits(parsed[settingsKey], declarations);
  });

export const selectDeclaredHookGroups = (
  hooks: unknown,
  declarations: ReadonlyArray<HookNativeDeclaration>,
): Record<string, unknown> => {
  const selected: Record<string, unknown> = {};
  if (!Predicate.isObject(hooks)) return selected;
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    const retained = groups.flatMap((group): ReadonlyArray<Readonly<Record<string, unknown>>> => {
      if (!Predicate.isObject(group)) return [];
      const hooks = entriesIn(group).filter((entry) => isDeclaredHookEntry(entry, declarations));
      return hooks.length === 0
        ? []
        : Array.isArray(group["hooks"])
          ? [{ ...group, hooks }]
          : hooks;
    });
    if (retained.length > 0) selected[event] = retained;
  }
  return selected;
};

export const readDeclaredHookGroups = (
  configPath: string,
  settingsKey: string,
  raw: string,
  declarations: ReadonlyArray<HookNativeDeclaration>,
) =>
  Effect.gen(function* () {
    const parsed = yield* parseJsonConfig(configPath, raw);
    yield* validateHooksShape(configPath, settingsKey, parsed);
    return selectDeclaredHookGroups(parsed[settingsKey], declarations);
  });

const structurallyEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => structurallyEqual(value, right[index]))
    );
  if (!Predicate.isObject(left) || !Predicate.isObject(right)) return false;
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every((key) => key in right && structurallyEqual(left[key], right[key]))
  );
};

/** Replace only the explicitly selected package registrations; absence selects nothing. */
export const updateHooksJson = (
  configPath: string,
  settingsKey: string,
  raw: string,
  renderedHooks: Record<string, unknown>,
  declarations: ReadonlyArray<HookNativeDeclaration>,
  format: "json" | "jsonc" = "jsonc",
  configVersion?: 1,
): Effect.Effect<string, HookConfigInvalid> =>
  Effect.gen(function* () {
    let next = raw.trim().length === 0 ? "{}\n" : raw;
    const parsed = yield* parseJsonConfig(configPath, next, format);
    yield* validateHooksShape(configPath, settingsKey, parsed);
    const edit = (keys: ReadonlyArray<string | number>, value: unknown, insertion = false) => {
      next = applyEdits(
        next,
        modify(next, [...keys], value, {
          isArrayInsertion: insertion,
          formattingOptions: {
            insertSpaces: true,
            tabSize: 2,
            eol: next.includes("\r\n") ? "\r\n" : "\n",
          },
        }),
      );
    };
    for (const declaration of declarations) {
      if (
        declarations.some(
          (other) =>
            other.name !== declaration.name &&
            (other.root === declaration.root ||
              scriptWithin(other.root, declaration.root) ||
              scriptWithin(declaration.root, other.root)),
        )
      )
        return yield* new HookConfigInvalid({
          detail: "Hook declarations select overlapping canonical script roots",
        });
    }
    if (configVersion !== undefined && Object.keys(renderedHooks).length > 0) {
      if (parsed["version"] !== undefined && parsed["version"] !== configVersion)
        return yield* new HookConfigInvalid({
          detail: `Unsupported native Hook config version in ${configPath}`,
        });
      if (parsed["version"] === undefined) edit(["version"], configVersion);
    }
    const existing = Predicate.isObject(parsed[settingsKey]) ? parsed[settingsKey] : {};
    for (const [event, groups] of Object.entries(renderedHooks)) {
      if (
        !Array.isArray(groups) ||
        groups.some((group) =>
          entriesIn(group).some((entry) => !isDeclaredHookEntry(entry, declarations)),
        )
      )
        return yield* new HookConfigInvalid({
          detail: `Hook declaration cannot address every rendered registration for ${event}`,
        });
      if (
        groups.some((group, index) =>
          groups.slice(0, index).some((prior) => structurallyEqual(prior, group)),
        )
      )
        return yield* new HookConfigInvalid({ detail: `Duplicate Hook registration for ${event}` });
    }
    for (const groups of Object.values(existing)) {
      if (!Array.isArray(groups)) continue;
      for (const group of groups)
        for (const entry of entriesIn(group)) {
          if (
            !Predicate.isObject(entry) ||
            entry["type"] !== "command" ||
            typeof entry["command"] !== "string" ||
            commandScript(entry["command"]) !== undefined
          )
            continue;
          const command = entry["command"];
          const tokens = yield* Effect.try({
            try: () => parseShell(command, () => "__AXM_UNRESOLVED__"),
            catch: (cause) =>
              new HookConfigInvalid({ detail: "Cannot parse a native Hook command", cause }),
          });
          if (
            tokens.some(
              (token, index) =>
                typeof token === "string" &&
                ["bash", "node", "bun", "python3"].includes(token) &&
                declarations.some(
                  ({ root }) =>
                    typeof tokens[index + 1] === "string" &&
                    scriptWithin(String(tokens[index + 1]), root),
                ),
            )
          )
            return yield* new HookConfigInvalid({
              detail:
                "A selected Hook script uses unsupported shell composition; use a direct runtime invocation before updating it",
            });
        }
    }
    for (const event of new Set([...Object.keys(existing), ...Object.keys(renderedHooks)])) {
      const oldGroups = existing[event];
      const groups = Array.isArray(oldGroups) ? oldGroups : [];
      const desired = renderedHooks[event];
      const additions = Array.isArray(desired) ? desired : desired === undefined ? [] : [desired];
      const selected = selectDeclaredHookGroups({ [event]: groups }, declarations)[event] ?? [];
      if (structurallyEqual(selected, additions)) continue;
      let insertionIndex = groups.findIndex((group) =>
        entriesIn(group).some((entry) => isDeclaredHookEntry(entry, declarations)),
      );
      if (insertionIndex < 0) insertionIndex = groups.length;
      for (let index = groups.length - 1; index >= 0; index--) {
        const group = groups[index];
        if (!Predicate.isObject(group)) continue;
        const entries = entriesIn(group);
        const selectedIndices = entries.flatMap((entry, i) =>
          isDeclaredHookEntry(entry, declarations) ? [i] : [],
        );
        if (selectedIndices.length === 0) continue;
        if (selectedIndices.length === entries.length) edit([settingsKey, event, index], undefined);
        else
          for (const hookIndex of selectedIndices.reverse())
            edit([settingsKey, event, index, "hooks", hookIndex], undefined);
      }
      if (oldGroups === undefined && additions.length > 0) edit([settingsKey, event], additions);
      else
        for (const [offset, group] of additions.entries())
          edit([settingsKey, event, insertionIndex + offset], group, true);
    }
    yield* parseJsonConfig(configPath, next, format);
    return next === (raw.trim().length === 0 ? "{}\n" : raw) ? raw : next;
  });
