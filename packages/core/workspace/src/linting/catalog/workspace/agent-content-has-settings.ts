import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { AdvisoryRule, LintFinding } from "@agentxm/extension-content/lint";
import type { AgentContentEntry } from "../../run/agent-scopes.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { workspaceDisplayPath } from "./display-paths.js";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";
import { agentsDisplay } from "./helpers/agent-scope-display.js";

const RULE_ID = "workspace/agent-content-has-settings";

const describeEntry = (entry: AgentContentEntry, display: string): string => {
  if (entry.kind === "instructions") return `Agent instruction file ${display}`;
  const count = entry.entryCount ?? 0;
  const entries = `${count} ${count === 1 ? "entry" : "entries"}`;
  switch (entry.kind) {
    case "skill":
      return `Agent skills directory ${display} with ${entries}`;
    case "subagent":
      return `Agent subagents directory ${display} with ${entries}`;
    case "mcp-server":
      return `Agent MCP configuration ${display} with ${entries}`;
    case "hook":
      return `Agent hook configuration ${display} with ${entries}`;
  }
};

export const agentContentHasSettingsRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Agent content in a project folder is explained by project workspace settings.",
  kind: "advisory",
  severity: "warning",
  check: (context) => {
    const { agentContent } = context;
    if (context.subject.scope !== "project" || agentContent === undefined)
      return Effect.succeed(EMPTY_LINT_FINDINGS);
    return Effect.gen(function* () {
      const settings = yield* Effect.result(context.workspace.state.raw("settings"));
      if (Result.isSuccess(settings) && Option.isSome(settings.success)) return EMPTY_LINT_FINDINGS;
      const entries = yield* agentContent;
      return entries.map((entry) => {
        const display = workspaceDisplayPath(context.subject.root, entry.path);
        return {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "warning",
          message: `${describeEntry(entry, display)} for ${agentsDisplay(entry.agentIds)} exists in a folder without project workspace settings (axm.json).`,
          location: { file: display },
        } satisfies LintFinding;
      });
    });
  },
};
