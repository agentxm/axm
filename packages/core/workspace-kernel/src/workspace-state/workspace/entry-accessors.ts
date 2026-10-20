/**
 * Type-indexed access to the per-type settings and lockfile entry maps.
 *
 * Settings and the lockfile keep one map per installable extension type under
 * type-specific keys. The accessors here let the narrow state services read
 * and write those maps generically — `entries(type)`, `setEntry(type, …)` —
 * while every map keeps its exact schema type, so a caller that names the
 * type statically gets the matching entry type back.
 */

import * as Option from "effect/Option";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type {
  HookLockEntry,
  KnowledgeLockEntry,
  Lockfile,
  McpServerLockEntry,
  PackLockEntry,
  RuleLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../desired/lockfile/schema.js";
import {
  SETTINGS_ENTRY_KEYS,
  type HookEntry,
  type KnowledgeEntry,
  type McpServerEntry,
  type PackEntry,
  type RuleEntry,
  type Settings,
  type SkillEntry,
  type SubagentEntry,
} from "../desired/settings/schema.js";

/** The settings entry type declared for each installable extension type. */
export interface SettingsEntryByType {
  readonly skill: SkillEntry;
  readonly pack: PackEntry;
  readonly "mcp-server": McpServerEntry;
  readonly subagent: SubagentEntry;
  readonly rule: RuleEntry;
  readonly hook: HookEntry;
  readonly knowledge: KnowledgeEntry;
}

/** The accepted-resolution entry type recorded for each installable extension type. */
export interface LockEntryByType {
  readonly skill: SkillLockEntry;
  readonly pack: PackLockEntry;
  readonly "mcp-server": McpServerLockEntry;
  readonly subagent: SubagentLockEntry;
  readonly rule: RuleLockEntry;
  readonly hook: HookLockEntry;
  readonly knowledge: KnowledgeLockEntry;
}

export type SettingsEntriesOf<T extends InstallableExtensionType> = Readonly<
  Record<string, SettingsEntryByType[T]>
>;
export type LockEntriesOf<T extends InstallableExtensionType> = Readonly<
  Record<string, LockEntryByType[T]>
>;

export interface EntriesAccessor<Document, Entry> {
  readonly entries: (document: Document) => Readonly<Record<string, Entry>>;
  readonly entry: (document: Document, name: string) => Option.Option<Entry>;
  readonly set: (document: Document, name: string, entry: Entry) => Document;
  readonly remove: (document: Document, name: string) => Document;
}

/**
 * A settings map accessor, plus the one write that must never be open-coded.
 *
 * `setActivation` is the only supported way to record an enable or disable:
 * an existing entry keeps everything it declares and moves only its
 * activation, while a member that has no entry yet gets a configuration-only
 * one. A caller cannot accidentally turn a Pack-supplied member into an
 * independent declaration by reaching for a source it happens to know.
 */
export interface SettingsEntriesAccessor<Entry> extends EntriesAccessor<Settings, Entry> {
  readonly setActivation: (settings: Settings, name: string, enabled: boolean) => Settings;
}

const accessor = <Document, Entry>(
  read: (document: Document) => Readonly<Record<string, Entry>>,
  write: (document: Document, entries: Readonly<Record<string, Entry>>) => Document,
): EntriesAccessor<Document, Entry> => ({
  entries: read,
  entry: (document, name) => Option.fromUndefinedOr(read(document)[name]),
  set: (document, name, entry) => write(document, { ...read(document), [name]: entry }),
  remove: (document, name) => {
    const { [name]: removed, ...remaining } = read(document);
    void removed;
    return write(document, remaining);
  },
});

/**
 * A settings accessor whose activation write knows the type's configuration
 * form. `configuration` is absent for Packs: a Pack is declared, never
 * supplied by another Pack, so it has no configuration-only entry to create.
 */
const settingsAccessor = <Entry>(
  read: (settings: Settings) => Readonly<Record<string, Entry>>,
  write: (settings: Settings, entries: Readonly<Record<string, Entry>>) => Settings,
  configuration?: (enabled: boolean) => Entry,
): SettingsEntriesAccessor<Entry> => {
  const base = accessor(read, write);
  return {
    ...base,
    setActivation: (settings, name, enabled) => {
      const current = base.entry(settings, name);
      if (Option.isSome(current)) {
        return base.set(settings, name, { ...current.value, enabled });
      }
      return configuration === undefined
        ? settings
        : base.set(settings, name, configuration(enabled));
    },
  };
};

/** Settings entry maps by type; absent maps read as empty. */
export const settingsEntries: {
  readonly [T in InstallableExtensionType]: SettingsEntriesAccessor<SettingsEntryByType[T]>;
} = {
  skill: settingsAccessor(
    (settings) => settings[SETTINGS_ENTRY_KEYS.skill] ?? {},
    (settings, entries) => ({ ...settings, [SETTINGS_ENTRY_KEYS.skill]: entries }),
    (enabled) => ({ kind: "configuration", enabled }),
  ),
  pack: settingsAccessor(
    (settings) => settings[SETTINGS_ENTRY_KEYS.pack] ?? {},
    (settings, entries) => ({ ...settings, [SETTINGS_ENTRY_KEYS.pack]: entries }),
  ),
  "mcp-server": settingsAccessor(
    (settings) => settings[SETTINGS_ENTRY_KEYS["mcp-server"]] ?? {},
    (settings, entries) => ({ ...settings, [SETTINGS_ENTRY_KEYS["mcp-server"]]: entries }),
    (enabled) => ({ kind: "configuration", enabled, env: {} }),
  ),
  subagent: settingsAccessor(
    (settings) => settings[SETTINGS_ENTRY_KEYS.subagent] ?? {},
    (settings, entries) => ({ ...settings, [SETTINGS_ENTRY_KEYS.subagent]: entries }),
    (enabled) => ({ kind: "configuration", enabled }),
  ),
  rule: settingsAccessor(
    (settings) => settings[SETTINGS_ENTRY_KEYS.rule] ?? {},
    (settings, entries) => ({ ...settings, [SETTINGS_ENTRY_KEYS.rule]: entries }),
    (enabled) => ({ kind: "configuration", enabled }),
  ),
  hook: settingsAccessor(
    (settings) => settings[SETTINGS_ENTRY_KEYS.hook] ?? {},
    (settings, entries) => ({ ...settings, [SETTINGS_ENTRY_KEYS.hook]: entries }),
    (enabled) => ({ kind: "configuration", enabled }),
  ),
  knowledge: settingsAccessor(
    (settings) => settings[SETTINGS_ENTRY_KEYS.knowledge] ?? {},
    (settings, entries) => ({ ...settings, [SETTINGS_ENTRY_KEYS.knowledge]: entries }),
    (enabled) => ({ kind: "configuration", enabled }),
  ),
};

/** Lockfile entry maps by type; absent maps read as empty. */
export const lockEntries: {
  readonly [T in InstallableExtensionType]: EntriesAccessor<Lockfile, LockEntryByType[T]>;
} = {
  skill: accessor(
    (lockfile) => lockfile[SETTINGS_ENTRY_KEYS.skill],
    (lockfile, entries) => ({ ...lockfile, [SETTINGS_ENTRY_KEYS.skill]: entries }),
  ),
  pack: accessor(
    (lockfile) => lockfile[SETTINGS_ENTRY_KEYS.pack] ?? {},
    (lockfile, entries) => ({ ...lockfile, [SETTINGS_ENTRY_KEYS.pack]: entries }),
  ),
  "mcp-server": accessor(
    (lockfile) => lockfile[SETTINGS_ENTRY_KEYS["mcp-server"]] ?? {},
    (lockfile, entries) => ({ ...lockfile, [SETTINGS_ENTRY_KEYS["mcp-server"]]: entries }),
  ),
  subagent: accessor(
    (lockfile) => lockfile[SETTINGS_ENTRY_KEYS.subagent] ?? {},
    (lockfile, entries) => ({ ...lockfile, [SETTINGS_ENTRY_KEYS.subagent]: entries }),
  ),
  rule: accessor(
    (lockfile) => lockfile[SETTINGS_ENTRY_KEYS.rule] ?? {},
    (lockfile, entries) => ({ ...lockfile, [SETTINGS_ENTRY_KEYS.rule]: entries }),
  ),
  hook: accessor(
    (lockfile) => lockfile[SETTINGS_ENTRY_KEYS.hook] ?? {},
    (lockfile, entries) => ({ ...lockfile, [SETTINGS_ENTRY_KEYS.hook]: entries }),
  ),
  knowledge: accessor(
    (lockfile) => lockfile[SETTINGS_ENTRY_KEYS.knowledge] ?? {},
    (lockfile, entries) => ({ ...lockfile, [SETTINGS_ENTRY_KEYS.knowledge]: entries }),
  ),
};
