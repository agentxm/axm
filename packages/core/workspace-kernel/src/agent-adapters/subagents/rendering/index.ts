/**
 * Subagent rendering engine.
 *
 * Maps supported agent IDs to their native format serializers.
 *
 * @experimental This API is unstable and may change without notice.
 */

export type {
  OwnershipBannerText,
  SubagentRenderInput,
  SubagentRenderOutput,
  SubagentRenderOutcome,
  SubagentRendered,
  SubagentSkipped,
  SubagentRenderer,
} from "./types.js";

export { rendered, skipped } from "./types.js";

export { renderMarkdownYaml } from "./adapters/markdown-yaml.js";
export { renderToml } from "./adapters/toml.js";
export { renderJson } from "./adapters/json.js";
export {
  buildRooModeEntry,
  mergeRooModes,
  removeRooMode,
  splitBody,
  type RooModeEntry,
  type RooModeResult,
} from "./adapters/roo.js";

import { renderMarkdownYaml } from "./adapters/markdown-yaml.js";
import { renderToml } from "./adapters/toml.js";
import { renderJson } from "./adapters/json.js";
import type { SubagentRenderInput, SubagentRenderOutcome, SubagentRenderer } from "./types.js";
import { rendered } from "./types.js";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";

/**
 * Map of agent IDs to their subagent renderer function.
 *
 * Roo Code is also special (mode entry, not file) and is not in this map.
 */
const rendererMap: Readonly<Record<string, SubagentRenderer>> = {
  antigravity: renderMarkdownYaml,
  "antigravity-cli": renderMarkdownYaml,
  "claude-code": renderMarkdownYaml,
  "github-copilot-cli": renderMarkdownYaml,
  cursor: renderMarkdownYaml,
  "gemini-cli": renderMarkdownYaml,
  opencode: renderMarkdownYaml,
  augment: renderMarkdownYaml,
  junie: renderMarkdownYaml,
  kilo: renderMarkdownYaml,
  "kimi-cli": renderMarkdownYaml,
  codebuddy: renderMarkdownYaml,
  "mimo-code": renderMarkdownYaml,
  kode: renderMarkdownYaml,
  "codearts-agent": renderMarkdownYaml,
  "iflow-cli": renderMarkdownYaml,
  rovodev: renderMarkdownYaml,
  "qwen-code": renderMarkdownYaml,
  qoder: renderMarkdownYaml,
  "qoder-cn": renderMarkdownYaml,
  "grok-cli": renderMarkdownYaml,
  "command-code": renderMarkdownYaml,
  mux: renderMarkdownYaml,
  codex: renderToml,
  "kiro-cli": renderJson,
};

/**
 * Select the appropriate renderer for an agent ID.
 *
 * Returns undefined for agents that need special handling (roo).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const selectSubagentRenderer = (agentId: string): SubagentRenderer | undefined => {
  if (agentId === "roo") return undefined;
  return rendererMap[agentId];
};

/**
 * Render a subagent for a given agent ID.
 *
 * Delegates to the appropriate format-family renderer.
 * Returns undefined for roo (which requires special read-modify-write handling).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderSubagent = (input: SubagentRenderInput): SubagentRenderOutcome | undefined => {
  if (input.native !== undefined) {
    const native = input.native;
    const banner = input.ownershipBanner?.[native.format];
    let content = native.content;
    if (banner !== undefined) {
      if (native.format === "toml") content = `${banner}\n${content}`;
      else {
        const frontmatter = /^(---\r?\n[\s\S]*?\r?\n---)(?:\r?\n|$)/u.exec(content);
        content =
          frontmatter === null
            ? `${banner}\n${content}`
            : `${frontmatter[1]}\n${banner}\n${content.slice(frontmatter[0].length)}`;
      }
    }
    return rendered([
      {
        path: decodeRelativePathSync(`${input.name}.${native.format === "toml" ? "toml" : "md"}`),
        content,
      },
    ]);
  }
  const renderer = selectSubagentRenderer(input.agentId);
  if (renderer === undefined) return undefined;
  return renderer(input);
};
