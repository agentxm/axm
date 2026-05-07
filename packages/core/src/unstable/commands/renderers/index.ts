/**
 * Command renderer library.
 *
 * Exports all format-family renderers and a selector function that
 * returns the correct renderer for a given agent ID.
 *
 * @experimental This API is unstable and may change without notice.
 */

export type {
  AgentOverrides,
  RenderInput,
  RenderOutput,
  CommandRenderOutcome,
  CommandRendered,
  CommandSkipped,
} from "./types.js";

export { rendered, skipped } from "./types.js";

export { renderMarkdownWithFrontmatter } from "./render-markdown-with-frontmatter.js";
export { renderMarkdownOnly } from "./render-markdown-only.js";
export { renderPromptMd } from "./render-prompt-md.js";
export { renderToml } from "./render-toml.js";
export { renderPlainText } from "./render-plain-text.js";

import { renderMarkdownWithFrontmatter } from "./render-markdown-with-frontmatter.js";
import { renderMarkdownOnly } from "./render-markdown-only.js";
import { renderPromptMd } from "./render-prompt-md.js";
import { renderToml } from "./render-toml.js";
import { renderPlainText } from "./render-plain-text.js";
import type { CommandRenderOutcome, RenderInput } from "./types.js";

/**
 * Renderer function signature shared by all format families.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Renderer = (input: RenderInput) => CommandRenderOutcome;

/**
 * Map of agent IDs to their renderer function.
 */
const rendererMap: Readonly<Record<string, Renderer>> = {
  "claude-code": renderMarkdownWithFrontmatter,
  codex: renderMarkdownWithFrontmatter,
  opencode: renderMarkdownWithFrontmatter,
  augment: renderMarkdownWithFrontmatter,
  junie: renderMarkdownWithFrontmatter,
  kilo: renderMarkdownWithFrontmatter,
  roo: renderMarkdownWithFrontmatter,
  cursor: renderMarkdownOnly,
  "github-copilot": renderPromptMd,
  "gemini-cli": renderToml,
  "kiro-cli": renderPlainText,
};

/**
 * Select the appropriate renderer for an agent ID.
 *
 * Returns undefined when command rendering is not supported for an agent.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const selectRenderer = (agentId: string): Renderer | undefined => rendererMap[agentId];
