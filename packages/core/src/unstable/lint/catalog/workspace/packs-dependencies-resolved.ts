/**
 * `workspace/packs-dependencies-resolved` — every pack-declared dependency
 * FQN is installed.
 *
 * For each `RegistryExtensionPackLockEntry`, every FQN appearing in
 * `resolvedSkills`, `resolvedCommands`, `resolvedMcpServers`, or
 * `resolvedSubagents` has a matching installed member lock entry.
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
import { type Lockfile, type ExtensionPackLockEntry } from "../../../lockfile/schema.js";
import { decodeLockfile } from "./helpers/decode.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/packs-dependencies-resolved";
const LOCKFILE_REL = ".axm/axm-lock.yaml";
// FQNs in resolved-maps are the 3-segment form `@owner/skills/name`;
// installed-member lockfile keys are simple names. We need to compare
// owner/type/name across the maps. Build an installed-FQN index from
// every member lock entry.

interface RegistryEntryFragment {
  readonly type: "registry";
  readonly owner: string;
  readonly name: string;
}

const isRecord = (entry: unknown): entry is Readonly<Record<string, unknown>> =>
  typeof entry === "object" && entry !== null;

const isRegistryFragment = (entry: unknown): entry is RegistryEntryFragment => {
  if (!isRecord(entry)) {
    return false;
  }
  return (
    entry["type"] === "registry" &&
    typeof entry["owner"] === "string" &&
    typeof entry["name"] === "string"
  );
};

const buildInstalledFqnIndex = (lockfile: Lockfile): ReadonlySet<string> => {
  const set = new Set<string>();
  const absorb = (
    typeSegment: string,
    map: Readonly<Record<string, unknown>> | undefined,
  ): void => {
    if (map === undefined) {
      return;
    }
    for (const entry of Object.values(map)) {
      if (isRegistryFragment(entry)) {
        set.add(`${entry.owner}/${typeSegment}/${entry.name}`);
      }
    }
  };
  absorb("skills", lockfile.skills);
  absorb("commands", lockfile.commands);
  absorb("subagents", lockfile.subagents);
  absorb("mcp-servers", lockfile.mcpServers);
  return set;
};

const singularDependencyType = (typeSegment: string): string => {
  switch (typeSegment) {
    case "skills":
      return "skill";
    case "commands":
      return "command";
    case "subagents":
      return "subagent";
    case "mcp-servers":
      return "MCP server";
    default:
      return typeSegment;
  }
};

const packInstallSpecifier = (entry: ExtensionPackLockEntry, packName: string): string =>
  entry.type === "registry" ? `${entry.owner}/packs/${entry.name}` : packName;

const missingDependencyFinding = (
  packName: string,
  packSpecifier: string,
  dependencyFqn: string,
  dependencyType: string,
): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Pack '${packName}' requires ${singularDependencyType(dependencyType)} '${dependencyFqn}', but that ${singularDependencyType(dependencyType)} is not installed. ` +
    `To restore it, run \`axm packs install ${packSpecifier}\`. ` +
    `If you no longer need '${packName}', run \`axm packs uninstall ${packName}\`.`,
  location: { file: LOCKFILE_REL },
});

const collectResolved = (
  entry: ExtensionPackLockEntry,
): ReadonlyArray<{ readonly fqn: string; readonly typeSegment: string }> => [
  ...Object.keys(entry.resolvedSkills).map((fqn) => ({ fqn, typeSegment: "skills" })),
  ...Object.keys(entry.resolvedCommands).map((fqn) => ({ fqn, typeSegment: "commands" })),
  ...Object.keys(entry.resolvedSubagents).map((fqn) => ({ fqn, typeSegment: "subagents" })),
  ...Object.keys(entry.resolvedMcpServers).map((fqn) => ({ fqn, typeSegment: "mcp-servers" })),
];

export const packsDependenciesResolvedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Installed packs keep their declared dependencies installed.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const lockfileResult = yield* Effect.result(context.workspace.lockfile);
      if (Result.isFailure(lockfileResult)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const lockOption = lockfileResult.success;
      if (Option.isNone(lockOption)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const decoded = decodeLockfile(lockOption.value);
      if (Option.isNone(decoded)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const packLock = decoded.value.packs ?? {};
      if (Object.keys(packLock).length === 0) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const installed = buildInstalledFqnIndex(decoded.value);
      const findings: Array<AdvisoryFinding> = [];
      for (const [packName, packEntry] of Object.entries(packLock)) {
        for (const { fqn, typeSegment } of collectResolved(packEntry)) {
          if (!installed.has(fqn)) {
            findings.push(
              missingDependencyFinding(
                packName,
                packInstallSpecifier(packEntry, packName),
                fqn,
                typeSegment,
              ),
            );
          }
        }
      }
      return findings;
    }),
};
