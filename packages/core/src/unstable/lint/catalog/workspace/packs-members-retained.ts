/**
 * `workspace/packs-members-retained` — every member lock entry with
 * `retainedByPack: true` is declared by an installed pack.
 *
 * For each member lock entry (skill, command, subagent, mcp-server) where
 * `retainedByPack === true` AND the member is not directly declared in
 * settings, at least one installed pack's lock entry lists the member's
 * FQN in the appropriate resolved map. Entries directly declared in
 * settings are exempt (covered by per-type declarations rules).
 *
 * Rule body walks every member lock entry type — not just skills — so
 * adding non-skill install families in v1.5+ is test-surface-only.
 *
 * One finding per affected entity. Advisory, warning.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import {
  LockfileSchema,
  type Lockfile,
  type SkillLockEntry,
  type CommandLockEntry,
  type SubagentLockEntry,
  type McpServerLockEntry,
} from "../../../lockfile/schema.js";
import { SettingsSchema, type Settings } from "../../../settings/schema.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/packs-members-retained";
const LOCKFILE_REL = ".axm/axm-lock.yaml";

const decodeSettings = (input: unknown): Option.Option<Settings> => {
  const result = Schema.decodeUnknownResult(SettingsSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};

const decodeLockfile = (input: unknown): Option.Option<Lockfile> => {
  const result = Schema.decodeUnknownResult(LockfileSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};

type AnyMemberEntry = SkillLockEntry | CommandLockEntry | SubagentLockEntry | McpServerLockEntry;

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

const buildPackRetainedFqns = (lockfile: Lockfile): ReadonlySet<string> => {
  const declared = new Set<string>();
  const packs = lockfile.packs ?? {};
  for (const entry of Object.values(packs)) {
    for (const fqn of Object.keys(entry.resolvedSkills)) {
      declared.add(fqn);
    }
    for (const fqn of Object.keys(entry.resolvedCommands)) {
      declared.add(fqn);
    }
    for (const fqn of Object.keys(entry.resolvedSubagents)) {
      declared.add(fqn);
    }
    for (const fqn of Object.keys(entry.resolvedMcpServers)) {
      declared.add(fqn);
    }
  }
  return declared;
};

const droppedFinding = (
  memberType: string,
  name: string,
  fqn: string | undefined,
): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "warning",
  message:
    `${memberType} '${name}'${fqn === undefined ? "" : ` (resolved as ${fqn})`} is still installed because of a pack, but no installed pack now declares it. ` +
    `Declare '${name}' directly in settings.${memberType === "mcp-server" ? "mcpServers" : `${memberType}s`} if you still need it, or uninstall it if not.`,
  location: { file: LOCKFILE_REL },
});

interface MemberEntry {
  readonly memberType: "skill" | "command" | "subagent" | "mcp-server";
  readonly name: string;
  readonly entry: AnyMemberEntry;
}

const collectMembers = (lockfile: Lockfile): ReadonlyArray<MemberEntry> => {
  const result: Array<MemberEntry> = [];
  for (const [name, entry] of Object.entries(lockfile.skills)) {
    result.push({ memberType: "skill", name, entry });
  }
  for (const [name, entry] of Object.entries(lockfile.commands ?? {})) {
    result.push({ memberType: "command", name, entry });
  }
  for (const [name, entry] of Object.entries(lockfile.subagents ?? {})) {
    result.push({ memberType: "subagent", name, entry });
  }
  for (const [name, entry] of Object.entries(lockfile.mcpServers ?? {})) {
    result.push({ memberType: "mcp-server", name, entry });
  }
  return result;
};

const isDirectlyDeclared = (member: MemberEntry, settings: Settings): boolean => {
  switch (member.memberType) {
    case "skill":
      return member.name in (settings.skills ?? {});
    case "command":
      return member.name in (settings.commands ?? {});
    case "subagent":
      return member.name in (settings.subagents ?? {});
    case "mcp-server":
      return member.name in (settings.mcpServers ?? {});
  }
};

const typeSegment = (memberType: MemberEntry["memberType"]): string => {
  switch (memberType) {
    case "skill":
      return "skills";
    case "command":
      return "commands";
    case "subagent":
      return "subagents";
    case "mcp-server":
      return "mcp-servers";
  }
};

export const packsMembersRetainedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Every member lock entry with retainedByPack is declared by an installed pack.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      const settingsResult = yield* Effect.result(context.workspace.settings);
      const lockfileResult = yield* Effect.result(context.workspace.lockfile);
      if (Result.isFailure(settingsResult) || Result.isFailure(lockfileResult)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const settings = decodeSettings(settingsResult.success);
      if (Option.isNone(settings)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const lockOption = lockfileResult.success;
      if (Option.isNone(lockOption)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const lockfile = decodeLockfile(lockOption.value);
      if (Option.isNone(lockfile)) {
        return EMPTY_ADVISORY_FINDINGS;
      }

      const retainedByPacks = buildPackRetainedFqns(lockfile.value);
      const findings: Array<AdvisoryFinding> = [];

      for (const member of collectMembers(lockfile.value)) {
        if (member.entry.retainedByPack !== true) {
          continue;
        }
        if (isDirectlyDeclared(member, settings.value)) {
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
