import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  McpConnectionSchema,
  validateMcpConnection,
} from "@agentxm/workspace-kernel/agent-adapters";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/extension-content/lint";
import { settingsDisplayPath } from "@agentxm/workspace-kernel/workspace-state";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/mcps-no-secret-literal";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseSettings = (bytes: string): Readonly<Record<string, unknown>> | undefined => {
  try {
    const parsed: unknown = JSON.parse(bytes);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const findingFor = (serverName: string, field: string, settingsPath: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "warning",
  message:
    `MCP server '${serverName}' stores a secret-looking literal in ${field}. ` +
    'Use a structured {"env":"VAR"} reference so axm.json does not contain the secret.',
  location: { file: settingsPath },
});

export const mcpServerNoSecretLiteralRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "MCP server settings use env references instead of secret literals.",
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
      return Object.entries(mcpServers).flatMap(([serverName, entry]) => {
        if (!isRecord(entry)) return [];
        const decoded = Schema.decodeUnknownResult(McpConnectionSchema)(entry["connection"]);
        if (Result.isFailure(decoded)) return [];
        return validateMcpConnection(decoded.success)
          .filter((finding) => finding.code === "literal-credential")
          .map((finding) =>
            findingFor(
              serverName,
              `connection.${finding.path.join(".")}`,
              settingsDisplayPath(context.subject.scope),
            ),
          );
      });
    }),
};
