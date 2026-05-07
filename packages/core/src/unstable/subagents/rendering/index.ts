/**
 * Subagent rendering engine.
 *
 * Maps agent IDs to format-family renderers and handles Kiro dual-format.
 *
 * @experimental This API is unstable and may change without notice.
 */

export type {
  AgentOverrides,
  SubagentRenderInput,
  SubagentRenderOutput,
  SubagentRenderOutcome,
  SubagentRendered,
  SubagentSkipped,
  SubagentRenderer,
} from "./types.js";

export { rendered, skipped } from "./types.js";

export { applyOverrides } from "./overrides.js";

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

/**
 * Map of agent IDs to their subagent renderer function.
 *
 * Kiro is handled specially (dual-format) and is not in this map.
 * Roo Code is also special (mode entry, not file) and is not in this map.
 */
const rendererMap: Readonly<Record<string, SubagentRenderer>> = {
  "claude-code": renderMarkdownYaml,
  "github-copilot": renderMarkdownYaml,
  cursor: renderMarkdownYaml,
  "gemini-cli": renderMarkdownYaml,
  opencode: renderMarkdownYaml,
  augment: renderMarkdownYaml,
  junie: renderMarkdownYaml,
  "kilo-code": renderMarkdownYaml,
  codex: renderToml,
  "kiro-cli": renderJson,
};

/**
 * Render a subagent for Kiro — produces two files (IDE .md + CLI .json).
 *
 * The IDE format uses the Markdown+YAML adapter; the CLI format uses
 * the JSON adapter.
 */
const renderKiroDualFormat = (input: SubagentRenderInput): SubagentRenderOutcome => {
  const ideInput: SubagentRenderInput = { ...input, agentId: "kiro" };
  const cliInput: SubagentRenderInput = { ...input, agentId: "kiro" };

  const ideResult = renderMarkdownYaml(ideInput);
  const cliResult = renderJson(cliInput);

  if (ideResult._tag === "Skipped") return ideResult;
  if (cliResult._tag === "Skipped") return cliResult;

  return rendered(
    [...ideResult.outputs, ...cliResult.outputs],
    [...ideResult.warnings, ...cliResult.warnings],
  );
};

/**
 * Select the appropriate renderer for an agent ID.
 *
 * Returns undefined for agents that need special handling (roo-code).
 * Handles Kiro dual-format internally.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const selectSubagentRenderer = (agentId: string): SubagentRenderer | undefined => {
  if (agentId === "kiro") return renderKiroDualFormat;
  if (agentId === "roo-code") return undefined;
  return rendererMap[agentId] ?? renderMarkdownYaml;
};

/**
 * Render a subagent for a given agent ID.
 *
 * Delegates to the appropriate format-family renderer.
 * Returns undefined for roo-code (which requires special read-modify-write handling).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderSubagent = (input: SubagentRenderInput): SubagentRenderOutcome | undefined => {
  const renderer = selectSubagentRenderer(input.agentId);
  if (renderer === undefined) return undefined;
  return renderer(input);
};
