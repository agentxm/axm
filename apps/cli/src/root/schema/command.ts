import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/cli";

import { HELP_TOPICS } from "../../__generated__/help-topics.js";
import { makeAppError } from "../../app-error/index.js";
import { quietFlag } from "../../cli-flags/index.js";
import { withParameterDescription } from "../../cli-parameters.js";
import {
  resolveCliFormat,
  withArgvTracking,
  withCommandFailureReport,
} from "../../cli-runtime/index.js";
import { OutputContractSummarySchema } from "../../output-discovery.js";
import { MACHINE_OUTPUT_CONTRACT_ROWS } from "../../machine-output-contracts.js";
import {
  Screen,
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports -- Passive schema discovery owns its pre-runtime Screen.
  InteractiveScreen,
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports -- Passive schema discovery owns its pre-runtime Screen.
  MachineScreen,
  rawDoc,
  resolveCliOutputPolicy,
} from "../../screen/index.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import {
  declaredFields,
  describeSchema,
  lookupField,
  schemaObject,
  standaloneSchema,
  type SchemaObject,
  type SchemaNode,
} from "./json-schema.js";

let bundledDocument: SchemaObject | undefined;
const bundledSchemas = (): SchemaObject => {
  bundledDocument ??= Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
  )(HELP_TOPICS["machine-output-schema"]);
  return bundledDocument;
};

const schemaConfig = {
  path: Argument.String("command-path").pipe(
    withParameterDescription("Command path to explain, such as publish or skills show"),
    Argument.variadic(),
  ),
  field: Flag.String("field").pipe(
    withParameterDescription(
      "Declared stdout field path; use dotted names and [] for array elements",
    ),
    Flag.optional,
  ),
};

const schemaRendererLayer = Layer.unwrap(
  Effect.gen(function* () {
    const format = yield* resolveCliFormat;
    const quiet = yield* quietFlag;
    const outputPolicy = resolveCliOutputPolicy({ quiet });
    return format === "json"
      ? MachineScreen({ quiet: outputPolicy.quiet })
      : InteractiveScreen({ outputPolicy });
  }),
);

const schemaInvocation = (path: string): string =>
  `axm schema${path === "axm" ? "" : ` ${path.slice(4)}`}`;
const boundedLines = (lines: ReadonlyArray<string>, bytes: number): string => {
  let text = "";
  for (const line of lines) {
    if (new TextEncoder().encode(`${text}${line}\n`).length > bytes - 160) {
      return `${text}Further alternatives are available with --json.\n`;
    }
    text += `${line}\n`;
  }
  return text;
};

