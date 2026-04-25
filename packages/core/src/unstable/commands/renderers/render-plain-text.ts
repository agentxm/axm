/**
 * Plain text renderer for Kiro.
 *
 * For: Kiro.
 * Produces plain text body.
 * All portable variables render as literal text with lossy-rendering warnings.
 *
 * @experimental This API is unstable and may change without notice.
 */
import type { LossyRenderingWarning } from "../rendering-warnings.js";
import { substituteVariables } from "../variable-substitution.js";
import type { RenderInput, RenderOutput } from "./types.js";

/**
 * Render a command as plain text for Kiro.
 *
 * Kiro uses plain text prompt files with no frontmatter and no variable
 * substitution. All features beyond plain text body emit warnings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderPlainText = (input: RenderInput): RenderOutput => {
  const warnings: Array<LossyRenderingWarning> = [];
  const { frontmatter, agentId } = input;

  // Warn for all unsupported frontmatter fields
  if (frontmatter.model !== undefined && frontmatter.model !== null) {
    warnings.push({
      agent: agentId,
      feature: "model",
      message: "Kiro does not support model specification in commands",
    });
  }

  if (frontmatter.allowedTools !== undefined && frontmatter.allowedTools !== null) {
    warnings.push({
      agent: agentId,
      feature: "allowedTools",
      message: "Kiro does not support allowed tools in commands",
    });
  }

  if (frontmatter.isolatedContext === true) {
    warnings.push({
      agent: agentId,
      feature: "isolatedContext",
      message: "Kiro does not support isolated context in commands",
    });
  }

  if (frontmatter.arguments !== undefined && frontmatter.arguments.length > 0) {
    warnings.push({
      agent: agentId,
      feature: "arguments",
      message: "Kiro does not support command arguments",
    });
  }

  // Variable substitution for kiro renders as literal text + warnings
  const { body: substitutedBody, warnings: subWarnings } = substituteVariables(input.body, agentId);
  warnings.push(...subWarnings);

  return {
    content: substitutedBody,
    warnings,
    fileExtension: ".txt",
  };
};
