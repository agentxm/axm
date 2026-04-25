/**
 * Prompt Markdown renderer for Copilot.
 *
 * For: GitHub Copilot.
 * Produces `.prompt.md` with YAML frontmatter and substituted body.
 *
 * @experimental This API is unstable and may change without notice.
 */

import YAML from "yaml";
import type { LossyRenderingWarning } from "../rendering-warnings.js";
import { substituteVariables } from "../variable-substitution.js";
import type { RenderInput, RenderOutput } from "./types.js";

/**
 * Render a command as `.prompt.md` for Copilot.
 *
 * Copilot uses its own frontmatter schema with `description`, `mode`,
 * `tools`, and input variable definitions via `${input:name}`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderPromptMd = (input: RenderInput): RenderOutput => {
  const warnings: Array<LossyRenderingWarning> = [];
  const { frontmatter, agentId } = input;
  const fm: Record<string, unknown> = {};

  if (frontmatter.description !== undefined) {
    fm["description"] = frontmatter.description;
  }

  // Copilot uses "mode" for model-like behavior
  if (frontmatter.model !== undefined && frontmatter.model !== null) {
    fm["model"] = frontmatter.model;
  }

  if (frontmatter.argumentHint !== undefined) {
    fm["argument-hint"] = frontmatter.argumentHint;
  }

  if (frontmatter.allowedTools !== undefined && frontmatter.allowedTools !== null) {
    fm["tools"] = [...frontmatter.allowedTools];
  }

  if (frontmatter.isolatedContext === true) {
    warnings.push({
      agent: agentId,
      feature: "isolatedContext",
      message: "Copilot does not support isolated context in commands",
    });
  }

  // Apply agent overrides
  if (input.agentOverrides !== undefined) {
    for (const [key, value] of Object.entries(input.agentOverrides)) {
      fm[key] = value;
    }
  }

  const { body: substitutedBody, warnings: subWarnings } = substituteVariables(input.body, agentId);
  warnings.push(...subWarnings);

  const parts: Array<string> = [];

  if (Object.keys(fm).length > 0) {
    const yamlStr = YAML.stringify(fm, { lineWidth: 0 }).trim();
    parts.push(`---\n${yamlStr}\n---`);
  }

  if (substitutedBody.length > 0) {
    parts.push(substitutedBody);
  }

  return {
    content: parts.join("\n"),
    warnings,
    fileExtension: ".prompt.md",
  };
};
