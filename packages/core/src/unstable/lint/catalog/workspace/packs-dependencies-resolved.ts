/**
 * `workspace/packs-dependencies-resolved` — every pack-declared dependency
 * FQN is installed.
 *
 * For each `RegistryPackLockEntry`, every FQN appearing in any `resolved*` map
 * has a matching installed member lock entry. The family table is total over
 * every non-pack extension type, so a pack that depends on a context package,
 * rule, hook, or knowledge bundle is checked like any other member.
 *
 * One finding per missing dependency (per-entity cascade). Advisory.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { type Lockfile, type PackLockEntry } from "../../../lockfile/schema.js";
import {
  extensionTypeSentenceLabels,
  extensionTypeToPlural,
  type ExtensionType,
} from "../../../extensions/common.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/packs-dependencies-resolved";
const LOCKFILE_REL = ".axm/axm-lock.yaml";
// FQNs in resolved-maps are the 3-segment form `@owner/skills/name`;
// installed-member lockfile keys are simple names. We need to compare
// owner/type/name across the maps. Build an installed-FQN index from
// every member lock entry.

interface InstalledEntryFragment {
  readonly type: "registry" | "workspace";
  readonly owner: string;
  readonly name: string;
}

const isRecord = (entry: unknown): entry is Readonly<Record<string, unknown>> =>
  typeof entry === "object" && entry !== null;

const isInstalledFragment = (entry: unknown): entry is InstalledEntryFragment => {
  if (!isRecord(entry)) {
    return false;
  }
  return (
    (entry["type"] === "registry" || entry["type"] === "workspace") &&
    typeof entry["owner"] === "string" &&
    typeof entry["name"] === "string"
  );
};

/** Packs cannot contain packs, so every other extension type is a member type. */
type MemberType = Exclude<ExtensionType, "pack">;

/**
 * Where each member type's installed lock entries and pack-resolved FQNs live.
 * Total over `MemberType`: a new extension type fails compile here until its
 * pack-dependency coverage is decided.
 */
const MEMBER_FAMILIES = {
  skill: {
    installed: (lockfile: Lockfile) => lockfile.skills,
    resolved: (pack: PackLockEntry) => pack.resolvedSkills,
  },
  command: {
    installed: (lockfile: Lockfile) => lockfile.commands,
    resolved: (pack: PackLockEntry) => pack.resolvedCommands,
  },
  subagent: {
    installed: (lockfile: Lockfile) => lockfile.subagents,
    resolved: (pack: PackLockEntry) => pack.resolvedSubagents,
  },
  "mcp-server": {
    installed: (lockfile: Lockfile) => lockfile.mcpServers,
    resolved: (pack: PackLockEntry) => pack.resolvedMcpServers,
  },
  files: {
    installed: (lockfile: Lockfile) => lockfile.files,
    resolved: (pack: PackLockEntry) => pack.resolvedFiles,
  },
  rule: {
    installed: (lockfile: Lockfile) => lockfile.rules,
    resolved: (pack: PackLockEntry) => pack.resolvedRules,
  },
  hook: {
    installed: (lockfile: Lockfile) => lockfile.hooks,
    resolved: (pack: PackLockEntry) => pack.resolvedHooks,
  },
  knowledge: {
    installed: (lockfile: Lockfile) => lockfile.knowledge,
    resolved: (pack: PackLockEntry) => pack.resolvedKnowledge,
  },
} as const satisfies Record<
  MemberType,
  {
    readonly installed: (lockfile: Lockfile) => Readonly<Record<string, unknown>> | undefined;
    readonly resolved: (pack: PackLockEntry) => Readonly<Record<string, unknown>> | undefined;
  }
>;

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

export const buildInstalledFqnIndex = (lockfile: Lockfile): ReadonlySet<string> => {
  const set = new Set<string>();
  for (const type of MEMBER_ORDER) {
    const map = MEMBER_FAMILIES[type].installed(lockfile);
    if (map === undefined) {
      continue;
    }
    for (const entry of Object.values(map)) {
      if (isInstalledFragment(entry)) {
        set.add(`${entry.owner}/${extensionTypeToPlural[type]}/${entry.name}`);
      }
    }
  }
  return set;
};

const packInstallSpecifier = (entry: PackLockEntry, packName: string): string =>
  entry.type === "registry" ? `${entry.owner}/packs/${entry.name}` : packName;

const missingDependencyFinding = (
  packName: string,
  packSpecifier: string,
  dependencyFqn: string,
  dependencyType: MemberType,
): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Pack '${packName}' requires ${extensionTypeSentenceLabels[dependencyType]} '${dependencyFqn}', but that ${extensionTypeSentenceLabels[dependencyType]} is not installed. ` +
    `To restore it, run \`axm packs install ${packSpecifier}\`. ` +
    `If you no longer need '${packName}', run \`axm packs uninstall ${packName}\`.`,
  location: { file: LOCKFILE_REL },
});

const collectResolved = (
  entry: PackLockEntry,
): ReadonlyArray<{ readonly fqn: string; readonly memberType: MemberType }> =>
  MEMBER_ORDER.flatMap((memberType) =>
    Object.keys(MEMBER_FAMILIES[memberType].resolved(entry) ?? {}).map((fqn) => ({
      fqn,
      memberType,
    })),
  );

export const packsDependenciesResolvedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Installed packs keep their declared dependencies installed.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const scoped = context.workspace;
      const lockfileResult = yield* Effect.result(scoped.state.lockfile);
      if (Result.isFailure(lockfileResult)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const lockOption = lockfileResult.success;
      if (Option.isNone(lockOption)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const packLock = lockOption.value.packs ?? {};
      if (Object.keys(packLock).length === 0) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const installed = buildInstalledFqnIndex(lockOption.value);
      const findings: Array<AdvisoryFinding> = [];
      for (const [packName, packEntry] of Object.entries(packLock)) {
        for (const { fqn, memberType } of collectResolved(packEntry)) {
          if (!installed.has(fqn)) {
            findings.push(
              missingDependencyFinding(
                packName,
                packInstallSpecifier(packEntry, packName),
                fqn,
                memberType,
              ),
            );
          }
        }
      }
      return findings;
    }),
};
