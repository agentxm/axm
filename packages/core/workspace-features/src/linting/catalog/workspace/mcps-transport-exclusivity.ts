import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { McpConnectionSchema } from "@agentxm/workspace-kernel/agent-adapters";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/extension-content/lint";
import { settingsDisplayPath } from "@agentxm/workspace-kernel/workspace-state";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/mcps-transport-exclusivity";

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
  if (["command", "args", "env", "url", "headers", "cwd"].some((key) => hasOwnValue(entry, key)))
    return "uses retired flat fields; declare an explicit connection instead";
  if (hasOwnValue(entry, "source") && hasOwnValue(entry, "connection"))
    return "cannot combine a source with an inline connection";
  // Source declarations and Pack preferences select a distribution separately.
  if (!hasOwnValue(entry, "connection")) return undefined;
  if (
    Result.isFailure(
      Schema.decodeUnknownResult(McpConnectionSchema, { onExcessProperty: "error" })(
        entry["connection"],
      ),
    )
  )
    return "must declare one explicit stdio, streamable-http, or sse connection with fields valid for that transport";
  return undefined;
};

const findingFor = (name: string, reason: string, settingsPath: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "warning",
  message: `MCP server '${name}' ${reason}. Edit \`${settingsPath}\` so each MCP server uses one transport.`,
  location: { file: settingsPath },
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
        return reason === undefined
          ? []
          : [findingFor(name, reason, settingsDisplayPath(context.subject.scope))];
      });
    }),
};
