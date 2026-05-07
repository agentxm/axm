/**
 * TOML adapter for subagent rendering.
 *
 * For: Codex.
 * Emits the user's frontmatter keys as TOML key=value pairs and the body
 * as the `developer_instructions` field. `agentOverrides[codex]` is merged
 * on top.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { applyOverrides } from "../overrides.js";
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
  const base: Record<string, unknown> = {
    ...input.frontmatter,
    developer_instructions: input.body,
  };
  const merged = applyOverrides(base, input.agentOverrides);
  const lines = Object.entries(merged).map(([key, value]) => `${key} = ${tomlValue(value)}`);

  const path = decodeRenderedFilePath(`.codex/agents/${input.name}.toml`);

  return rendered([{ content: lines.join("\n"), path }], []);
};