/** This handler only reads bundled definitions and the command-output register. */
export const handleSchemaPath = (
  path: ReadonlyArray<string>,
  field: string | undefined,
  json: boolean,
) =>
  Effect.gen(function* () {
    const command = ["axm", ...(path[0] === "axm" ? path.slice(1) : path)].join(" ");
    const row = MACHINE_OUTPUT_CONTRACT_ROWS.find((candidate) => candidate.path === command);
    if (row === undefined) {
      const segments = command.split(" ");
      let nearby = MACHINE_OUTPUT_CONTRACT_ROWS.slice(0, 6);
      for (let length = segments.length - 1; length > 0; length--) {
        const prefix = segments.slice(0, length).join(" ");
        const candidates = MACHINE_OUTPUT_CONTRACT_ROWS.filter(
          (candidate) => candidate.path === prefix || candidate.path.startsWith(`${prefix} `),
        );
        if (candidates.length > 0) {
          nearby = candidates.slice(0, 6);
          break;
        }
      }
      return yield* Effect.fail(
        makeAppError({
          code: "not_found",
          detail: `Unknown command path '${command}'. Schema discovery takes command names without target arguments.`,
          suggestions: nearby.map((candidate) => ({
            description: `Inspect ${candidate.path}`,
            cmd: schemaInvocation(candidate.path),
          })),
        }),
      );
    }
    const family = row.family;
    const document = bundledSchemas();
    const contract = Schema.decodeUnknownSync(OutputContractSummarySchema)(
      schemaObject(document["x-axm-command-contracts"])[command],
    );
    const heading = [
      `Command: ${command}`,
      `Output: ${family.outputClass}`,
      `Modes: ${contract.modes.length === 0 ? "formatter-owned" : contract.modes.join(", ")}`,
      `Effects: ${contract.effects}`,
      `Meaning: ${family.rationale}`,
    ];
    if (family.outputClass === "json-refused" || family.outputClass === "external-document") {
      const detail =
        family.outputClass === "json-refused"
          ? `${command} has a plain-only credential contract (--plain); no ordinary JSON result schema is available.`
          : `${command} writes ${family.externalSchema}. Its external schema is not bundled; discovery never fetches it from the network.`;
      if (json || field !== undefined)
        return yield* Effect.fail(makeAppError({ code: "usage", detail }));
      yield* (yield* Screen).result(rawDoc(boundedLines([...heading, detail], 8192)));
      return;
    }
    const routes = schemaObject(document["x-axm-routes"]);
    const root = schemaObject(routes[command]);
    let selected: SchemaNode = root;
    let fieldLines: ReadonlyArray<string> = [];
    let fieldMetadata: SchemaObject = {};
    if (field !== undefined) {
      if (!/^[\w$-]+(?:\[\])*(?:\.[\w$-]+(?:\[\])*)*$/u.test(field))
        return yield* Effect.fail(
          makeAppError({
            code: "usage",
            detail:
              "Field paths use declared dotted property names and [] for array elements, for example result.items[].name.",
          }),
        );
      const found = lookupField(root, document, field);
      if (found.alternatives.length === 0)
        return yield* Effect.fail(
          makeAppError({
            code: "not_found",
            detail: `Unknown declared stdout field '${field}' for ${command}.${found.nearby.length === 0 ? "" : ` Nearby fields: ${found.nearby.join(", ")}.`}`,
            suggestions: found.nearby.slice(0, 5).map((nearby) => ({
              description: `Explain ${nearby}`,
              cmd: `${schemaInvocation(command)} --field '${nearby}'`,
            })),
          }),
        );
      selected = { anyOf: found.alternatives.map((alternative) => alternative.schema) };
      fieldMetadata = {
        "x-axm-field": field,
        "x-axm-alternatives": found.alternatives.map((alternative) => ({
          required: alternative.required,
          when: alternative.conditions,
        })),
      };
      fieldLines = [
        `Field: ${field}`,
        ...found.alternatives.flatMap((alternative, index) => [
          `Alternative ${index + 1}: ${alternative.required ? "required when this alternative applies" : "optional"}; ${describeSchema(alternative.schema, document)}`,
          ...(alternative.conditions.length === 0
            ? []
            : [`  When: ${alternative.conditions.join("; ")}`]),
        ]),
      ];
    }
    if (json) {
      const output = standaloneSchema(document, selected, {
        "x-axm-command": command,
        "x-axm-validates": field === undefined ? "stdout" : "field-value",
        ...fieldMetadata,
      });
      yield* (yield* Screen).result(rawDoc(`${JSON.stringify(output)}\n`));
      return;
    }
    const fields = declaredFields(selected, document);
    const lines =
      field === undefined
        ? [
            ...heading,
            ...(family.outputClass === "structured-result"
              ? [
                  "Verdict: ok agrees with process success; outcome describes the operation, while result retains subject health and coverage.",
                ]
              : []),
            "Stdout alternatives include formatter help/version and typed errors.",
            `Result fields: ${
              declaredFields(
                lookupField(root, document, "result").alternatives[0]?.schema ?? false,
                document,
              )
                .slice(0, 24)
                .join(", ") || "see stdout alternatives"
            }`,
            "Fields:",
            ...fields.slice(0, 24).map((name) => {
              const alternatives = lookupField(selected, document, name).alternatives;
              return `  ${name}: ${[...new Set(alternatives.map((entry) => describeSchema(entry.schema, document)))].join(" | ")}`;
            }),
            ...(fields.length > 24
              ? [`  ${fields.length - 24} more fields are available with --json.`]
              : []),
          ]
        : [
            `Command: ${command}`,
            ...fieldLines,
            ...(fields.length === 0
              ? []
              : [`Declared child fields: ${fields.slice(0, 24).join(", ")}`]),
          ];
    const footer = [
      `Explore: ${schemaInvocation(command)} --field '${field === undefined ? "result" : `${field}.<field>`}'`,
      `Export: ${schemaInvocation(command)}${field === undefined ? "" : ` --field '${field}'`} --json`,
      "",
    ].join("\n");
    yield* (yield* Screen).result(
      rawDoc(
        `${boundedLines(lines, (field === undefined ? 8192 : 4096) - new TextEncoder().encode(footer).length)}${footer}`,
      ),
    );
  });

export const schemaCommand = Command.make("schema", schemaConfig, ({ path, field }) =>
  Effect.gen(function* () {
    const format = yield* resolveCliFormat;
    yield* handleSchemaPath(path, Option.getOrUndefined(field), format === "json");
  }).pipe(withCommandFailureReport("schema")),
).pipe(
  Command.provide(schemaRendererLayer),
  withArgvTracking(schemaConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription(
    "Explain a command's complete stdout contract offline, or export its standalone JSON Schema",
  ),
  Command.withShortDescription("Explain command output contracts"),
  Command.withExamples([
    { command: "axm schema publish", description: "Explain publication outcomes and fields" },
    {
      command: "axm schema publish --field 'result.execution.outcomes[].status'",
      description: "Explain a declared result field",
    },
    { command: "axm schema skills show --json", description: "Export a complete stdout schema" },
  ]),
);
