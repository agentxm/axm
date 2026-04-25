/**
 * Markdown-only renderer (no frontmatter).
 *
 * For: Cursor.
 * Produces `.md` with substituted body only.
 *
 * @experimental This API is unstable and may change without notice.
 */
import type { LossyRenderingWarning } from "../rendering-warnings.js";
import { substituteVariables } from "../variable-substitution.js";
import type { RenderInput, RenderOutput } from "./types.js";

/**
 * Render a command as plain Markdown without YAML frontmatter.
 *
 * Cursor does not support frontmatter fields like model, allowedTools, or
 * isolatedContext. These emit lossy rendering warnings when present.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderMarkdownOnly = (input: RenderInput): RenderOutput => {
  const warnings: Array<LossyRenderingWarning> = [];
  const { frontmatter, agentId } = input;

  // Warn for unsupported frontmatter fields
  if (frontmatter.model !== undefined && frontmatter.model !== null) {
    warnings.push({
      agent: agentId,
      feature: "model",
      message: "Cursor does not support model specification in commands",
    });
  }

  if (frontmatter.allowedTools !== undefined && frontmatter.allowedTools !== null) {
    warnings.push({
      agent: agentId,
      feature: "allowedTools",
      message: "Cursor does not support allowed tools specification in commands",
    });
  }

  if (frontmatter.isolatedContext === true) {
    warnings.push({
      agent: agentId,
      feature: "isolatedContext",
      message: "Cursor does not support isolated context in commands",
    });
  }

  const { body: substitutedBody, warnings: subWarnings } = substituteVariables(input.body, agentId);
  warnings.push(...subWarnings);

  return {
    content: substitutedBody,
    warnings,
    fileExtension: ".md",
  };
};
