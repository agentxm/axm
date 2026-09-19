import * as JsonSchema from "effect/JsonSchema";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as CliCommand from "effect/unstable/cli/Command";
import type * as GlobalFlag from "effect/unstable/cli/GlobalFlag";
import * as Param from "effect/unstable/cli/Param";
import * as Primitive from "effect/unstable/cli/Primitive";

interface ConfigReference {
  readonly arguments: ReadonlyArray<Param.AnyArgument>;
  readonly flags: ReadonlyArray<Param.AnyFlag>;
}

interface RuntimeCommand extends CliCommand.Command.Any {
  readonly config: ConfigReference;
  readonly globalFlags?: ReadonlyArray<GlobalFlag.GlobalFlag<unknown>>;
}

interface WalkedParam {
  readonly single: Param.Single<Param.ParamKind, unknown>;
  readonly optional: boolean;
  readonly variadic?: {
    readonly min?: number;
    readonly max?: number;
  };
}

export const CliReferenceChoiceSchema = Schema.Struct({
  value: Schema.String,
});

export const CliReferenceVariadicSchema = Schema.Struct({
  min: Schema.optionalKey(Schema.Int),
  max: Schema.optionalKey(Schema.Int),
});

export const CliReferenceParameterSchema = Schema.Struct({
  name: Schema.String,
  aliases: Schema.Array(Schema.String),
  type: Schema.String,
  required: Schema.Boolean,
  description: Schema.optionalKey(Schema.String),
  valueName: Schema.optionalKey(Schema.String),
  variadic: Schema.optionalKey(CliReferenceVariadicSchema),
  choices: Schema.optionalKey(Schema.Array(CliReferenceChoiceSchema)),
});

export const CliReferenceExampleSchema = Schema.Struct({
  command: Schema.String,
  description: Schema.optionalKey(Schema.String),
});

export interface CliCommandReference {
  readonly name: string;
  readonly aliases: ReadonlyArray<string>;
  readonly description: string;
  readonly arguments: ReadonlyArray<typeof CliReferenceParameterSchema.Type>;
  readonly options: ReadonlyArray<typeof CliReferenceParameterSchema.Type>;
  readonly globalOptions: ReadonlyArray<typeof CliReferenceParameterSchema.Type>;
  readonly examples: ReadonlyArray<typeof CliReferenceExampleSchema.Type>;
  readonly subcommands: ReadonlyArray<CliCommandReference>;
}

export const CliCommandReferenceSchema: Schema.Codec<CliCommandReference> = Schema.Struct({
  name: Schema.String,
  aliases: Schema.Array(Schema.String),
  description: Schema.String,
  arguments: Schema.Array(CliReferenceParameterSchema),
  options: Schema.Array(CliReferenceParameterSchema),
  globalOptions: Schema.Array(CliReferenceParameterSchema),
  examples: Schema.Array(CliReferenceExampleSchema),
  subcommands: Schema.Array(Schema.suspend(() => CliCommandReferenceSchema)),
}).annotate({ identifier: "CliCommandReference" });

export const CliReferenceDocumentSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  cliVersion: Schema.String,
  command: CliCommandReferenceSchema,
});

export type CliReferenceDocument = typeof CliReferenceDocumentSchema.Type;

const optionToUndefined = <A>(value: Option.Option<A>): A | undefined =>
  Option.getOrUndefined(value);

const decodeChoiceKeys = Schema.decodeUnknownOption(Schema.Array(Schema.String));

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

const isSingleParam = (param: Param.Any): param is Param.Single<Param.ParamKind, unknown> =>
  param._tag === "Single" &&
  "name" in param &&
  typeof param.name === "string" &&
  "aliases" in param &&
  Array.isArray(param.aliases) &&
  "primitiveType" in param;

const isMappedParam = (
  param: Param.Any,
): param is
  | Param.Map<Param.ParamKind, unknown, unknown>
  | Param.Transform<Param.ParamKind, unknown, unknown> =>
  (param._tag === "Map" || param._tag === "Transform") && "param" in param;

const isOptionalParam = (param: Param.Any): param is Param.Optional<Param.ParamKind, unknown> =>
  param._tag === "Optional" && "param" in param;

const isVariadicParam = (param: Param.Any): param is Param.Variadic<Param.ParamKind, unknown> =>
  param._tag === "Variadic" && "param" in param && "min" in param && "max" in param;

const walkParam = (param: Param.Any): WalkedParam => {
  if (isSingleParam(param)) return { single: param, optional: false };
  if (isMappedParam(param)) return walkParam(param.param);
  if (isOptionalParam(param)) {
    const walked = walkParam(param.param);
    return { ...walked, optional: true };
  }
  if (isVariadicParam(param)) {
    const walked = walkParam(param.param);
    const min = optionToUndefined(param.min);
    const max = optionToUndefined(param.max);
    return {
      ...walked,
      variadic: {
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      },
    };
  }
  throw new Error(`Unsupported CLI parameter node: ${param._tag}`);
};

const getChoiceKeys = (
  primitive: Primitive.Primitive<unknown>,
): ReadonlyArray<string> | undefined => {
  if (primitive._tag !== "Choice" || !("choiceKeys" in primitive)) return undefined;
  return Option.getOrUndefined(decodeChoiceKeys(primitive.choiceKeys));
};

const isRequired = (walked: WalkedParam): boolean => {
  if (
    walked.single.kind === "flag" &&
    Primitive.getTypeName(walked.single.primitiveType) === "boolean"
  ) {
    return false;
  }
  if (walked.optional) return false;
  return walked.variadic === undefined ? true : (walked.variadic.min ?? 0) > 0;
};

const formatAlias = (alias: string): string => (alias.length === 1 ? `-${alias}` : `--${alias}`);

const toParameterReference = (param: Param.Any): typeof CliReferenceParameterSchema.Type => {
  const walked = walkParam(param);
  const single = walked.single;
  const description = optionToUndefined(single.description);
  const valueName = single.typeName;
  const choices = getChoiceKeys(single.primitiveType)?.map((value) => ({ value }));
  return {
    name: single.name,
    aliases: single.aliases.map(formatAlias),
    type: Primitive.getTypeName(single.primitiveType),
    required: isRequired(walked),
    ...(description === undefined ? {} : { description }),
    ...(valueName === undefined ? {} : { valueName }),
    ...(walked.variadic === undefined ? {} : { variadic: walked.variadic }),
    ...(choices === undefined ? {} : { choices }),
  };
};

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
