import { defineProductGoals } from "@agentxm/extension-model/unstable/specifications";

/**
 * The local product-goal registry: outcomes and capabilities only AXM serves.
 *
 * Goals that more than one AgentXM repository serves are registered once in
 * the shared contract (`sharedProductGoals` from
 * `@agentxm/extension-model/unstable/specifications`) and referenced from
 * here by identity; this registry must not redefine them. The registry does
 * not restate, own, or rank the requirements that support a goal.
 * Requirements review walks both registries: a retired goal makes its
 * referencing specifications retirement candidates, and an active goal with
 * no referencing specification identifies missing coverage or a dead goal.
 */
export const productGoals = defineProductGoals({
  "workspace-intent-fidelity": {
    outcome:
      "Workspace state always reflects explicitly expressed intent, authority, and ownership — never inference, accident, or unauthorized adoption.",
  },
  "safe-repetition": {
    outcome:
      "Every operation is safe to repeat and safe to interrupt: reruns are no-ops, failures roll back their closure, and surviving authority converges.",
  },
  "agent-interoperability": {
    outcome:
      "Configured extensions realize correctly and completely for every configured coding agent's native surfaces.",
  },
  "actionable-diagnostics": {
    outcome:
      "People and agents can understand invalid workspace state and recover it through ordinary commands without a repair workflow.",
  },
  "authoring-and-creation": {
    outcome:
      "Extension authors can create, evolve, and version workspace-authored extensions with explicit authority transitions.",
  },
  "platform-reach": {
    outcome: "AXM works on every supported operating system, runtime, shell, and filesystem.",
  },
});
