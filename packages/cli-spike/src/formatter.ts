import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { FlagDoc, HelpDoc } from "effect/unstable/cli/HelpDoc";
import { CliOutput } from "effect/unstable/cli";

import { JsonSchemaVersion, JsonSchemaVersionSchema } from "@axm.sh/core/unstable/cli-runtime";

const isSubcommandDoc = (doc: HelpDoc): boolean => {
  const beforeBrackets = doc.usage.replace(/\s*[[<].*$/, "").trim();
  const tokens = beforeBrackets.split(/\s+/).filter((token) => token.length > 0);
  return tokens.length > 1;
};

const getVisibleGlobalFlags = (doc: HelpDoc): HelpDoc["globalFlags"] => {
  if (!isSubcommandDoc(doc)) {
    return doc.globalFlags;
  }

  const globalFlags = doc.globalFlags?.filter((flag) => flag.name === "json");
  return globalFlags !== undefined && globalFlags.length > 0 ? globalFlags : undefined;
};

const getAdjustedHelpDoc = (doc: HelpDoc): HelpDoc => {
  if (!isSubcommandDoc(doc)) {
    return doc;
  }

  const visibleGlobalFlags = getVisibleGlobalFlags(doc);
  const { globalFlags: _globalFlags, ...rest } = doc;
  return visibleGlobalFlags === undefined ? rest : { ...rest, globalFlags: visibleGlobalFlags };
};

type JsonFlagDoc = {
  readonly name: string;
  readonly aliases: ReadonlyArray<string>;
  readonly type: string;
  readonly required: boolean;
  readonly description?: string | undefined;
};

type JsonArgDoc = {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly variadic: boolean;
  readonly description?: string | undefined;
};

type JsonSubcommandDoc = {
  readonly name: string;
  readonly alias?: string | undefined;
  readonly shortDescription?: string | undefined;
  readonly description?: string | undefined;
};

type JsonSubcommandGroupDoc = {
  readonly group?: string | undefined;
  readonly commands: ReadonlyArray<JsonSubcommandDoc>;
};

type JsonExampleDoc = {
  readonly command: string;
  readonly description?: string | undefined;
};

export type JsonHelpDoc = {
  readonly _version: typeof JsonSchemaVersion;
  readonly type: "help";
  readonly description: string;
  readonly usage: string;
  readonly flags: ReadonlyArray<JsonFlagDoc>;
  readonly globalFlags?: ReadonlyArray<JsonFlagDoc> | undefined;
  readonly args?: ReadonlyArray<JsonArgDoc> | undefined;
  readonly subcommands?: ReadonlyArray<JsonSubcommandGroupDoc> | undefined;
  readonly examples?: ReadonlyArray<JsonExampleDoc> | undefined;
};

const JsonFlagDocSchema = Schema.Struct({
  name: Schema.String,
  aliases: Schema.Array(Schema.String),
  type: Schema.String,
  required: Schema.Boolean,
  description: Schema.optional(Schema.String),
});

const JsonArgDocSchema = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  required: Schema.Boolean,
  variadic: Schema.Boolean,
  description: Schema.optional(Schema.String),
});

const JsonSubcommandDocSchema = Schema.Struct({
  name: Schema.String,
  alias: Schema.optional(Schema.String),
  shortDescription: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
});

const JsonSubcommandGroupDocSchema = Schema.Struct({
  group: Schema.optional(Schema.String),
  commands: Schema.Array(JsonSubcommandDocSchema),
});

const JsonExampleDocSchema = Schema.Struct({
  command: Schema.String,
  description: Schema.optional(Schema.String),
});

export const JsonHelpDocSchema = Schema.Struct({
  _version: JsonSchemaVersionSchema,
  type: Schema.Literal("help"),
  description: Schema.String,
  usage: Schema.String,
  flags: Schema.Array(JsonFlagDocSchema),
  globalFlags: Schema.optional(Schema.Array(JsonFlagDocSchema)),
  args: Schema.optional(Schema.Array(JsonArgDocSchema)),
  subcommands: Schema.optional(Schema.Array(JsonSubcommandGroupDocSchema)),
  examples: Schema.optional(Schema.Array(JsonExampleDocSchema)),
});

export const JsonVersionDocSchema = Schema.Struct({
  _version: JsonSchemaVersionSchema,
  type: Schema.Literal("version"),
  name: Schema.String,
  version: Schema.String,
});

export type JsonVersionDoc = typeof JsonVersionDocSchema.Type;

const toJsonFlagDoc = (flag: FlagDoc): JsonFlagDoc => ({
  name: flag.name,
  aliases: flag.aliases,
  type: flag.type,
  required: flag.required,
  description: Option.getOrUndefined(flag.description),
});

const toJsonHelpDoc = (doc: HelpDoc): JsonHelpDoc => {
  const adjusted = getAdjustedHelpDoc(doc);

  return {
    _version: JsonSchemaVersion,
    type: "help",
    description: adjusted.description,
    usage: adjusted.usage,
    flags: adjusted.flags.map(toJsonFlagDoc),
    globalFlags: adjusted.globalFlags?.map(toJsonFlagDoc),
    args: adjusted.args?.map((arg) => ({
      name: arg.name,
      type: arg.type,
      required: arg.required,
      variadic: arg.variadic,
      description: Option.getOrUndefined(arg.description),
    })),
    subcommands: adjusted.subcommands?.map((group) => ({
      group: group.group,
      commands: group.commands.map((command) => ({
        name: command.name,
        alias: command.alias,
        shortDescription: command.shortDescription,
        description: command.description,
      })),
    })),
    examples: adjusted.examples?.map((example) => ({
      command: example.command,
      description: example.description,
    })),
  };
};

export const makeSpikeFormatter = (options?: {
  readonly json?: boolean | undefined;
}): CliOutput.Formatter => {
  const base = CliOutput.defaultFormatter();
  const json = options?.json === true;

  return {
    ...base,

    formatHelpDoc: (doc: HelpDoc): string =>
      json
        ? JSON.stringify(Schema.encodeSync(JsonHelpDocSchema)(toJsonHelpDoc(doc)), null, 2)
        : base.formatHelpDoc(getAdjustedHelpDoc(doc)),

    formatVersion: (name: string, version: string): string =>
      json
        ? JSON.stringify(
            Schema.encodeSync(JsonVersionDocSchema)({
              _version: JsonSchemaVersion,
              type: "version",
              name,
              version,
            }),
            null,
            2,
          )
        : version,

    formatErrors: (errors) => base.formatErrors(errors),
  };
};
