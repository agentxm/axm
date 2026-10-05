import { determineAgent } from "detect-agent";
import { AGENT_IDS } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";

const detectorNames: Readonly<Record<string, string>> = {
  claude_code: "claude-code",
  open_code: "opencode",
  codex_cli: "codex",
  gemini_cli: "gemini-cli",
  "cursor-cli": "cursor",
  "augment-cli": "augment",
  kimi: "kimi-cli",
  grok: "grok-cli",
  "github-copilot": "github-copilot-cli",
};
const CallerSchema = Schema.Literals([...AGENT_IDS, "unknown"]);
export type CallerAgent = typeof CallerSchema.Type;

/** The detector's metadata never crosses the adapter; an IDE terminal is insufficient. */
export const normalizeCallerAgent = (
  name: string | undefined,
  environment: Readonly<Record<string, string | undefined>>,
): CallerAgent => {
  const normalized = name === undefined ? undefined : (detectorNames[name] ?? name);
  if (
    (normalized === "cursor" || normalized === "cursor-cli") &&
    !environment["CURSOR_TRACE_ID"] &&
    !environment["CURSOR_AGENT"] &&
    environment["CURSOR_EXTENSION_HOST_ROLE"] !== "agent-exec"
  )
    return "unknown";
  const decoded = Schema.decodeUnknownResult(CallerSchema)(normalized);
  return Result.isSuccess(decoded) ? decoded.success : "unknown";
};

/** Foreign detector work is invocation-owned by the reporter, never on the install path. */
export const detectCallerAgent = (environment: Readonly<Record<string, string | undefined>>) =>
  Effect.tryPromise(() => determineAgent()).pipe(
    Effect.map((result) => normalizeCallerAgent(result.agent?.name, environment)),
    Effect.catch(() => Effect.succeed("unknown" as const)),
  );
