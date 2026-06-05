/**
 * Variable substitution engine for portable command variables.
 *
 * Translates portable variable syntax (`{{arguments}}`, `{{arguments[N]}}`,
 * `{{arg:name}}`) into agent-native syntax at render time.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { LossyRenderingWarning } from "./rendering-warnings.js";

// ---------------------------------------------------------------------------
// Portable variable types
// ---------------------------------------------------------------------------

/**
 * Portable variable representing all arguments.
 */
export interface AllArgumentsVariable {
  readonly type: "arguments";
}

/**
 * Portable variable representing a positional argument by zero-based index.
 */
export interface PositionalVariable {
  readonly type: "positional";
  readonly index: number;
}

/**
 * Portable variable representing a named argument.
 */
export interface NamedVariable {
  readonly type: "named";
  readonly name: string;
}

/**
 * Union of all portable variable types.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PortableVariable = AllArgumentsVariable | PositionalVariable | NamedVariable;

// ---------------------------------------------------------------------------
// Agent families for variable encoding
// ---------------------------------------------------------------------------

/**
 * Agent families that share variable encoding rules.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AgentFamily = "claude-code" | "cursor" | "gemini" | "junie" | "kiro";

/**
 * Map agent IDs to their variable-encoding family.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const agentFamilyMap: Readonly<Record<string, AgentFamily>> = {
  "claude-code": "claude-code",
  codex: "claude-code",
  opencode: "claude-code",
  augment: "claude-code",
  kilo: "claude-code",
  roo: "claude-code",
  cursor: "cursor",
  "gemini-cli": "gemini",
  junie: "junie",
  "kiro-cli": "kiro",
};

/**
 * Resolve the agent family for a given agent ID.
 * Falls back to "claude-code" for unknown agents.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const resolveAgentFamily = (agentId: string): AgentFamily =>
  agentFamilyMap[agentId] ?? "claude-code";

// ---------------------------------------------------------------------------
// Per-family variable encoding
// ---------------------------------------------------------------------------

/**
 * Result of encoding a single variable for an agent.
 */
interface EncodedVariable {
  /** The replacement text for the variable occurrence. */
  readonly replacement: string;
  /** Text to append after the body (for "appended as context" semantics). */
  readonly appendix?: string;
  /** Warning if the variable cannot be faithfully represented. */
  readonly warning?: LossyRenderingWarning;
}

const encodeClaudeCode = (variable: PortableVariable, _agent: string): EncodedVariable => {
  switch (variable.type) {
    case "arguments":
      return { replacement: "$ARGUMENTS" };
    case "positional":
      return { replacement: `$${variable.index + 1}` };
    case "named":
      return {
        replacement: "",
        appendix: `\n\n**${variable.name}:** (provided as context)`,
      };
  }
};

const encodeCursor = (variable: PortableVariable, _agent: string): EncodedVariable => {
  switch (variable.type) {
    case "arguments":
      return { replacement: "$ARGUMENTS" };
    case "positional":
      // Cursor doesn't support positional args; inline into $ARGUMENTS
      return { replacement: "$ARGUMENTS" };
    case "named":
      return {
        replacement: "",
        appendix: `\n\n**${variable.name}:** (provided as context)`,
      };
  }
};

const encodeGemini = (variable: PortableVariable, _agent: string): EncodedVariable => {
  switch (variable.type) {
    case "arguments":
      return { replacement: "{{args}}" };
    case "positional":
      // Gemini doesn't support positional args; inline into {{args}}
      return { replacement: "{{args}}" };
    case "named":
      return {
        replacement: "",
        appendix: `\n\n**${variable.name}:** (provided as context)`,
      };
  }
};

const encodeJunie = (variable: PortableVariable, _agent: string): EncodedVariable => {
  switch (variable.type) {
    case "arguments":
      return {
        replacement: "",
        appendix: "\n\n(all arguments appended)",
      };
    case "positional":
      return { replacement: `$arg${variable.index + 1}` };
    case "named":
      return { replacement: `$${variable.name}` };
  }
};

const encodeKiro = (variable: PortableVariable, agent: string): EncodedVariable => {
  const original =
    variable.type === "arguments"
      ? "{{arguments}}"
      : variable.type === "positional"
        ? `{{arguments[${variable.index}]}}`
        : `{{arg:${variable.name}}}`;

  return {
    replacement: original,
    warning: {
      agent,
      feature: "variables",
      message: `Kiro does not support variable substitution; "${original}" rendered as literal text`,
    },
  };
};

const encodersByFamily: Record<
  AgentFamily,
  (variable: PortableVariable, agent: string) => EncodedVariable
> = {
  "claude-code": encodeClaudeCode,
  cursor: encodeCursor,
  gemini: encodeGemini,
  junie: encodeJunie,
  kiro: encodeKiro,
};

// ---------------------------------------------------------------------------
// Variable parsing
// ---------------------------------------------------------------------------

/**
 * Regex to match portable variable patterns in body text.
 * Matches: {{arguments}}, {{arguments[N]}}, {{arg:name}}
 * Does NOT match escaped \{{ sequences (handled separately).
 */
const VARIABLE_PATTERN = /(?<!\\)\{\{(arguments(?:\[(\d+)\])?|arg:([a-zA-Z_][a-zA-Z0-9_]*))\}\}/g;

/**
 * Parse regex capture groups into a PortableVariable.
 */
const parseCaptures = (
  positionalIndex: string | undefined,
  namedArg: string | undefined,
): PortableVariable => {
  if (namedArg !== undefined) {
    return { type: "named", name: namedArg };
  }
  if (positionalIndex !== undefined) {
    return { type: "positional", index: parseInt(positionalIndex, 10) };
  }
  return { type: "arguments" };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Result of variable substitution on a body string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SubstitutionResult {
  /** The body with variables replaced by agent-native syntax. */
  readonly body: string;
  /** Lossy rendering warnings from unsupported variable features. */
  readonly warnings: ReadonlyArray<LossyRenderingWarning>;
}

/**
 * Substitute portable variables in a command body with agent-native syntax.
 *
 * Parses `{{arguments}}`, `{{arguments[N]}}`, `{{arg:name}}` patterns and
 * replaces them with the appropriate syntax for the given agent. Handles
 * the escape sequence `\{{` by converting it to literal `{{`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const substituteVariables = (body: string, agentId: string): SubstitutionResult => {
  const family = resolveAgentFamily(agentId);
  const encode = encodersByFamily[family];
  const warnings: Array<LossyRenderingWarning> = [];
  const appendices: Array<string> = [];

  // Replace variable patterns
  let result = body.replace(
    VARIABLE_PATTERN,
    (_fullMatch: string, _group1: string, positionalIndex?: string, namedArg?: string) => {
      const variable = parseCaptures(positionalIndex, namedArg);
      const encoded = encode(variable, agentId);

      if (encoded.warning) {
        warnings.push(encoded.warning);
      }
      if (encoded.appendix) {
        appendices.push(encoded.appendix);
      }

      return encoded.replacement;
    },
  );

  // Append context sections
  if (appendices.length > 0) {
    result += appendices.join("");
  }

  // Unescape \{{ to literal {{
  result = result.replace(/\\\{\{/g, "{{");

  return { body: result, warnings };
};
