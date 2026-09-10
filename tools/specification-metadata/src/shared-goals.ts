/**
 * Shared product goals: outcomes that more than one AgentXM repository
 * serves. Each is registered once, here, with a stable identity; every
 * repository's specification corpus references these identities and keeps
 * repository-specific goals in its own local registry. A local registry must
 * not redefine a shared identity.
 *
 * The registry does not restate, own, or rank the specifications that
 * support a goal. Requirements review walks goals: a retired goal makes its
 * referencing specifications retirement candidates, and an active goal with
 * no referencing specification identifies missing coverage or a dead goal.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { defineProductGoals } from "./contract.js";

export const sharedProductGoals = defineProductGoals({
  "extension-adoption": {
    outcome:
      "People and agents can find, install, update, and remove reusable extensions across coding agents through dependable product surfaces.",
  },
  "trustworthy-distribution": {
    outcome:
      "Publishing and acquiring extensions preserves integrity, provenance, and immutable accepted resolutions.",
  },
  "machine-automation": {
    outcome:
      "Machine consumers can drive AgentXM surfaces non-interactively with complete, schema-backed results separated from diagnostics.",
  },
  "knowledge-access": {
    outcome:
      "People and agents can discover concepts, commands, and contracts from the surface they are already using.",
  },
  "privacy-and-consent": {
    outcome:
      "Observation of product use stays within the documented data boundary and under the control of the person being observed.",
  },
  "dependable-change-process": {
    outcome:
      "Changes and releases land through the governed repository process with required evidence and human approval.",
  },
});

export type SharedProductGoalId = keyof typeof sharedProductGoals;
