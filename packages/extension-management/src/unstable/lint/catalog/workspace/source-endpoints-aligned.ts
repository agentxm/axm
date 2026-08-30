/** Reports configured source hosts that diverge from accepted lock authority. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { Lockfile } from "../../../lockfile/schema.js";
import type { SourceHostConfig } from "../../../settings/schema.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/registry-protocol/unstable/lint/rule";
import { settingsDisplayPath } from "./display-paths.js";

const RULE_ID = "workspace/source-endpoints-aligned";

const configuredEndpoint = (source: SourceHostConfig): URL =>
  source.type === "registry" ? source.location : source.url;

const lockedEntries = (lockfile: Lockfile) => [
  ...Object.entries(lockfile.skills).map(([name, entry]) => ({
    extension: `skill:${name}`,
    entry,
  })),
  ...Object.entries(lockfile.mcpServers ?? {}).map(([name, entry]) => ({
    extension: `mcp-server:${name}`,
    entry,
  })),
  ...Object.entries(lockfile.subagents ?? {}).map(([name, entry]) => ({
    extension: `subagent:${name}`,
    entry,
  })),
  ...Object.entries(lockfile.rules ?? {}).map(([name, entry]) => ({
    extension: `rule:${name}`,
    entry,
  })),
  ...Object.entries(lockfile.hooks ?? {}).map(([name, entry]) => ({
    extension: `hook:${name}`,
    entry,
  })),
  ...Object.entries(lockfile.knowledge ?? {}).map(([name, entry]) => ({
    extension: `knowledge:${name}`,
    entry,
  })),
  ...Object.entries(lockfile.packs ?? {}).map(([name, entry]) => ({
    extension: `pack:${name}`,
    entry,
  })),
];

const collectFindings = (
  lockfile: Lockfile,
  configuredSources: ReadonlyArray<SourceHostConfig>,
  settingsPath: string,
): ReadonlyArray<AdvisoryFinding> => {
  const findings: Array<AdvisoryFinding> = [];

  for (const { extension, entry } of lockedEntries(lockfile)) {
    if (entry.type === "local" || entry.type === "git") continue;
    const configured = configuredSources.find((source) => source.name === entry.sourceName);
    if (configured === undefined) continue;
    const endpoint = configuredEndpoint(configured);
    if (configured.type === entry.sourceType && endpoint.href === entry.endpoint.href) continue;

    findings.push({
      kind: "advisory",
      ruleId: RULE_ID,
      severity: "error",
      message: `Accepted resolution '${extension}' binds source '${entry.sourceName}' to ${entry.sourceType} ${entry.endpoint.href}, but the configured source now resolves to ${configured.type} ${endpoint.href}. Use an explicit source transition before syncing.`,
      location: { file: settingsPath },
    });
  }

  return findings;
};

export const sourceEndpointsAlignedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Configured source endpoints remain aligned with accepted lock authority.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const lockfile = yield* Effect.result(context.workspace.state.lockfile);
      const sources = yield* Effect.result(context.workspace.sourceHosts.declared);
      if (
        Result.isFailure(lockfile) ||
        Option.isNone(lockfile.success) ||
        Result.isFailure(sources)
      ) {
        return [];
      }
      return collectFindings(
        lockfile.success.value,
        sources.success,
        settingsDisplayPath(context.subject.scope),
      );
    }),
};
