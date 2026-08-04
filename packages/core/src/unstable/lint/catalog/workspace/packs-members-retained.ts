/**
 * `workspace/packs-members-retained` — every member lock entry with
 * `retainedByPack: true` is declared by an installed pack.
 *
 * For each member lock entry where `retainedByPack === true` AND the member is
 * not directly declared in settings, at least one installed pack's lock entry
 * lists the member's FQN in the appropriate resolved map. Entries directly
 * declared in settings are exempt (covered by per-type declarations rules).
 *
 * The family table below is total over every non-pack extension type, so
 * adding an install family is a table row here, not a new rule.
 *
 * One finding per affected entity. Advisory, warning.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import {
  type CommandLockEntry,
  type FilesLockEntry,
  type HookLockEntry,
  type KnowledgeLockEntry,
  type Lockfile,
  type McpServerLockEntry,
  type PackLockEntry,
  type RuleLockEntry,
  type SkillLockEntry,
  type SubagentLockEntry,
} from "../../../lockfile/schema.js";
import { extensionTypeToPlural, type ExtensionType } from "../../../extensions/common.js";
import { type Settings } from "../../../settings/schema.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/packs-members-retained";
const LOCKFILE_REL = ".axm/axm-lock.yaml";
const SETTINGS_REL = ".axm/settings.json";

/** Packs cannot contain packs, so every other extension type is a member type. */
type MemberType = Exclude<ExtensionType, "pack">;

type AnyMemberEntry =
  | SkillLockEntry
  | CommandLockEntry
  | SubagentLockEntry
  | McpServerLockEntry
  | FilesLockEntry
  | RuleLockEntry
  | HookLockEntry
  | KnowledgeLockEntry;

/**
 * Settings map key per member type. Not derivable from the plural segment:
 * MCP servers live under `mcpServers`, not `mcps`.
 */
const SETTINGS_KEY_BY_TYPE = {
  skill: "skills",
  command: "commands",
  subagent: "subagents",
  "mcp-server": "mcpServers",
  files: "files",
  rule: "rules",
  hook: "hooks",
  knowledge: "knowledge",
} as const satisfies Record<MemberType, string>;

const entryFqn = (entry: AnyMemberEntry, name: string, typeSegment: string): string | undefined => {
  if (entry.type !== "registry") {
    // Non-registry lock entries don't carry an owner-qualified FQN. We
    // conservatively exclude them: retention applies only to registry-ish
    // pack dependencies.
    return undefined;
  }
  const owner = entry.owner;
  const regName = entry.name;
  return `${owner}/${typeSegment}/${regName}`;
};

/**
 * One pack-member family: where its lock entries live, where a direct
 * declaration lives in settings, and which pack `resolved*` map records it.
 *
 * Total over every non-pack extension type — a pack cannot contain a pack —
 * so a new extension type fails compile here until its retention is decided.
 * The rule walked only four families before, which meant a pack-provided
 * context package, rule, hook, or knowledge bundle left behind by a pack
 * uninstall was invisible.
 */
interface MemberFamily {
  readonly lockEntries: (lockfile: Lockfile) => Readonly<Record<string, AnyMemberEntry>>;
  readonly declaredNames: (settings: Settings) => Readonly<Record<string, unknown>>;
  readonly resolved: (pack: PackLockEntry) => Readonly<Record<string, unknown>> | undefined;
}

const MEMBER_FAMILIES = {
  skill: {
    lockEntries: (lockfile) => lockfile.skills,
    declaredNames: (settings) => settings.skills ?? {},
    resolved: (pack) => pack.resolvedSkills,
  },
  command: {
    lockEntries: (lockfile) => lockfile.commands ?? {},
    declaredNames: (settings) => settings.commands ?? {},
    resolved: (pack) => pack.resolvedCommands,
  },
  subagent: {
    lockEntries: (lockfile) => lockfile.subagents ?? {},
    declaredNames: (settings) => settings.subagents ?? {},
    resolved: (pack) => pack.resolvedSubagents,
  },
  "mcp-server": {
    lockEntries: (lockfile) => lockfile.mcpServers ?? {},
    declaredNames: (settings) => settings.mcpServers ?? {},
    resolved: (pack) => pack.resolvedMcpServers,
  },
  files: {
    lockEntries: (lockfile) => lockfile.files ?? {},
    declaredNames: (settings) => settings.files ?? {},
    resolved: (pack) => pack.resolvedFiles,
  },
  rule: {
    lockEntries: (lockfile) => lockfile.rules ?? {},
    declaredNames: (settings) => settings.rules ?? {},
    resolved: (pack) => pack.resolvedRules,
  },
  hook: {
    lockEntries: (lockfile) => lockfile.hooks ?? {},
    declaredNames: (settings) => settings.hooks ?? {},
    resolved: (pack) => pack.resolvedHooks,
  },
  knowledge: {
    lockEntries: (lockfile) => lockfile.knowledge ?? {},
    declaredNames: (settings) => settings.knowledge ?? {},
    resolved: (pack) => pack.resolvedKnowledge,
  },
} as const satisfies Record<MemberType, MemberFamily>;

