/**
 * Markdown + YAML frontmatter adapter for subagent rendering.
 *
 * For: Antigravity, Antigravity CLI, Claude Code, Copilot, Cursor, Gemini CLI, OpenCode, Augment,
 * Junie, Kilo Code, Kiro IDE.
 *
 * Produces `.md` with YAML frontmatter and body. The user's frontmatter
 * passes through verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import YAML from "yaml";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
import { rendered, type SubagentRenderInput, type SubagentRenderOutcome } from "../types.js";

/**
 * Render a subagent as Markdown with YAML frontmatter.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderMarkdownYaml = (input: SubagentRenderInput): SubagentRenderOutcome => {
  const fmObject = input.frontmatter;

  const yamlStr = YAML.stringify(fmObject, { lineWidth: 0 }).trim();
  const parts: Array<string> = [`---\n${yamlStr}\n---`];

  if (input.ownershipBanner !== undefined) {
    parts.push(`${input.ownershipBanner.markdown}\n`);
  }

  if (input.body.length > 0) {
    parts.push(input.body);
  }

  const path = decodeRelativePathSync(`${input.name}.md`);

  return rendered([{ content: parts.join("\n"), path }], []);
};
