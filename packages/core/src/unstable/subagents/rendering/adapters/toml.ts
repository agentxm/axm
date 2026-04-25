/**
 * TOML adapter for subagent rendering.
 *
 * For: Codex.
 * Produces `.toml` with `name`, `description`, `developer_instructions`,
 * `model`, and `sandbox_mode` fields.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import type { LossyRenderingWarning } from "../../../commands/rendering-warnings.js";
import { mapModelTier } from "../model-mapping.js";
import { mapToolAccess } from "../tool-access-mapping.js";
import { rendered, type SubagentRenderInput, type SubagentRenderOutcome } from "../types.js";

const decodeRenderedFilePath = Schema.decodeUnknownSync(
  Schema.String.pipe(Schema.brand("RenderedFilePath")),
);

/**
 * Escape a string value for TOML.
 * Uses triple-quoted strings for multiline content, regular quotes otherwise.
 */
const tomlStringValue = (value: string): string => {
  if (value.includes("\n")) {
    return `"""\n${value.replace(/"""/g, '"\\"\\""')}"""`;
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
};

/**
 * Render a subagent as TOML for Codex.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderToml = (input: SubagentRenderInput): SubagentRenderOutcome => {
  const warnings: Array<LossyRenderingWarning> = [];
  const lines: Array<string> = [];

  lines.push(`name = ${tomlStringValue(input.name)}`);
  lines.push(`description = ${tomlStringValue(input.description)}`);

  // Model mapping
  const modelResult = mapModelTier(input.model, "codex");
  if (modelResult.value !== undefined) {
    lines.push(`model = ${tomlStringValue(modelResult.value)}`);
  }
  if (modelResult.warning !== undefined) {
    warnings.push(modelResult.warning);
  }

  // Tool access mapping (maps to sandbox_mode)
  const toolResult = mapToolAccess(input.toolAccess, "codex");
  for (const [key, value] of Object.entries(toolResult.fields)) {
    lines.push(`${key} = ${tomlStringValue(String(value))}`);
  }
  warnings.push(...toolResult.warnings);

  // Background — Codex does not support background mode
  if (input.background === true) {
    warnings.push({
      agent: "codex",
      feature: "background",
      message: "Codex does not support background mode; background: true will be ignored",
    });
  }

  // Developer instructions (body)
  lines.push(`developer_instructions = ${tomlStringValue(input.body)}`);

  // Apply agent-specific overrides — override any fields set above
  if (input.agentOverrides !== undefined) {
    for (const [key, value] of Object.entries(input.agentOverrides)) {
      // Find and replace existing line, or append
      const prefix = `${key} = `;
      const existingIdx = lines.findIndex((l) => l.startsWith(prefix));
      const line = `${key} = ${tomlStringValue(String(value))}`;
      if (existingIdx !== -1) {
        lines[existingIdx] = line;
      } else {
        lines.push(line);
      }
    }
  }

  const path = decodeRenderedFilePath(`.codex/agents/${input.name}.toml`);

  return rendered([{ content: lines.join("\n"), path }], warnings);
};
