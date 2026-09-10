import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/registry-protocol/unstable/lint/rule";
import { settingsDisplayPath } from "./display-paths.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/mcps-no-secret-literal";

const SECRET_KEY_RE = /(authorization|bearer|token|secret|password|api[-_]?key|access[-_]?key)/i;
const TOKEN_VALUE_RE =
  /^(gh[pousr]_|sk-[A-Za-z0-9]|xox[baprs]-|eyJ[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{32,})/;
const ENV_REF_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/;

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

const isSecretLiteral = (name: string, value: string): boolean => {
  if (value.trim().length === 0) return false;
  if (ENV_REF_RE.test(value)) return false;
  return SECRET_KEY_RE.test(name) || TOKEN_VALUE_RE.test(value);
};

const findingFor = (serverName: string, field: string, settingsPath: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "warning",
  message:
    `MCP server '${serverName}' stores a secret-looking literal in ${field}. ` +
    "Use a `${VAR}` reference so axm.json does not contain the secret.",
  location: { file: settingsPath },
});

const collectRecordFindings = (
  serverName: string,
  fieldPrefix: string,
  value: unknown,
  settingsPath: string,
): ReadonlyArray<AdvisoryFinding> => {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) =>
    typeof item === "string" && isSecretLiteral(key, item)
      ? [findingFor(serverName, `${fieldPrefix}.${key}`, settingsPath)]
      : [],
  );
};

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
        return [
          ...collectRecordFindings(
            serverName,
            "env",
            entry["env"],
            settingsDisplayPath(context.subject.scope),
          ),
          ...collectRecordFindings(
            serverName,
            "headers",
            entry["headers"],
            settingsDisplayPath(context.subject.scope),
          ),
        ];
      });
    }),
};
