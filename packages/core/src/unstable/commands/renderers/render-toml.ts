/**
 * TOML renderer for Gemini CLI.
 *
 * For: Gemini CLI.
 * Produces `.toml` with opaque frontmatter fields and `prompt`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { LossyRenderingWarning } from "../rendering-warnings.js";
import { substituteVariables } from "../variable-substitution.js";
import { applyOverrides } from "../../extensions/agent-overrides.js";
import { stringifyToml } from "../../toml/index.js";
import { decodeRelativePathSync } from "../../utils/path-types.js";
import { rendered, type CommandRenderOutcome, type RenderInput } from "./types.js";

/**
 * Render a command as TOML for Gemini CLI.
 *
 * Gemini CLI maps nested command filenames to `:` namespaces.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderToml = (input: RenderInput): CommandRenderOutcome => {
  const warnings: Array<LossyRenderingWarning> = [];
  const { agentId } = input;

  const { body: substitutedBody, warnings: subWarnings } = substituteVariables(input.body, agentId);
  warnings.push(...subWarnings);

  const frontmatter = applyOverrides(input.frontmatter, input.agentOverrides);
  const frontmatterWithoutPrompt = Object.fromEntries(
    Object.entries(frontmatter).filter(([key]) => key !== "prompt"),
  );
  const content = stringifyToml({ ...frontmatterWithoutPrompt, prompt: substitutedBody });

  return rendered(
    [{ content, relativePath: decodeRelativePathSync(`${input.commandName}.toml`), warnings }],
    warnings,
  );
};
