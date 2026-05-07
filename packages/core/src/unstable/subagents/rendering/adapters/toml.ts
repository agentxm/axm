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
import { applyOverrides } from "../overrides.js";
import { mapToolAccess } from "../tool-access-mapping.js";
import { rendered, type SubagentRenderInput, type SubagentRenderOutcome } from "../types.js";

const decodeRenderedFilePath = Schema.decodeUnknownSync(
  Schema.String.pipe(Schema.brand("RenderedFilePath")),
);

/**
 * Serialize a single value to a TOML right-hand side.
 *
 * Strings use triple-quoted form when they contain newlines and regular
 * quotes otherwise. Numbers and booleans pass through. Other types are
 * coerced via `String(...)` and quoted.
 */
const tomlValue = (value: unknown): string => {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  const str = typeof value === "string" ? value : String(value);
  if (str.includes("\n")) {
    return `"""\n${str.replace(/"""/g, '"\\"\\""')}"""`;
  }
  return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
};

/**
 * Render a subagent as TOML for Codex.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderToml = (input: SubagentRenderInput): SubagentRenderOutcome => {
  const warnings: Array<LossyRenderingWarning> = [];
  const fields: Record<string, unknown> = {};

  fields["name"] = input.name;
  fields["description"] = input.description;

  // Model mapping
  const modelResult = mapModelTier(input.model, "codex");
  if (modelResult.value !== undefined) {
    fields["model"] = modelResult.value;
  }
  if (modelResult.warning !== undefined) {
    warnings.push(modelResult.warning);
  }

  // Tool access mapping (maps to sandbox_mode)
  const toolResult = mapToolAccess(input.toolAccess, "codex");
  for (const [key, value] of Object.entries(toolResult.fields)) {
    fields[key] = value;
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
  fields["developer_instructions"] = input.body;

  const merged = applyOverrides(fields, input.agentOverrides);
  const lines = Object.entries(merged).map(([key, value]) => `${key} = ${tomlValue(value)}`);

  const path = decodeRenderedFilePath(`.codex/agents/${input.name}.toml`);

  return rendered([{ content: lines.join("\n"), path }], warnings);
};
