/**
 * JSON adapter for subagent rendering.
 *
 * For: Kiro CLI.
 * Emits the user's frontmatter keys as a JSON object and the body as the
 * `prompt` field. `agentOverrides[kiro]` is merged on top.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
import { applyOverrides } from "../overrides.js";
import { rendered, type SubagentRenderInput, type SubagentRenderOutcome } from "../types.js";

/**
 * Render a subagent as JSON for Kiro CLI.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderJson = (input: SubagentRenderInput): SubagentRenderOutcome => {
  const base: Record<string, unknown> = { ...input.frontmatter, prompt: input.body };
  const merged = applyOverrides(base, input.agentOverrides);
  const content = JSON.stringify(merged, null, 2);
  const path = decodeRelativePathSync(`.kiro/agents/${input.name}.json`);

  return rendered([{ content, path }], []);
};
