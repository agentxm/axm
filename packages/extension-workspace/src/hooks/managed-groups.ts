/**
 * Managed hook-group editing for agent JSON settings files.
 *
 * Kept free of service dependencies so workspace cleanup can strip AXM-managed
 * hook groups without importing the hook manager, which requires
 * `WorkspaceMutations` and would form a layer cycle.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { HookConfigInvalid } from "./errors.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonConfig = (
  configPath: string,
  raw: string,
): Effect.Effect<unknown, HookConfigInvalid> =>
  Effect.try({
    try: () => {
      const errors: Array<ParseError> = [];
      const parsed: unknown = parse(raw, errors, { allowTrailingComma: true });
      if (errors.length > 0) {
        throw errors;
      }
      return parsed;
    },
    catch: (error) =>
      new HookConfigInvalid({
        detail: `Invalid Claude Code hooks config JSON/JSONC: ${configPath}`,
        cause: error,
      }),
  });

const validateHooksShape = (
  configPath: string,
  settingsKey: string,
  parsed: unknown,
): Effect.Effect<void, HookConfigInvalid> => {
  if (!isRecord(parsed)) {
    return Effect.fail(
      new HookConfigInvalid({ detail: `Invalid hooks config format: ${configPath}` }),
    );
  }
  const hooks = parsed[settingsKey];
  if (hooks !== undefined && !isRecord(hooks)) {
    return Effect.fail(
      new HookConfigInvalid({
        detail: `Invalid hooks config format: ${configPath} (${settingsKey} must be an object)`,
      }),
    );
  }
  return Effect.void;
};

interface ManagedHookCommand {
  readonly type: "command";
  readonly command: string;
  readonly "x-axm": {
    readonly v: 1;
    readonly managed: true;
    readonly unit: string;
    readonly source: string;
    readonly ref: string;
  };
}

export const isManagedHookEntry = (value: unknown): value is ManagedHookCommand => {
  if (!isRecord(value) || value["type"] !== "command" || typeof value["command"] !== "string") {
    return false;
  }
  const metadata = value["x-axm"];
  return (
    isRecord(metadata) &&
    metadata["v"] === 1 &&
    metadata["managed"] === true &&
    typeof metadata["unit"] === "string" &&
    metadata["unit"].startsWith("hook:") &&
    typeof metadata["source"] === "string" &&
    typeof metadata["ref"] === "string"
  );
};

/** Commands recovered from AXM-owned hook entries in one hooks object. */
export const managedHookCommands = (hooks: unknown): ReadonlyArray<string> => {
  if (!isRecord(hooks)) return [];
  const commands: Array<string> = [];
  for (const groups of Object.values(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group["hooks"])) continue;
      for (const entry of group["hooks"]) {
        if (isManagedHookEntry(entry)) commands.push(entry.command);
      }
    }
  }
  return commands;
};

export const ambiguousHookCommands = (hooks: unknown): ReadonlyArray<string> => {
  if (!isRecord(hooks)) return [];
  const commands: Array<string> = [];
  for (const groups of Object.values(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group["hooks"])) continue;
      for (const entry of group["hooks"]) {
        if (
          isRecord(entry) &&
          entry["type"] === "command" &&
          typeof entry["command"] === "string" &&
          entry["command"].includes("agent_extensions/") &&
          !isManagedHookEntry(entry)
        ) {
          commands.push(entry["command"]);
        }
      }
    }
  }
  return commands;
};

/** Parse a native config and recover commands only from its managed hook unit. */
export const readManagedHookCommands = (
  configPath: string,
  settingsKey: string,
  raw: string,
): Effect.Effect<ReadonlyArray<string>, HookConfigInvalid> =>
  Effect.gen(function* () {
    const parsed = yield* parseJsonConfig(configPath, raw.trim().length === 0 ? "{}\n" : raw);
    yield* validateHooksShape(configPath, settingsKey, parsed);
    return isRecord(parsed) ? managedHookCommands(parsed[settingsKey]) : [];
  });

export const readAmbiguousHookCommands = (
  configPath: string,
  settingsKey: string,
  raw: string,
): Effect.Effect<ReadonlyArray<string>, HookConfigInvalid> =>
  Effect.gen(function* () {
    const parsed = yield* parseJsonConfig(configPath, raw.trim().length === 0 ? "{}\n" : raw);
    yield* validateHooksShape(configPath, settingsKey, parsed);
    return isRecord(parsed) ? ambiguousHookCommands(parsed[settingsKey]) : [];
  });

const structurallyEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => structurallyEqual(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => key in right && structurallyEqual(left[key], right[key]))
  );
};

export const stripManagedHookGroups = (hooks: Record<string, unknown>): Record<string, unknown> => {
  const next: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      next[event] = groups;
      continue;
    }

    const retainedGroups: unknown[] = [];
    for (const group of groups) {
      if (!isRecord(group)) {
        retainedGroups.push(group);
        continue;
      }

      const groupHooks = group["hooks"];
      if (!Array.isArray(groupHooks)) {
        retainedGroups.push(group);
        continue;
      }

      const retainedHooks = groupHooks.filter((entry) => !isManagedHookEntry(entry));
      if (retainedHooks.length > 0) {
        retainedGroups.push({ ...group, hooks: retainedHooks });
      }
    }

    if (retainedGroups.length > 0) {
      next[event] = retainedGroups;
    }
  }
  return next;
};

/**
 * Rewrite `settingsKey` so it holds `renderedHooks` plus every user-authored
 * group already present. Edits go through jsonc-parser so comments and
 * formatting in user-owned settings files survive.
 */
export const updateHooksJson = (
  configPath: string,
  settingsKey: string,
  raw: string,
  renderedHooks: Record<string, unknown>,
): Effect.Effect<string, HookConfigInvalid> =>
  Effect.gen(function* () {
    const initial = raw.trim().length === 0 ? "{}\n" : raw;
    const parsed = yield* parseJsonConfig(configPath, initial);
    yield* validateHooksShape(configPath, settingsKey, parsed);
    const existingHooks =
      isRecord(parsed) && isRecord(parsed[settingsKey])
        ? stripManagedHookGroups(parsed[settingsKey])
        : {};

    for (const [event, groups] of Object.entries(renderedHooks)) {
      const existingGroups = existingHooks[event];
      const renderedGroups = Array.isArray(groups) ? groups : [groups];
      const retainedGroups = Array.isArray(existingGroups)
        ? existingGroups.filter(
            (existing) => !renderedGroups.some((rendered) => structurallyEqual(existing, rendered)),
          )
        : [];
      existingHooks[event] = [...retainedGroups, ...renderedGroups];
    }

    const hooksKeys = Object.keys(existingHooks);
    const edits = modify(
      initial,
      [settingsKey],
      hooksKeys.length === 0 ? undefined : existingHooks,
      {
        formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
      },
    );
    return applyEdits(initial, edits);
  });

/**
 * Remove every AXM-managed hook group from `settingsKey`, retaining
 * user-authored groups. Used when an agent is removed from the workspace and
 * its rendered hooks must stop running.
 */
export const stripManagedHooksFromJson = (
  configPath: string,
  settingsKey: string,
  raw: string,
): Effect.Effect<string, HookConfigInvalid> => updateHooksJson(configPath, settingsKey, raw, {});
