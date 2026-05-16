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
import { decodeRelativePathSync } from "../../utils/path-types.js";
import { rendered, type CommandRenderOutcome, type RenderInput } from "./types.js";

/**
 * Serialize TOML values for Gemini command files.
 */
const tomlValue = (value: unknown): string => {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => tomlValue(entry)).join(", ")}]`;
  }
  const str = typeof value === "string" ? value : String(value);
  if (str.includes("\n")) return `"""\n${str.replace(/"""/g, '"\\"\\""')}"""`;
  return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
};

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const tomlKey = (key: string): string =>
  /^[A-Za-z0-9_-]+$/.test(key) ? key : `"${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const tomlLines = (
  object: Readonly<Record<string, unknown>>,
  path: ReadonlyArray<string> = [],
): ReadonlyArray<string> => {
  const scalarLines: Array<string> = [];
  const tableLines: Array<string> = [];

  for (const [key, value] of Object.entries(object)) {
    if (isPlainObject(value)) {
      const childPath = [...path, key];
      tableLines.push("", `[${childPath.map((part) => tomlKey(part)).join(".")}]`);
      tableLines.push(...tomlLines(value, childPath));
    } else {
      scalarLines.push(`${tomlKey(key)} = ${tomlValue(value)}`);
    }
  }

  return [...scalarLines, ...tableLines];
};

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
  const content = tomlLines({ ...frontmatterWithoutPrompt, prompt: substitutedBody }).join("\n");

  return rendered(
    [{ content, relativePath: decodeRelativePathSync(`${input.commandName}.toml`), warnings }],
    warnings,
  );
};
