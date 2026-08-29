import { defineIntents } from "./support/contract.js";

/**
 * The intent registry: the product outcomes and capabilities AXM serves.
 *
 * Specification metadata references these identities. The registry does not
 * restate, own, or rank the requirements that serve an intent. Requirements
 * review walks this registry: a retired intent makes its referencing
 * specifications retirement candidates, and an active intent with no
 * referencing specification identifies missing coverage or a dead intent.
 */
export const intents = defineIntents({
  "extension-adoption": {
    outcome:
      "People and agents can find, install, update, and remove reusable extensions across coding agents through one dependable command surface.",
  },
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
  "trustworthy-distribution": {
    outcome:
      "Publishing and acquiring extensions preserves integrity, provenance, and immutable accepted resolutions.",
  },
  "machine-automation": {
    outcome:
      "Machine consumers can drive AXM non-interactively with complete, schema-backed results separated from diagnostics.",
  },
  "actionable-diagnostics": {
    outcome:
      "People and agents can understand invalid workspace state and recover it through ordinary commands without a repair workflow.",
  },
  "authoring-and-creation": {
    outcome:
      "Extension authors can create, evolve, and version workspace-authored extensions with explicit authority transitions.",
  },
  "knowledge-access": {
    outcome:
      "Installed knowledge and help surfaces let people and agents discover concepts, commands, and contracts without leaving the CLI.",
  },
  "privacy-and-consent": {
    outcome:
      "Observation of CLI use stays within the documented data boundary and under the control of the person running the CLI.",
  },
  "platform-reach": {
    outcome: "AXM works on every supported operating system, runtime, shell, and filesystem.",
  },
  "dependable-change-process": {
    outcome:
      "AXM changes and releases land through the governed repository process with required evidence and human approval.",
  },
});
