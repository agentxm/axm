import { ParameterSchema, toParameterReference } from "./cli-parameters.js";
import * as JsonSchema from "effect/JsonSchema";
import * as Schema from "effect/Schema";
import type * as CliCommand from "effect/cli/Command";
import type * as GlobalFlag from "effect/cli/GlobalFlag";
import * as Param from "effect/cli/Param";

interface ConfigReference {
  readonly arguments: ReadonlyArray<Param.AnyArgument>;
  readonly flags: ReadonlyArray<Param.AnyFlag>;
}

interface RuntimeCommand extends CliCommand.Command.Any {
  readonly config: ConfigReference;
  readonly globalFlags?: ReadonlyArray<GlobalFlag.GlobalFlag<unknown>>;
}

export const CliReferenceExampleSchema = Schema.Struct({
  command: Schema.String,
  description: Schema.optionalKey(Schema.String),
});

export interface CliCommandReference {
  readonly name: string;
  readonly aliases: ReadonlyArray<string>;
  readonly description: string;
  readonly arguments: ReadonlyArray<typeof ParameterSchema.Type>;
  readonly options: ReadonlyArray<typeof ParameterSchema.Type>;
  readonly globalOptions: ReadonlyArray<typeof ParameterSchema.Type>;
  readonly examples: ReadonlyArray<typeof CliReferenceExampleSchema.Type>;
  readonly subcommands: ReadonlyArray<CliCommandReference>;
}

export const CliCommandReferenceSchema: Schema.Codec<CliCommandReference> = Schema.Struct({
  name: Schema.String,
  aliases: Schema.Array(Schema.String),
  description: Schema.String,
  arguments: Schema.Array(ParameterSchema),
  options: Schema.Array(ParameterSchema),
  globalOptions: Schema.Array(ParameterSchema),
  examples: Schema.Array(CliReferenceExampleSchema),
  subcommands: Schema.Array(Schema.suspend(() => CliCommandReferenceSchema)),
}).annotate({ identifier: "CliCommandReference" });

export const CliReferenceDocumentSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  cliVersion: Schema.String,
  command: CliCommandReferenceSchema,
});

export type CliReferenceDocument = typeof CliReferenceDocumentSchema.Type;

const hasRuntimeConfig = (command: CliCommand.Command.Any): command is RuntimeCommand => {
  if (!("config" in command)) return false;
  const config = command.config;
  if (typeof config !== "object" || config === null) return false;
  if (!("arguments" in config) || !Array.isArray(config.arguments)) return false;
  if (!("flags" in config) || !Array.isArray(config.flags)) return false;
  return true;
};

export const getRuntimeCommand = (command: CliCommand.Command.Any): RuntimeCommand => {
  if (!hasRuntimeConfig(command)) {
    throw new Error(`Command ${command.name} does not expose runtime config`);
  }
  return command;
};

/** The registered names of a command's own flags. */
export const commandFlagNames = (command: CliCommand.Command.Any): ReadonlyArray<string> =>
  getRuntimeCommand(command).config.flags.map((flag) => toParameterReference(flag).name);

const buildCommandReference = (command: CliCommand.Command.Any): CliCommandReference => {
  const runtimeCommand = getRuntimeCommand(command);
  return {
    name: command.name,
    aliases: command.alias === undefined ? [] : [command.alias],
    description: command.description ?? "",
    arguments: runtimeCommand.config.arguments.map(toParameterReference),
    options: runtimeCommand.config.flags.map(toParameterReference),
    globalOptions: (runtimeCommand.globalFlags ?? []).map((flag) =>
      toParameterReference(flag.flag),
    ),
    examples: command.examples.map((example) => ({
      command: example.command,
      ...(example.description === undefined ? {} : { description: example.description }),
    })),
    subcommands: command.subcommands.flatMap((group) => group.commands.map(buildCommandReference)),
  };
};

const collectReferenceProblems = (
  command: CliCommandReference,
  path: ReadonlyArray<string> = [],
): ReadonlyArray<string> => {
  const commandPath = [...path, command.name];
  const label = commandPath.join(" ");
  const problems = [
    ...(command.description.trim().length === 0 ? [`${label}: description`] : []),
    ...(command.examples.length === 0 ? [`${label}: example`] : []),
    ...[...command.options, ...command.globalOptions]
      .filter((option) => (option.description ?? "").trim().length === 0)
      .map((option) => `${label}: option:${option.name}:description`),
  ];
  return [
    ...problems,
    ...command.subcommands.flatMap((child) => collectReferenceProblems(child, commandPath)),
  ];
};

export const makeCliReferenceDocument = (
  rootCommand: CliCommand.Command.Any,
  cliVersion: string,
): CliReferenceDocument => {
  const document = {
    schemaVersion: 1,
    cliVersion,
    command: buildCommandReference(rootCommand),
  } as const;
  const problems = collectReferenceProblems(document.command);
  if (problems.length > 0) {
    throw new Error(`CLI reference metadata is incomplete:\n${problems.join("\n")}`);
  }
  return Schema.decodeUnknownSync(CliReferenceDocumentSchema, {
    onExcessProperty: "error",
  })(document);
};

export const makeCliReferenceJsonSchema = (): unknown => {
  const document = JsonSchema.toDocumentDraft07(
    Schema.toJsonSchemaDocument(CliReferenceDocumentSchema, {
      onExcessProperty: "error",
    }),
  );
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    ...document.schema,
    ...(Object.keys(document.definitions).length > 0 ? { definitions: document.definitions } : {}),
  };
};

export const flattenCliReference = (
  command: CliCommandReference,
  path: ReadonlyArray<string> = [],
): ReadonlyArray<ReadonlyArray<string>> => {
  const commandPath = [...path, command.name];
  return [
    commandPath,
    ...command.subcommands.flatMap((child) => flattenCliReference(child, commandPath)),
  ];
};
