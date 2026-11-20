import * as Effect from "effect/Effect";
import type { AdvisoryRule } from "@agentxm/extension-content/lint";
import type { WorkspaceRuleContext } from "../../workspace-context.js";

export const exposedAxmSkillCompatibleRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: "workspace/exposed-axm-skill-compatible",
  description: "Official AXM guidance exposed to configured agents is compatible with this CLI.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.succeed(
      (context.exposedOfficialSkills ?? []).map((exposure) => ({
        kind: "advisory",
        ruleId: "workspace/exposed-axm-skill-compatible",
        severity: "warning",
        message: `Exposed official AXM skill ${exposure.compatibility.skillVersion ?? "unknown version"} at ${exposure.source}: ${(exposure.compatibility.detail ?? exposure.compatibility.reasonCode ?? "compatibility unknown").replace(/\.$/u, "")}. Read by ${exposure.agents.join(", ")} through ${exposure.paths.join(", ")}; ownership: ${exposure.ownership.join(", ")}. This exposure does not establish declared-skill compatibility or AXM ownership. Preserve the content and review these discovery entries with their owner before retiring stale links and previewing axm skills install @agentxm/skills/axm --bundled in the appropriate scope.`,
        location: { file: exposure.source },
      })),
    ),
};
