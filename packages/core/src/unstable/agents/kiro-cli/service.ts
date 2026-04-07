/**
 * Kiro CLI coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";

/** @experimental */
export const KIRO_COMMANDS_PROJECT_DIR = ".kiro/prompts";

export const kiroCliCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "kiro-cli",
  displayName: "Kiro",
  skillsProjectDir: ".kiro/skills",
  commandsProjectDir: KIRO_COMMANDS_PROJECT_DIR,
});
