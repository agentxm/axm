/**
 * Command renderer library.
 *
 * Exports all format-family renderers and a selector function that
 * returns the correct renderer for a given agent ID.
 *
 * @experimental This API is unstable and may change without notice.
 */

export type {
  RendererCommandArgument,
  RendererCommandFrontmatter,
  AgentOverrides,
  RenderInput,
  RenderOutput,
} from "./types.js";

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
import type { RenderInput, RenderOutput } from "./types.js";

/**
 * Renderer function signature shared by all format families.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Renderer = (input: RenderInput) => RenderOutput;

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
 * Returns `renderMarkdownWithFrontmatter` as the default for unknown agents.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const selectRenderer = (agentId: string): Renderer =>
  rendererMap[agentId] ?? renderMarkdownWithFrontmatter;
