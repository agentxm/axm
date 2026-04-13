import { agentReadinessCheck } from "./checks/agent-readiness.js";
import { lockfileValidationCheck } from "./checks/lockfile-validation.js";
import { settingsValidationCheck } from "./checks/settings-validation.js";
import { workspaceReadyCheck } from "./checks/workspace-ready.js";
import { runCheckGraph } from "./runner.js";

export const diagnoseWorkspaceDoctor = () =>
  runCheckGraph([
    workspaceReadyCheck,
    settingsValidationCheck,
    lockfileValidationCheck,
    agentReadinessCheck,
  ]);
