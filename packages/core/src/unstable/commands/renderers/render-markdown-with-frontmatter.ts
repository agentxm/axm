/**
 * Markdown + YAML frontmatter renderer.
 *
 * For: Claude Code, Codex, OpenCode, Augment, Junie, Kilo Code, Roo Code.
 * Produces `.md` with YAML frontmatter and substituted body.
 *
 * @experimental This API is unstable and may change without notice.
 */

import YAML from "yaml";
import type { LossyRenderingWarning } from "../rendering-warnings.js";
import { substituteVariables } from "../variable-substitution.js";
import { applyOverrides } from "../../extensions/agent-overrides.js";
import { decodeRelativePathSync } from "../../utils/path-types.js";
import { rendered, type CommandRenderOutcome, type RenderInput } from "./types.js";

/**
 * Render a command as Markdown with YAML frontmatter.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderMarkdownWithFrontmatter = (input: RenderInput): CommandRenderOutcome => {
  const warnings: Array<LossyRenderingWarning> = [];
  const fmObject = applyOverrides(input.frontmatter, input.agentOverrides);

  const { body: substitutedBody, warnings: subWarnings } = substituteVariables(
    input.body,
    input.agentId,
  );
  warnings.push(...subWarnings);

  const parts: Array<string> = [];

  if (Object.keys(fmObject).length > 0) {
    const yamlStr = YAML.stringify(fmObject, { lineWidth: 0 }).trim();
    parts.push(`---\n${yamlStr}\n---`);
  }

  if (substitutedBody.length > 0) {
    parts.push(substitutedBody);
  }

  return rendered(
    [
      {
        content: parts.join("\n"),
        relativePath: decodeRelativePathSync(`${input.commandName}.md`),
        warnings,
      },
    ],
    warnings,
  );
};
