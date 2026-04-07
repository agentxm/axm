/**
 * Junie coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";

/** @experimental */
export const JUNIE_COMMANDS_PROJECT_DIR = ".junie/commands";

export const junieCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "junie",
  displayName: "Junie",
  skillsProjectDir: ".junie/skills",
  commandsProjectDir: JUNIE_COMMANDS_PROJECT_DIR,
});
