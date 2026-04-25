/**
 * TOML renderer for Gemini CLI.
 *
 * For: Gemini CLI.
 * Produces `.toml` with `description` and `prompt` fields.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { LossyRenderingWarning } from "../rendering-warnings.js";
import { substituteVariables } from "../variable-substitution.js";
import type { RenderInput, RenderOutput } from "./types.js";

/**
 * Escape a string value for TOML.
 * Uses triple-quoted strings for multiline content, regular quotes otherwise.
 */
const tomlStringValue = (value: string): string => {
  if (value.includes("\n")) {
    // Use TOML multiline basic string
    return `"""\n${value.replace(/"""/g, '"\\"\\""')}"""`;
  }
  // Escape backslashes and quotes for single-line
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
};

/**
 * Render a command as TOML for Gemini CLI.
 *
 * Gemini CLI's TOML format supports only `prompt` and `description` fields.
 * Most portable frontmatter fields have no TOML equivalent and emit warnings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderToml = (input: RenderInput): RenderOutput => {
  const warnings: Array<LossyRenderingWarning> = [];
  const { frontmatter, agentId } = input;

  // Warn for unsupported features
  if (frontmatter.model !== undefined && frontmatter.model !== null) {
    warnings.push({
      agent: agentId,
      feature: "model",
      message: "Gemini CLI TOML format does not support model specification",
    });
  }

  if (frontmatter.allowedTools !== undefined && frontmatter.allowedTools !== null) {
    warnings.push({
      agent: agentId,
      feature: "allowedTools",
      message: "Gemini CLI TOML format does not support allowed tools",
    });
  }

  if (frontmatter.isolatedContext === true) {
    warnings.push({
      agent: agentId,
      feature: "isolatedContext",
      message: "Gemini CLI TOML format does not support isolated context",
    });
  }

  if (frontmatter.arguments !== undefined && frontmatter.arguments.length > 0) {
    warnings.push({
      agent: agentId,
      feature: "arguments",
      message: "Gemini CLI has limited support for command arguments",
    });
  }

  const { body: substitutedBody, warnings: subWarnings } = substituteVariables(input.body, agentId);
  warnings.push(...subWarnings);

  const lines: Array<string> = [];

  if (frontmatter.description !== undefined) {
    lines.push(`description = ${tomlStringValue(frontmatter.description)}`);
  }

  lines.push(`prompt = ${tomlStringValue(substitutedBody)}`);

  return {
    content: lines.join("\n"),
    warnings,
    fileExtension: ".toml",
  };
};
