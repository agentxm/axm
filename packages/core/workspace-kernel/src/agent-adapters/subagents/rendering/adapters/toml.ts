/**
 * TOML adapter for subagent rendering.
 *
 * For: Codex.
 * Emits the user's frontmatter keys as TOML key=value pairs and the body
 * as the `developer_instructions` field.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { stringifyToml } from "../../../toml.js";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
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

  const path = decodeRelativePathSync(`${input.name}.toml`);
  const body = stringifyToml(base);
  const content =
    input.ownershipBanner === undefined ? body : `${input.ownershipBanner.toml}\n\n${body}`;

  return rendered([{ content, path }], []);
};
