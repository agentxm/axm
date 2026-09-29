/**
 * Managed hook-group editing for agent JSON settings files.
 *
 * Kept free of service dependencies so workspace cleanup can strip AXM-managed
 * hook groups without importing the hook manager, which requires
 * workspace-state writers and would form a layer cycle.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { HookConfigInvalid } from "../errors.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonConfig = (
  configPath: string,
  raw: string,
  format: "json" | "jsonc" = "jsonc",
): Effect.Effect<unknown, HookConfigInvalid> =>
  Effect.try({
    try: () => {
      const errors: Array<ParseError> = [];
      const parsed: unknown = parse(raw, errors, {
        allowTrailingComma: format === "jsonc",
        disallowComments: format === "json",
      });
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
  if (
    isRecord(hooks) &&
    Object.values(hooks).some(
      (groups) =>
        !Array.isArray(groups) ||
        groups.some((group) => !isRecord(group) || !Array.isArray(group["hooks"])),
    )
  ) {
    return Effect.fail(
      new HookConfigInvalid({ detail: `Invalid hook event/group structure: ${configPath}` }),
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
    readonly scope: "project" | "user";
    readonly root: string;
  };
}

/** Current selected-scope authority; marker syntax alone never proves ownership. */
export interface HookOwnership {
  readonly name: string;
  readonly ref: string;
  readonly scope: "project" | "user";
  readonly root: string;
}

export interface ManagedHookUnit {
  readonly name: string;
  readonly command: string;
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
    metadata["source"] === "extension" &&
    typeof metadata["ref"] === "string" &&
    (metadata["scope"] === "project" || metadata["scope"] === "user") &&
    typeof metadata["root"] === "string"
  );
};

export const isOwnedHookEntry = (
  value: unknown,
  ownership: ReadonlyArray<HookOwnership>,
): value is ManagedHookCommand =>
  isManagedHookEntry(value) &&
  ownership.some(
    (owner) =>
      value["x-axm"].unit === `hook:${owner.name}` &&
      value["x-axm"].ref === owner.ref &&
      value["x-axm"].scope === owner.scope &&
      value["x-axm"].root === owner.root,
  );

/** Commands recovered from AXM-owned hook entries in one hooks object. */
export const managedHookCommands = (
  hooks: unknown,
  ownership: ReadonlyArray<HookOwnership>,
): ReadonlyArray<string> => {
  if (!isRecord(hooks)) return [];
  const commands: Array<string> = [];
  for (const groups of Object.values(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group["hooks"])) continue;
      for (const entry of group["hooks"]) {
        if (isOwnedHookEntry(entry, ownership)) commands.push(entry.command);
      }
    }
  }
  return commands;
};

/** AXM-owned hook units recovered from one native hooks object. */
export const managedHookUnits = (
  hooks: unknown,
  ownership: ReadonlyArray<HookOwnership>,
): ReadonlyArray<ManagedHookUnit> => {
  if (!isRecord(hooks)) return [];
  const units: Array<ManagedHookUnit> = [];
  for (const groups of Object.values(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group["hooks"])) continue;
      for (const entry of group["hooks"]) {
        if (!isOwnedHookEntry(entry, ownership)) continue;
        units.push({
          name: entry["x-axm"].unit.slice("hook:".length),
          command: entry.command,
        });
      }
    }
  }
  return units;
};

export const ambiguousHookCommands = (
  hooks: unknown,
  ownership: ReadonlyArray<HookOwnership>,
): ReadonlyArray<string> => {
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
          !isOwnedHookEntry(entry, ownership)
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
  ownership: ReadonlyArray<HookOwnership>,
): Effect.Effect<ReadonlyArray<string>, HookConfigInvalid> =>
  Effect.gen(function* () {
    const parsed = yield* parseJsonConfig(configPath, raw.trim().length === 0 ? "{}\n" : raw);
    yield* validateHooksShape(configPath, settingsKey, parsed);
    return isRecord(parsed) ? managedHookCommands(parsed[settingsKey], ownership) : [];
  });

/** Parse a native config and recover its AXM-owned hook units. */
export const readManagedHookUnits = (
  configPath: string,
  settingsKey: string,
  raw: string,
  ownership: ReadonlyArray<HookOwnership>,
): Effect.Effect<ReadonlyArray<ManagedHookUnit>, HookConfigInvalid> =>
  Effect.gen(function* () {
    const parsed = yield* parseJsonConfig(configPath, raw.trim().length === 0 ? "{}\n" : raw);
    yield* validateHooksShape(configPath, settingsKey, parsed);
    return isRecord(parsed) ? managedHookUnits(parsed[settingsKey], ownership) : [];
  });

