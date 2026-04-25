/**
 * Markdown + YAML frontmatter adapter for subagent rendering.
 *
 * For: Claude Code, Copilot, Cursor, Gemini CLI, OpenCode, Augment,
 * Junie, Kilo Code, Kiro IDE.
 *
 * Produces `.md` with YAML frontmatter and body.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import YAML from "yaml";
import type { LossyRenderingWarning } from "../../../commands/rendering-warnings.js";
import { mapModelTier } from "../model-mapping.js";
import { mapToolAccess } from "../tool-access-mapping.js";
import { rendered, type SubagentRenderInput, type SubagentRenderOutcome } from "../types.js";

const decodeRenderedFilePath = Schema.decodeUnknownSync(
  Schema.String.pipe(Schema.brand("RenderedFilePath")),
);

/**
 * Per-agent configuration for Markdown+YAML rendering.
 *
 * Each agent may have different field names, directory paths,
 * and supported features.
 */
interface MarkdownAgentConfig {
  /** Directory path for project-scope subagent files. */
  readonly agentsDir: string;
  /** File extension (always ".md"). */
  readonly fileExtension: string;
  /** Whether this agent supports the `background` field. */
  readonly supportsBackground: boolean;
  /** Whether this agent supports the `model` field in frontmatter. */
  readonly supportsModel: boolean;
  /** Field name for "name" in frontmatter. */
  readonly nameField: string;
  /** Field name for "description" in frontmatter. */
  readonly descriptionField: string;
}

const DEFAULT_CONFIG: MarkdownAgentConfig = {
  agentsDir: "",
  fileExtension: ".md",
  supportsBackground: false,
  supportsModel: true,
  nameField: "name",
  descriptionField: "description",
};

const AGENT_CONFIGS: Readonly<Record<string, MarkdownAgentConfig>> = {
  "claude-code": {
    ...DEFAULT_CONFIG,
    agentsDir: ".claude/agents",
    supportsBackground: true,
  },
  "github-copilot": {
    ...DEFAULT_CONFIG,
    agentsDir: ".github/agents",
  },
  cursor: {
    ...DEFAULT_CONFIG,
    agentsDir: ".cursor/agents",
    supportsBackground: true,
  },
  "gemini-cli": {
    ...DEFAULT_CONFIG,
    agentsDir: ".gemini/agents",
  },
  opencode: {
    ...DEFAULT_CONFIG,
    agentsDir: ".opencode/agents",
  },
  augment: {
    ...DEFAULT_CONFIG,
    agentsDir: ".augment/agents",
  },
  junie: {
    ...DEFAULT_CONFIG,
    agentsDir: ".junie/agents",
  },
  "kilo-code": {
    ...DEFAULT_CONFIG,
    agentsDir: ".kilo/agents",
  },
  kiro: {
    ...DEFAULT_CONFIG,
    agentsDir: ".kiro/agents",
  },
};

/**
 * Build the YAML frontmatter object from subagent input and agent config.
 */
const buildFrontmatterObject = (
  input: SubagentRenderInput,
  config: MarkdownAgentConfig,
  warnings: Array<LossyRenderingWarning>,
): Record<string, unknown> => {
  const fm: Record<string, unknown> = {};

  fm[config.descriptionField] = input.description;

  // Model mapping
  if (config.supportsModel) {
    const modelResult = mapModelTier(input.model, input.agentId);
    if (modelResult.value !== undefined) {
      fm["model"] = modelResult.value;
    }
    if (modelResult.warning !== undefined) {
      warnings.push(modelResult.warning);
    }
  }

  // Tool access mapping
  const toolResult = mapToolAccess(input.toolAccess, input.agentId);
  for (const [key, value] of Object.entries(toolResult.fields)) {
    fm[key] = value;
  }
  warnings.push(...toolResult.warnings);

  // Background
  if (input.background === true) {
    if (config.supportsBackground) {
      fm["background"] = true;
    } else {
      warnings.push({
        agent: input.agentId,
        feature: "background",
        message: `${input.agentId} does not support background mode; "background: true" will be ignored`,
      });
    }
  }

  // Apply agent-specific overrides on top of computed frontmatter
  if (input.agentOverrides !== undefined) {
    for (const [key, value] of Object.entries(input.agentOverrides)) {
      fm[key] = value;
    }
  }

  return fm;
};

/**
 * Render a subagent as Markdown with YAML frontmatter.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderMarkdownYaml = (input: SubagentRenderInput): SubagentRenderOutcome => {
  const config = AGENT_CONFIGS[input.agentId] ?? {
    ...DEFAULT_CONFIG,
    agentsDir: `.${input.agentId}/agents`,
  };

  const warnings: Array<LossyRenderingWarning> = [];
  const fmObject = buildFrontmatterObject(input, config, warnings);

  const yamlStr = YAML.stringify(fmObject, { lineWidth: 0 }).trim();
  const parts: Array<string> = [`---\n${yamlStr}\n---`];

  if (input.body.length > 0) {
    parts.push(input.body);
  }

  const path = decodeRenderedFilePath(`${config.agentsDir}/${input.name}.md`);

  return rendered([{ content: parts.join("\n"), path }], warnings);
};