/** Walk order; findings render in this order. */
const MEMBER_ORDER: ReadonlyArray<MemberType> = [
  "skill",
  "command",
  "subagent",
  "mcp-server",
  "files",
  "rule",
  "hook",
  "knowledge",
];

const buildPackRetainedFqns = (lockfile: Lockfile): ReadonlySet<string> => {
  const declared = new Set<string>();
  // Kept separate from the skill-specific retained helper: this rule needs
  // every pack lock entry and every resolved member map, not just
  // declared-pack `resolvedSkills`.
  for (const entry of Object.values(lockfile.packs ?? {})) {
    for (const type of MEMBER_ORDER) {
      for (const fqn of Object.keys(MEMBER_FAMILIES[type].resolved(entry) ?? {})) {
        declared.add(fqn);
      }
    }
  }
  return declared;
};

const droppedFinding = (
  memberType: MemberType,
  name: string,
  fqn: string | undefined,
): AdvisoryFinding => {
  const settingsSurface = `settings.${SETTINGS_KEY_BY_TYPE[memberType]}`;
  const installCommand = fqn === undefined ? undefined : `axm install ${fqn}`;
  const uninstallCommand = fqn === undefined ? undefined : `axm uninstall ${fqn}`;
  return {
    kind: "advisory",
    ruleId: RULE_ID,
    severity: "warning",
    message:
      `${memberType} '${name}'${fqn === undefined ? "" : ` (resolved as ${fqn})`} is still installed because of a pack, but no installed pack now declares it. ` +
      (installCommand === undefined
        ? `To keep it, add '${name}' under \`${settingsSurface}\` in \`${SETTINGS_REL}\` with its intended source, then run \`axm install\`. ` +
          "If you do not need it, run `axm install` to regenerate the managed state from the remaining declarations."
        : `To keep it, run \`${installCommand}\`. If you do not need it, run \`${uninstallCommand}\`.`),
    location: { file: LOCKFILE_REL },
  };
};

interface MemberEntry {
  readonly memberType: MemberType;
  readonly name: string;
  readonly entry: AnyMemberEntry;
}

const collectMembers = (lockfile: Lockfile): ReadonlyArray<MemberEntry> => {
  const result: Array<MemberEntry> = [];
  for (const memberType of MEMBER_ORDER) {
    for (const [name, entry] of Object.entries(MEMBER_FAMILIES[memberType].lockEntries(lockfile))) {
      result.push({ memberType, name, entry });
    }
  }
  return result;
};

const isDirectlyDeclared = (member: MemberEntry, settings: Settings): boolean =>
  member.name in MEMBER_FAMILIES[member.memberType].declaredNames(settings);

const typeSegment = (memberType: MemberType): string => extensionTypeToPlural[memberType];

export const packsMembersRetainedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Pack-retained extensions are still required by an installed pack.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      const scoped = context.workspace;
      const settingsResult = yield* Effect.result(scoped.state.settings);
      const lockfileResult = yield* Effect.result(scoped.state.lockfile);
      if (Result.isFailure(settingsResult) || Result.isFailure(lockfileResult)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      if (Option.isNone(settingsResult.success)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const lockOption = lockfileResult.success;
      if (Option.isNone(lockOption)) {
        return EMPTY_ADVISORY_FINDINGS;
      }

      const retainedByPacks = buildPackRetainedFqns(lockOption.value);
      const findings: Array<AdvisoryFinding> = [];

      for (const member of collectMembers(lockOption.value)) {
        if (member.entry.retainedByPack !== true) {
          continue;
        }
        if (isDirectlyDeclared(member, settingsResult.success.value)) {
          continue;
        }
        const fqn = entryFqn(member.entry, member.name, typeSegment(member.memberType));
        if (fqn === undefined || !retainedByPacks.has(fqn)) {
          findings.push(droppedFinding(member.memberType, member.name, fqn));
        }
      }
      return findings;
    }),
};