export const readManagedHookGroups = (
  configPath: string,
  settingsKey: string,
  raw: string,
  ownership: ReadonlyArray<HookOwnership>,
): Effect.Effect<Record<string, unknown>, HookConfigInvalid> =>
  Effect.gen(function* () {
    const parsed = yield* parseJsonConfig(configPath, raw.trim().length === 0 ? "{}\n" : raw);
    yield* validateHooksShape(configPath, settingsKey, parsed);
    const selected: Record<string, unknown> = {};
    if (!isRecord(parsed) || !isRecord(parsed[settingsKey])) return selected;
    for (const [event, groups] of Object.entries(parsed[settingsKey])) {
      if (!Array.isArray(groups)) continue;
      const retained = groups.flatMap((group) => {
        if (!isRecord(group) || !Array.isArray(group["hooks"])) return [];
        const hooks = group["hooks"].filter((entry) => isOwnedHookEntry(entry, ownership));
        return hooks.length === 0 ? [] : [{ ...group, hooks }];
      });
      if (retained.length > 0) selected[event] = retained;
    }
    return selected;
  });

export const readAmbiguousHookCommands = (
  configPath: string,
  settingsKey: string,
  raw: string,
  ownership: ReadonlyArray<HookOwnership>,
): Effect.Effect<ReadonlyArray<string>, HookConfigInvalid> =>
  Effect.gen(function* () {
    const parsed = yield* parseJsonConfig(configPath, raw.trim().length === 0 ? "{}\n" : raw);
    yield* validateHooksShape(configPath, settingsKey, parsed);
    return isRecord(parsed) ? ambiguousHookCommands(parsed[settingsKey], ownership) : [];
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

export const stripManagedHookGroups = (
  hooks: Record<string, unknown>,
  ownership: ReadonlyArray<HookOwnership>,
): Record<string, unknown> => {
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

      const retainedHooks = groupHooks.filter((entry) => !isOwnedHookEntry(entry, ownership));
      if (retainedHooks.length > 0 || groupHooks.length === 0) {
        retainedGroups.push({ ...group, hooks: retainedHooks });
      }
    }

    if (retainedGroups.length > 0 || groups.length === 0) {
      next[event] = retainedGroups;
    }
  }
  return next;
};

