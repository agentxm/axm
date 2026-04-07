/**
 * Roo Code coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeProjectOnlyCodingAgent } from "../project-only-agent.js";

/** @experimental */
export const ROO_COMMANDS_PROJECT_DIR = ".roo/commands";

export const rooCodingAgent = makeProjectOnlyCodingAgent({
  agentId: "roo",
  displayName: "Roo Code",
  skillsProjectDir: ".roo/skills",
  commandsProjectDir: ROO_COMMANDS_PROJECT_DIR,
});
