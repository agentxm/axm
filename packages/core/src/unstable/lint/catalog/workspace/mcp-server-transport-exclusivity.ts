import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/mcp-server-transport-exclusivity";
const SETTINGS_REL = ".axm/settings.json";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwnValue = (entry: Readonly<Record<string, unknown>>, key: string): boolean =>
  Object.hasOwn(entry, key) && entry[key] !== undefined;

const parseSettings = (bytes: string): Readonly<Record<string, unknown>> | undefined => {
  try {
    const parsed: unknown = JSON.parse(bytes);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const transportError = (entry: Readonly<Record<string, unknown>>): string | undefined => {
  const transports = ["source", "command", "url"].filter((key) => hasOwnValue(entry, key));
  if (transports.length !== 1) {
    return "must include exactly one of source, command, or url";
  }
  if (
    hasOwnValue(entry, "source") &&
    (hasOwnValue(entry, "args") || hasOwnValue(entry, "headers"))
  ) {
    return "source entries cannot include args or headers";
  }
  if (hasOwnValue(entry, "command") && hasOwnValue(entry, "headers")) {
    return "command entries cannot include headers";
  }
  if (hasOwnValue(entry, "url") && hasOwnValue(entry, "args")) {
    return "URL entries cannot include args";
  }
  return undefined;
};

const findingFor = (name: string, reason: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "warning",
  message: `MCP server '${name}' ${reason}. Edit \`${SETTINGS_REL}\` so each MCP server uses one transport.`,
  location: { file: SETTINGS_REL },
});

export const mcpServerTransportExclusivityRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "MCP server settings entries use exactly one transport.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      const raw = yield* Effect.result(context.workspace.state.raw("settings"));
      if (Result.isFailure(raw) || Option.isNone(raw.success)) return EMPTY_ADVISORY_FINDINGS;
      const settings = parseSettings(raw.success.value.bytes);
      if (settings === undefined) return EMPTY_ADVISORY_FINDINGS;
      const mcpServers = settings["mcpServers"];
      if (!isRecord(mcpServers)) return EMPTY_ADVISORY_FINDINGS;
      return Object.entries(mcpServers).flatMap(([name, entry]) => {
        if (!isRecord(entry)) return [];
        const reason = transportError(entry);
        return reason === undefined ? [] : [findingFor(name, reason)];
      });
    }),
};
