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
import { applyOverrides } from "../../extensions/agent-overrides.js";
import { decodeRelativePathSync } from "../../utils/path-types.js";
import { rendered, type CommandRenderOutcome, type RenderInput } from "./types.js";

/**
 * Render a command as `.prompt.md` for Copilot.
 *
 * Copilot uses its own frontmatter schema with `description`, `mode`,
 * `tools`, and input variable definitions via `${input:name}`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderPromptMd = (input: RenderInput): CommandRenderOutcome => {
  const warnings: Array<LossyRenderingWarning> = [];
  const { agentId } = input;
  const fm = applyOverrides(input.frontmatter, input.agentOverrides);

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

  return rendered(
    [
      {
        content: parts.join("\n"),
        relativePath: decodeRelativePathSync(`${input.commandName}.prompt.md`),
        warnings,
      },
    ],
    warnings,
  );
};
