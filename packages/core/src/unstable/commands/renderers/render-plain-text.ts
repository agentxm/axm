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
import { applyOverrides } from "../../extensions/agent-overrides.js";
import { rendered, type CommandRenderOutcome, type RenderInput } from "./types.js";

/**
 * Render a command as plain text for Kiro.
 *
 * Kiro uses plain text prompt files with no frontmatter and no variable
 * substitution. All features beyond plain text body emit warnings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderPlainText = (input: RenderInput): CommandRenderOutcome => {
  const warnings: Array<LossyRenderingWarning> = [];
  const { agentId } = input;
  const mergedFrontmatter = applyOverrides(input.frontmatter, input.agentOverrides);

  if (Object.keys(mergedFrontmatter).length > 0) {
    warnings.push({
      agent: agentId,
      feature: "frontmatter",
      message: "Kiro CLI prompt files are plain text; command frontmatter is not rendered",
    });
  }

  // Variable substitution for kiro renders as literal text + warnings
  const { body: substitutedBody, warnings: subWarnings } = substituteVariables(input.body, agentId);
  warnings.push(...subWarnings);

  return rendered(
    [{ content: substitutedBody, relativePath: `${input.commandName}.txt`, warnings }],
    warnings,
  );
};