const retainExpectedManagedHookGroups = (
  hooks: Record<string, unknown>,
  expectedNames: ReadonlySet<string>,
  ownership: ReadonlyArray<HookOwnership>,
): Record<string, unknown> => {
  const next: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      next[event] = groups;
      continue;
    }

    const retainedGroups: unknown[] = [];
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group["hooks"])) {
        retainedGroups.push(group);
        continue;
      }
      const retainedHooks = group["hooks"].filter(
        (entry) =>
          !isOwnedHookEntry(entry, ownership) ||
          expectedNames.has(entry["x-axm"].unit.slice("hook:".length)),
      );
      if (retainedHooks.length > 0 || group["hooks"].length === 0)
        retainedGroups.push({ ...group, hooks: retainedHooks });
    }
    if (retainedGroups.length > 0 || groups.length === 0) next[event] = retainedGroups;
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
  ownership: ReadonlyArray<HookOwnership>,
  format: "json" | "jsonc" = "jsonc",
): Effect.Effect<string, HookConfigInvalid> =>
  Effect.gen(function* () {
    const initial = raw.trim().length === 0 ? "{}\n" : raw;
    const parsed = yield* parseJsonConfig(configPath, initial, format);
    yield* validateHooksShape(configPath, settingsKey, parsed);
    const desiredUnits = new Set(
      Object.values(renderedHooks).flatMap((groups) =>
        !Array.isArray(groups)
          ? []
          : groups.flatMap((group) =>
              !isRecord(group) || !Array.isArray(group["hooks"])
                ? []
                : group["hooks"].flatMap((entry) =>
                    isManagedHookEntry(entry) ? [entry["x-axm"].unit] : [],
                  ),
            ),
      ),
    );
    if (isRecord(parsed) && isRecord(parsed[settingsKey])) {
      for (const groups of Object.values(parsed[settingsKey])) {
        if (!Array.isArray(groups)) continue;
        for (const group of groups) {
          if (!isRecord(group) || !Array.isArray(group["hooks"])) continue;
          for (const entry of group["hooks"]) {
            if (!isRecord(entry) || !isRecord(entry["x-axm"])) continue;
            const unit = entry["x-axm"]["unit"];
            if (
              typeof unit === "string" &&
              desiredUnits.has(unit) &&
              !isOwnedHookEntry(entry, ownership)
            ) {
              return yield* new HookConfigInvalid({
                detail: `Hook ownership conflicts for ${unit} in ${configPath}`,
              });
            }
          }
        }
      }
    }
    const existingHooks =
      isRecord(parsed) && isRecord(parsed[settingsKey])
        ? stripManagedHookGroups(parsed[settingsKey], ownership)
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

    if (isRecord(parsed) && structurallyEqual(parsed[settingsKey] ?? {}, existingHooks)) return raw;
    return yield* editHookEntries(configPath, settingsKey, initial, ownership, renderedHooks);
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
  ownership: ReadonlyArray<HookOwnership>,
): Effect.Effect<string, HookConfigInvalid> =>
  updateHooksJson(configPath, settingsKey, raw, {}, ownership);

/** Remove unexpected AXM-owned hook units while preserving expected and user-authored groups. */
export const pruneManagedHooksFromJson = (
  configPath: string,
  settingsKey: string,
  raw: string,
  expectedNames: ReadonlySet<string>,
  ownership: ReadonlyArray<HookOwnership>,
): Effect.Effect<string, HookConfigInvalid> =>
  Effect.gen(function* () {
    const initial = raw.trim().length === 0 ? "{}\n" : raw;
    const parsed = yield* parseJsonConfig(configPath, initial);
    yield* validateHooksShape(configPath, settingsKey, parsed);
    if (!isRecord(parsed) || !isRecord(parsed[settingsKey])) return initial;
    const retained = retainExpectedManagedHookGroups(parsed[settingsKey], expectedNames, ownership);
    if (structurallyEqual(parsed[settingsKey], retained)) return raw;
    return yield* editHookEntries(
      configPath,
      settingsKey,
      initial,
      ownership.filter((owner) => !expectedNames.has(owner.name)),
      {},
    );
  });

/** Edit only owned array entries; foreign comments, bytes, and empty groups survive. */
const editHookEntries = (
  configPath: string,
  settingsKey: string,
  raw: string,
  ownership: ReadonlyArray<HookOwnership>,
  rendered: Record<string, unknown>,
): Effect.Effect<string, HookConfigInvalid> =>
  Effect.gen(function* () {
    const parsed = yield* parseJsonConfig(configPath, raw);
    let next = raw;
    const edit = (keys: ReadonlyArray<string | number>, value: unknown, insertion = false) => {
      next = applyEdits(
        next,
        modify(next, [...keys], value, {
          isArrayInsertion: insertion,
          formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
        }),
      );
    };
    const hooks = isRecord(parsed) && isRecord(parsed[settingsKey]) ? parsed[settingsKey] : {};
    for (const [event, groups] of Object.entries(hooks)) {
      if (!Array.isArray(groups)) continue;
      for (let groupIndex = groups.length - 1; groupIndex >= 0; groupIndex--) {
        const group = groups[groupIndex];
        if (!isRecord(group) || !Array.isArray(group["hooks"])) continue;
        const desiredGroups = rendered[event];
        if (
          Array.isArray(desiredGroups) &&
          desiredGroups.some((desired) => structurallyEqual(desired, group))
        )
          continue;
        const entries = group["hooks"];
        const owned = entries.flatMap((entry, index) =>
          isOwnedHookEntry(entry, ownership) ? [index] : [],
        );
        if (owned.length === 0) continue;
        if (owned.length === entries.length) edit([settingsKey, event, groupIndex], undefined);
        else
          for (const index of owned.reverse())
            edit([settingsKey, event, groupIndex, "hooks", index], undefined);
      }
      const current = yield* parseJsonConfig(configPath, next);
      if (isRecord(current) && isRecord(current[settingsKey])) {
        const remaining = current[settingsKey][event];
        if (Array.isArray(remaining) && remaining.length === 0 && groups.length > 0)
          edit([settingsKey, event], undefined);
      }
    }
    for (const [event, groups] of Object.entries(rendered)) {
      const current = yield* parseJsonConfig(configPath, next);
      const existing =
        isRecord(current) && isRecord(current[settingsKey])
          ? current[settingsKey][event]
          : undefined;
      const additions = Array.isArray(groups) ? groups : [groups];
      if (Array.isArray(existing)) {
        for (const group of additions) {
          if (!existing.some((present) => structurallyEqual(present, group)))
            edit([settingsKey, event, -1], group, true);
        }
      } else edit([settingsKey, event], additions);
    }
    const current = yield* parseJsonConfig(configPath, next);
    if (
      isRecord(current) &&
      isRecord(current[settingsKey]) &&
      Object.keys(current[settingsKey]).length === 0 &&
      Object.keys(hooks).length > 0
    )
      edit([settingsKey], undefined);
    return next;
  });
