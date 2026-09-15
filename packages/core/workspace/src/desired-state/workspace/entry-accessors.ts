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
} from "../lockfile/schema.js";
import type {
  HookEntry,
  KnowledgeEntry,
  McpServerEntry,
  PackEntry,
  RuleEntry,
  Settings,
  SkillEntry,
  SubagentEntry,
} from "../settings/schema.js";

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

/** Settings entry maps by type; absent maps read as empty. */
export const settingsEntries: {
  readonly [T in InstallableExtensionType]: EntriesAccessor<Settings, SettingsEntryByType[T]>;
} = {
  skill: accessor(
    (settings) => settings.skills ?? {},
    (settings, skills) => ({ ...settings, skills }),
  ),
  pack: accessor(
    (settings) => settings.packs ?? {},
    (settings, packs) => ({ ...settings, packs }),
  ),
  "mcp-server": accessor(
    (settings) => settings.mcpServers ?? {},
    (settings, mcpServers) => ({ ...settings, mcpServers }),
  ),
  subagent: accessor(
    (settings) => settings.subagents ?? {},
    (settings, subagents) => ({ ...settings, subagents }),
  ),
  rule: accessor(
    (settings) => settings.rules ?? {},
    (settings, rules) => ({ ...settings, rules }),
  ),
  hook: accessor(
    (settings) => settings.hooks ?? {},
    (settings, hooks) => ({ ...settings, hooks }),
  ),
  knowledge: accessor(
    (settings) => settings.knowledge ?? {},
    (settings, knowledge) => ({ ...settings, knowledge }),
  ),
};

/** Lockfile entry maps by type; absent maps read as empty. */
export const lockEntries: {
  readonly [T in InstallableExtensionType]: EntriesAccessor<Lockfile, LockEntryByType[T]>;
} = {
  skill: accessor(
    (lockfile) => lockfile.skills,
    (lockfile, skills) => ({ ...lockfile, skills }),
  ),
  pack: accessor(
    (lockfile) => lockfile.packs ?? {},
    (lockfile, packs) => ({ ...lockfile, packs }),
  ),
  "mcp-server": accessor(
    (lockfile) => lockfile.mcpServers ?? {},
    (lockfile, mcpServers) => ({ ...lockfile, mcpServers }),
  ),
  subagent: accessor(
    (lockfile) => lockfile.subagents ?? {},
    (lockfile, subagents) => ({ ...lockfile, subagents }),
  ),
  rule: accessor(
    (lockfile) => lockfile.rules ?? {},
    (lockfile, rules) => ({ ...lockfile, rules }),
  ),
  hook: accessor(
    (lockfile) => lockfile.hooks ?? {},
    (lockfile, hooks) => ({ ...lockfile, hooks }),
  ),
  knowledge: accessor(
    (lockfile) => lockfile.knowledge ?? {},
    (lockfile, knowledge) => ({ ...lockfile, knowledge }),
  ),
};
