import * as Effect from "effect/Effect";
import {
  buildWorkspaceSkillSnapshot,
  type WorkspaceSkillAgentIssue,
} from "../../skill-snapshot.js";
import { defineCheck, type DiagnosticDef } from "../check-def.js";
import { CHECK_IDS, type Finding } from "../types.js";

type AgentReadinessDiagnostic = DiagnosticDef<ReadonlyArray<WorkspaceSkillAgentIssue>, never>;

const toFinding = (issue: WorkspaceSkillAgentIssue): Finding => {
  switch (issue._tag) {
    case "unknown-agent":
      return {
        id: "agent-readiness.unknown-agent",
        severity: "warn",
        message: `Agent "${issue.agentId}" is not recognized`,
        subject: { kind: "agent", ref: issue.agentId },
        action: {
          label: "Fix agent configuration",
          description: "Remove the agent from settings.json or check the agent ID.",
        },
      };
    case "misconfigured-agent":
      return {
        id: "agent-readiness.misconfigured-agent",
        severity: "warn",
        message: `Agent "${issue.agentId}": ${issue.reason}`,
        subject: { kind: "agent", ref: issue.agentId },
        action: {
          label: "Fix agent configuration",
          description: "Fix the agent configuration or remove it from settings.json.",
        },
      };
  }
};

const agentReadinessDiagnostic: AgentReadinessDiagnostic = {
  id: "agent-readiness.issues",
  run: (issues) => Effect.succeed(issues.map(toFinding)),
};

export const agentReadinessCheck = defineCheck({
  id: CHECK_IDS.agentReadiness,
  title: "Agent directories available",
  description: "Verifies configured coding agent skill directories are accessible.",
  dependsOn: [CHECK_IDS.workspaceReady],
  prepareContext: Effect.map(buildWorkspaceSkillSnapshot(), (snapshot) => snapshot.agents.issues),
  diagnostics: [agentReadinessDiagnostic],
});
