import * as Schema from "effect/Schema";
import * as Hash from "effect/Hash";
import {
  McpRegistryInputSchema,
  type McpRegistryArgument,
  type McpRegistryInput,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import {
  isMcpCredentialName,
  isSymbolicMcpCredential,
  normalizeMcpValue,
  type McpBinding,
  type McpValue,
} from "./connection.js";
import type { McpDistributionCandidate } from "./distribution.js";

/** Runtime qualification is local; the published Registry manifest contract stays unchanged. */
const VariableSchema = Schema.Struct({
  choices: McpRegistryInputSchema.fields.choices,
  default: McpRegistryInputSchema.fields.default,
  description: McpRegistryInputSchema.fields.description,
  format: McpRegistryInputSchema.fields.format,
  isRequired: McpRegistryInputSchema.fields.isRequired,
  isSecret: McpRegistryInputSchema.fields.isSecret,
  placeholder: McpRegistryInputSchema.fields.placeholder,
});
export const mcpInputVariables = (
  input: McpRegistryInput,
): Readonly<Record<string, typeof VariableSchema.Type>> | undefined => {
  const result = Schema.decodeUnknownResult(Schema.Record(Schema.String, VariableSchema), {
    onExcessProperty: "error",
  })(input.variables ?? {});
  return result._tag === "Success" ? result.success : undefined;
};

type Target = McpBinding["target"];
export interface ManifestInput {
  readonly target: Target;
  readonly input: McpRegistryInput;
  readonly repeated: boolean;
  readonly name?: string;
}

/** Stable scoped paths, independent of manifest order. */
export const mcpInputId = (target: Target): string => {
  const parts: Array<string> = [target.kind];
  if ("name" in target) parts.push(target.name);
  else if (target.argument.type === "named") parts.push("named", target.argument.name);
  else if ("valueHint" in target.argument)
    parts.push("positional", "hint", target.argument.valueHint);
  else parts.push("positional", "value", (Hash.string(target.argument.value) >>> 0).toString(16));
  if (target.variable !== undefined) parts.push("variable", target.variable);
  return parts.map(encodeURIComponent).join("/");
};

const argumentInput = (
  kind: "runtime-argument" | "package-argument",
  argument: McpRegistryArgument,
): ManifestInput => ({
  target: {
    kind,
    argument:
      argument.type === "named"
        ? { type: "named", name: argument.name }
        : "valueHint" in argument
          ? { type: "positional", valueHint: argument.valueHint }
          : { type: "positional", value: argument.value },
  },
  input: argument,
  repeated: argument.isRepeated === true,
  ...(argument.type === "named" ? { name: argument.name } : {}),
});

/** No input from an unselected distribution is collected or interpreted. */
export const manifestInputs = (
  candidate: McpDistributionCandidate,
): ReadonlyArray<ManifestInput> =>
  candidate.kind === "package"
    ? [
        ...(candidate.package.runtimeArguments ?? []).map((argument) =>
          argumentInput("runtime-argument", argument),
        ),
        ...(candidate.package.packageArguments ?? []).map((argument) =>
          argumentInput("package-argument", argument),
        ),
        ...(candidate.package.environmentVariables ?? []).map((input): ManifestInput => ({
          target: { kind: "environment", name: input.name },
          input,
          repeated: false,
          name: input.name,
        })),
      ]
    : [
        ...Object.entries(candidate.remote.variables ?? {}).map(([name, input]): ManifestInput => ({
          target: { kind: "url-variable", name },
          input,
          repeated: false,
          name,
        })),
        ...(candidate.remote.headers ?? []).map((input): ManifestInput => ({
          target: { kind: "header", name: input.name },
          input,
          repeated: false,
          name: input.name,
        })),
      ];

export interface McpInputFinding {
  readonly code: string;
  readonly inputId: string;
  readonly message: string;
}
export interface ResolvedMcpInputs {
  readonly runtimeArguments: ReadonlyArray<McpValue>;
  readonly packageArguments: ReadonlyArray<McpValue>;
  readonly environment: Readonly<Record<string, McpValue>>;
  readonly headers: Readonly<Record<string, McpValue>>;
  readonly urlVariables: Readonly<Record<string, McpValue>>;
  readonly findings: ReadonlyArray<McpInputFinding>;
  readonly unverified: ReadonlyArray<string>;
}

/** Substitution is bounded by the owning input's declared variables. */
export const substituteMcpVariables = (
  template: string,
  variables: Readonly<Record<string, McpValue>>,
): McpValue => {
  const segments: Array<string | { readonly env: string }> = [];
  let start = 0;
  for (const match of template.matchAll(/\{([^{}]+)\}/gu)) {
    const key = match[1];
    const replacement = key === undefined ? undefined : variables[key];
    if (replacement === undefined) continue;
    if (match.index > start) segments.push(template.slice(start, match.index));
    if (typeof replacement === "string" || "env" in replacement) segments.push(replacement);
    else segments.push(...replacement.template);
    start = match.index + match[0].length;
  }
  if (start === 0) return template;
  if (start < template.length) segments.push(template.slice(start));
  const first = segments[0];
  return first === undefined ? "" : normalizeMcpValue({ template: [first, ...segments.slice(1)] });
};

export const resolveMcpInputs = (
  candidate: McpDistributionCandidate,
  bindings: ReadonlyArray<McpBinding>,
): ResolvedMcpInputs => {
  const inputs = manifestInputs(candidate);
  const findings: Array<McpInputFinding> = [];
  const unverified: Array<string> = [];
  const bindingsById = new Map<string, McpBinding>();
  const used = new Set<string>();
  const report = (code: string, id: string, message: string) => {
    findings.push({ code, inputId: id, message });
  };
  for (const binding of bindings) {
    const id = mcpInputId(binding.target);
    if (bindingsById.has(id)) report("duplicate-binding", id, "An input may be bound only once");
    bindingsById.set(id, binding);
  }
  const counts = new Map<string, number>();
  for (const { target } of inputs) {
    const id = mcpInputId(target);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const validate = (
    value: McpValue,
    input: McpRegistryInput,
    secret: boolean,
    id: string,
  ): McpValue | undefined => {
    const normalized = normalizeMcpValue(value);
    if (secret && !isSymbolicMcpCredential(normalized)) {
      report(
        "literal-secret",
        id,
        "Bind a native environment reference instead of storing a secret literal",
      );
      return undefined;
    }
    if (typeof normalized === "string") {
      if (input.choices !== undefined && !input.choices.includes(normalized))
        report("input-choice", id, "Input does not satisfy the declared choices");
      if (
        input.format === "number" &&
        (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(normalized) ||
          !Number.isFinite(Number(normalized)))
      )
        report("input-format", id, "Input must be a finite number");
      if ((input.isRequired === true || input.format === "filepath") && normalized.length === 0)
        report("input-empty", id, "Required inputs and file paths cannot be empty");
      if (input.format === "boolean" && normalized !== "true" && normalized !== "false")
        report("input-format", id, "Input must be true or false");
    } else unverified.push(id);
    return normalized;
  };
  const read = (
    target: Target,
    input: McpRegistryInput,
    secret: boolean,
    repeated: boolean,
  ): ReadonlyArray<McpValue> => {
    const id = mcpInputId(target);
    const binding = bindingsById.get(id);
    if (binding !== undefined) used.add(id);
    if (binding !== undefined && input.value !== undefined) {
      report(
        "immutable-input",
        id,
        "A fixed manifest value cannot be overridden; bind its declared variables instead",
      );
      return [];
    }
    if (binding !== undefined && "values" in binding && !repeated) {
      report("input-not-repeatable", id, "Multiple values require a repeatable argument");
      return [];
    }
    const values =
      binding !== undefined
        ? "values" in binding
          ? binding.values
          : [binding.value]
        : input.value !== undefined
          ? [input.value]
          : input.default !== undefined
            ? [input.default]
            : [];
    if (values.length === 0 && input.isRequired === true)
      report("missing-binding", id, "Required input has no binding or default");
    return values.flatMap((value) => {
      const checked = validate(value, input, secret, id);
      return checked === undefined ? [] : [checked];
    });
  };
  const runtimeArguments: Array<McpValue> = [];
  const packageArguments: Array<McpValue> = [];
  const environment: Record<string, McpValue> = {};
  const headers: Record<string, McpValue> = {};
  const urlVariables: Record<string, McpValue> = {};
  for (const descriptor of inputs) {
    const { target, input, repeated } = descriptor;
    const id = mcpInputId(target);
    if (
      target.kind === "url-variable" &&
      candidate.kind === "remote" &&
      !candidate.remote.url.includes(`{${target.name}}`)
    ) {
      if (bindingsById.has(id))
        report("unused-binding", id, "URL variable does not occur in the selected endpoint");
      continue;
    }
    if ((counts.get(id) ?? 0) > 1) {
      report("ambiguous-input", id, "Input locator matches multiple manifest inputs");
      continue;
    }
    const variableMetadata = mcpInputVariables(input);
    if (variableMetadata === undefined) {
      report(
        "unsupported-variable-metadata",
        id,
        "Declared variable metadata is malformed or unsupported",
      );
      continue;
    }
    const nested = Object.entries(variableMetadata);
    const secret =
      input.isSecret === true || ("name" in target && isMcpCredentialName(target.name));
    const sensitive = secret || nested.some(([, variable]) => variable.isSecret === true);
    if (
      sensitive &&
      (target.kind === "runtime-argument" ||
        target.kind === "package-argument" ||
        target.kind === "url-variable")
    ) {
      report(
        "secret-destination",
        id,
        "Secret inputs cannot be delivered through URLs or process arguments",
      );
      continue;
    }
    let values: ReadonlyArray<McpValue>;
    if (nested.length > 0 && input.value !== undefined) {
      if (bindingsById.has(id)) {
        used.add(id);
        report("immutable-input", id, "Bind declared variables instead of replacing a fixed value");
      }
      const variables = new Map<string, ReadonlyArray<McpValue>>();
      let count = 1;
      for (const [name, variable] of nested) {
        const variableTarget = { ...target, variable: name };
        const variableId = mcpInputId(variableTarget);
        if (!input.value.includes(`{${name}}`)) {
          if (bindingsById.has(variableId))
            report(
              "unused-binding",
              variableId,
              "Variable is not used by the declared input value",
            );
          continue;
        }
        const resolved = read(
          variableTarget,
          variable,
          secret || variable.isSecret === true,
          repeated,
        );
        variables.set(name, resolved);
        count = Math.max(count, resolved.length);
      }
      const substitutions: Array<McpValue> = [];
      if ([...variables.values()].every((resolved) => resolved.length > 0)) {
        for (let index = 0; index < count; index++) {
          const selected: Record<string, McpValue> = {};
          for (const [name, resolved] of variables) {
            const value = resolved.length === 1 ? resolved[0] : resolved[index];
            if (value === undefined)
              report(
                "repeated-input-length",
                id,
                "Repeated variable bindings must have equal lengths or one shared value",
              );
            else selected[name] = value;
          }
          const value = substituteMcpVariables(input.value, selected);
          const checked = validate(value, input, sensitive, id);
          if (checked !== undefined) substitutions.push(checked);
        }
      } else if (input.isRequired === true)
        report("missing-binding", id, "Required input has an unbound variable");
      values = substitutions;
    } else values = read(target, input, secret, repeated);
    if (target.kind === "url-variable" && values.length === 0)
      report(
        "missing-binding",
        id,
        "An endpoint variable cannot be omitted; supply a binding or default",
      );
    for (const value of values) {
      switch (target.kind) {
        case "runtime-argument":
          if (descriptor.name !== undefined) runtimeArguments.push(descriptor.name);
          runtimeArguments.push(value);
          break;
        case "package-argument":
          if (descriptor.name !== undefined) packageArguments.push(descriptor.name);
          packageArguments.push(value);
          break;
        case "environment":
          environment[target.name] = value;
          break;
        case "header":
          headers[target.name] = value;
          break;
        case "url-variable":
          urlVariables[target.name] = value;
          break;
      }
    }
  }
  for (const id of bindingsById.keys())
    if (!used.has(id))
      report(
        "unused-binding",
        id,
        "Binding does not resolve to a used input in the selected distribution",
      );
  return {
    runtimeArguments,
    packageArguments,
    environment,
    headers,
    urlVariables,
    findings,
    unverified,
  };
};
