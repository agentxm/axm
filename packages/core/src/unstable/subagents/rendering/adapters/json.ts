/**
 * JSON adapter for subagent rendering.
 *
 * For: Kiro CLI.
 * Produces `.json` with `name`, `description`, `prompt` (from body), and `model`.
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
 * Render a subagent as JSON for Kiro CLI.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderJson = (input: SubagentRenderInput): SubagentRenderOutcome => {
  const warnings: Array<LossyRenderingWarning> = [];

  const obj: Record<string, unknown> = {
    name: input.name,
    description: input.description,
    prompt: input.body,
  };

  // Model mapping
  const modelResult = mapModelTier(input.model, "kiro");
  if (modelResult.value !== undefined) {
    obj["model"] = modelResult.value;
  }
  if (modelResult.warning !== undefined) {
    warnings.push(modelResult.warning);
  }

  // Tool access mapping
  const toolResult = mapToolAccess(input.toolAccess, "kiro");
  for (const [key, value] of Object.entries(toolResult.fields)) {
    obj[key] = value;
  }
  warnings.push(...toolResult.warnings);

  // Background — Kiro does not support background mode
  if (input.background === true) {
    warnings.push({
      agent: "kiro",
      feature: "background",
      message: "Kiro CLI does not support background mode; background: true will be ignored",
    });
  }

  const merged = applyOverrides(obj, input.agentOverrides);
  const content = JSON.stringify(merged, null, 2);
  const path = decodeRenderedFilePath(`.kiro/agents/${input.name}.json`);

  return rendered([{ content, path }], warnings);
};
