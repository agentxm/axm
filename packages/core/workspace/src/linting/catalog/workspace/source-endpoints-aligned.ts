/** Reports configured source hosts that diverge from accepted lock authority. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { Lockfile, Settings } from "../../../desired-state/index.js";
import type { SourceHostConfig } from "../../../desired-state/index.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/extension-content/lint";
import { settingsDisplayPath } from "./display-paths.js";

const RULE_ID = "workspace/source-endpoints-aligned";

const configuredEndpoint = (source: SourceHostConfig): URL => source.location;

const lockedEntries = (lockfile: Lockfile) => [
  ...Object.entries(lockfile.skills).map(([name, entry]) => ({
    type: "skill" as const,
    name,
    extension: `skill:${name}`,
    entry,
  })),
  ...Object.entries(lockfile.mcpServers ?? {}).map(([name, entry]) => ({
    type: "mcp-server" as const,
    name,
    extension: `mcp-server:${name}`,
    entry,
  })),
  ...Object.entries(lockfile.subagents ?? {}).map(([name, entry]) => ({
    type: "subagent" as const,
    name,
    extension: `subagent:${name}`,
    entry,
  })),
  ...Object.entries(lockfile.rules ?? {}).map(([name, entry]) => ({
    type: "rule" as const,
    name,
    extension: `rule:${name}`,
    entry,
  })),
  ...Object.entries(lockfile.hooks ?? {}).map(([name, entry]) => ({
    type: "hook" as const,
    name,
    extension: `hook:${name}`,
    entry,
  })),
  ...Object.entries(lockfile.knowledge ?? {}).map(([name, entry]) => ({
    type: "knowledge" as const,
    name,
    extension: `knowledge:${name}`,
    entry,
  })),
  ...Object.entries(lockfile.packs ?? {}).map(([name, entry]) => ({
    type: "pack" as const,
    name,
    extension: `pack:${name}`,
    entry,
  })),
];

const entrySource = (entry: unknown): string | undefined => {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object" || entry === null || !("source" in entry)) return undefined;
  return typeof entry.source === "string" ? entry.source : undefined;
};

const declaredSource = (
  settings: Settings,
  type: ReturnType<typeof lockedEntries>[number]["type"],
  name: string,
): string | undefined => {
  switch (type) {
    case "skill":
      return entrySource(settings.skills?.[name]);
    case "mcp-server":
      return entrySource(settings.mcpServers?.[name]);
    case "subagent":
      return entrySource(settings.subagents?.[name]);
    case "rule":
      return entrySource(settings.rules?.[name]);
    case "hook":
      return entrySource(settings.hooks?.[name]);
    case "knowledge":
      return entrySource(settings.knowledge?.[name]);
    case "pack":
      return entrySource(settings.packs?.[name]);
  }
};

const sourceNameFromLocator = (locator: string): string => {
  if (locator.startsWith("@")) return "agentxm";
  const separator = locator.indexOf(":");
  return separator > 0 ? locator.slice(0, separator) : "agentxm";
};

const acceptedEndpoint = (source: Lockfile["skills"][string]["source"]): URL =>
  source.type === "git"
    ? new URL("/", source.url)
    : source.type === "registry"
      ? source.url
      : new URL("file:///");

const collectFindings = (
  lockfile: Lockfile,
  settings: Settings,
  configuredSources: ReadonlyArray<SourceHostConfig>,
  settingsPath: string,
): ReadonlyArray<AdvisoryFinding> => {
  const findings: Array<AdvisoryFinding> = [];

  for (const { type, name, extension, entry } of lockedEntries(lockfile)) {
    const lockedSource = entry.source;
    if (lockedSource.type === "path") continue;
    const locator = declaredSource(settings, type, name);
    if (locator === undefined) continue;
    const sourceName = sourceNameFromLocator(locator);
    const configured = configuredSources.find((source) => source.name === sourceName);
    if (configured === undefined) continue;
    const endpoint = configuredEndpoint(configured);
    const lockedEndpoint = acceptedEndpoint(lockedSource);
    if (endpoint.href === lockedEndpoint.href) continue;

    findings.push({
      kind: "advisory",
      ruleId: RULE_ID,
      severity: "error",
      message: `Accepted resolution '${extension}' binds source '${sourceName}' to ${configured.type} ${lockedEndpoint.href}, but the configured source now resolves to ${configured.type} ${endpoint.href}. Use an explicit source transition before syncing.`,
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
      const settings = yield* Effect.result(context.workspace.state.settings);
      const sources = yield* Effect.result(context.workspace.sourceHosts.declared);
      if (
        Result.isFailure(lockfile) ||
        Option.isNone(lockfile.success) ||
        Result.isFailure(settings) ||
        Option.isNone(settings.success) ||
        Result.isFailure(sources)
      ) {
        return [];
      }
      return collectFindings(
        lockfile.success.value,
        settings.success.value,
        sources.success,
        settingsDisplayPath(context.subject.scope),
      );
    }),
};
