/**
 * TOML adapter for subagent rendering.
 *
 * For: Codex.
 * Emits the user's frontmatter keys as TOML key=value pairs and the body
 * as the `developer_instructions` field. `agentOverrides[codex]` is merged
 * on top.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { stringifyToml } from "../../../toml/index.js";
import { decodeRelativePathSync } from "../../../utils/path-types.js";
import { applyOverrides } from "../overrides.js";
import { rendered, type SubagentRenderInput, type SubagentRenderOutcome } from "../types.js";

/**
 * Render a subagent as TOML for Codex.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderToml = (input: SubagentRenderInput): SubagentRenderOutcome => {
  const base: Record<string, unknown> = {
    ...input.frontmatter,
    developer_instructions: input.body,
  };
  const merged = applyOverrides(base, input.agentOverrides);

  const path = decodeRelativePathSync(`.codex/agents/${input.name}.toml`);

  return rendered([{ content: stringifyToml(merged), path }], []);
};
