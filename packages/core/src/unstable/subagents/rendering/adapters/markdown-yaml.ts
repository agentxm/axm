/**
 * Markdown + YAML frontmatter adapter for subagent rendering.
 *
 * For: Claude Code, Copilot, Cursor, Gemini CLI, OpenCode, Augment,
 * Junie, Kilo Code, Kiro IDE.
 *
 * Produces `.md` with YAML frontmatter and body. The user's frontmatter
 * passes through verbatim; `agentOverrides[<agent-id>]` is merged on top.
 *
 * @experimental This API is unstable and may change without notice.
 */

import YAML from "yaml";
import { decodeRelativePathSync } from "../../../utils/path-types.js";
import { applyOverrides } from "../overrides.js";
import { rendered, type SubagentRenderInput, type SubagentRenderOutcome } from "../types.js";

const AGENT_DIRS: Readonly<Record<string, string>> = {
  "claude-code": ".claude/agents",
  "github-copilot-cli": ".github/agents",
  cursor: ".cursor/agents",
  "gemini-cli": ".gemini/agents",
  opencode: ".opencode/agents",
  augment: ".augment/agents",
  junie: ".junie/agents",
  "kilo-code": ".kilo/agents",
  kiro: ".kiro/agents",
};

const resolveAgentsDir = (agentId: string): string => AGENT_DIRS[agentId] ?? `.${agentId}/agents`;

/**
 * Render a subagent as Markdown with YAML frontmatter.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderMarkdownYaml = (input: SubagentRenderInput): SubagentRenderOutcome => {
  const fmObject = applyOverrides(input.frontmatter, input.agentOverrides);

  const yamlStr = YAML.stringify(fmObject, { lineWidth: 0 }).trim();
  const parts: Array<string> = [`---\n${yamlStr}\n---`];

  if (input.body.length > 0) {
    parts.push(input.body);
  }

  const path = decodeRelativePathSync(`${resolveAgentsDir(input.agentId)}/${input.name}.md`);

  return rendered([{ content: parts.join("\n"), path }], []);
};
