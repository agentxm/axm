/**
 * JSON adapter for subagent rendering.
 *
 * For: Kiro CLI.
 * Emits the user's frontmatter keys as a JSON object and the body as the
 * `prompt` field.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
import { rendered, type SubagentRenderInput, type SubagentRenderOutcome } from "../types.js";

/**
 * Render a subagent as JSON for Kiro CLI.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderJson = (input: SubagentRenderInput): SubagentRenderOutcome => {
  const base: Record<string, unknown> = { ...input.frontmatter, prompt: input.body };
  const content = JSON.stringify(base, null, 2);
  const path = decodeRelativePathSync(`${input.name}.json`);

  return rendered([{ content, path }], []);
};
