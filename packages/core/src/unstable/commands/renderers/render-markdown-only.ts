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
import { decodeRelativePathSync } from "../../utils/path-types.js";
import { rendered, type CommandRenderOutcome, type RenderInput } from "./types.js";

/**
 * Render a command as plain Markdown without YAML frontmatter.
 *
 * Cursor does not support frontmatter fields like model, allowedTools, or
 * isolatedContext. These emit lossy rendering warnings when present.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderMarkdownOnly = (input: RenderInput): CommandRenderOutcome => {
  const warnings: Array<LossyRenderingWarning> = [];
  const { agentId } = input;

  const { body: substitutedBody, warnings: subWarnings } = substituteVariables(input.body, agentId);
  warnings.push(...subWarnings);

  return rendered(
    [
      {
        content: substitutedBody,
        relativePath: decodeRelativePathSync(`${input.commandName}.md`),
        warnings,
      },
    ],
    warnings,
  );
};
