import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { FlagDoc, HelpDoc } from "effect/unstable/cli/HelpDoc";

type ArgDoc = NonNullable<HelpDoc["args"]>[number];

export const JsonFlagDocSchema = Schema.Struct({
  name: Schema.String,
  aliases: Schema.Array(Schema.String),
  type: Schema.String,
  required: Schema.Boolean,
  description: Schema.optional(Schema.String),
});

export type JsonFlagDoc = Schema.Schema.Type<typeof JsonFlagDocSchema>;

export const JsonArgDocSchema = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  required: Schema.Boolean,
  variadic: Schema.Boolean,
  description: Schema.optional(Schema.String),
});

export type JsonArgDoc = Schema.Schema.Type<typeof JsonArgDocSchema>;

export const JsonSubcommandDocSchema = Schema.Struct({
  name: Schema.String,
  alias: Schema.optional(Schema.String),
  shortDescription: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
});

export type JsonSubcommandDoc = Schema.Schema.Type<typeof JsonSubcommandDocSchema>;

export const JsonSubcommandGroupDocSchema = Schema.Struct({
  group: Schema.optional(Schema.String),
  commands: Schema.Array(JsonSubcommandDocSchema),
});

export type JsonSubcommandGroupDoc = Schema.Schema.Type<typeof JsonSubcommandGroupDocSchema>;

export const JsonExampleDocSchema = Schema.Struct({
  command: Schema.String,
  description: Schema.optional(Schema.String),
});

export type JsonExampleDoc = Schema.Schema.Type<typeof JsonExampleDocSchema>;

export const JsonHelpDocSchema = Schema.Struct({
  type: Schema.Literal("help"),
  description: Schema.String,
  usage: Schema.String,
  flags: Schema.Array(JsonFlagDocSchema),
  globalFlags: Schema.optional(Schema.Array(JsonFlagDocSchema)),
  args: Schema.optional(Schema.Array(JsonArgDocSchema)),
  subcommands: Schema.optional(Schema.Array(JsonSubcommandGroupDocSchema)),
  examples: Schema.optional(Schema.Array(JsonExampleDocSchema)),
  learnMore: Schema.optional(Schema.String),
});

export type JsonHelpDoc = Schema.Schema.Type<typeof JsonHelpDocSchema>;

export const JsonVersionDocSchema = Schema.Struct({
  type: Schema.Literal("version"),
  name: Schema.String,
  version: Schema.String,
});

export type JsonVersionDoc = Schema.Schema.Type<typeof JsonVersionDocSchema>;

export const toJsonFlagDoc = (flag: FlagDoc): JsonFlagDoc => ({
  name: flag.name,
  aliases: flag.aliases,
  type: flag.type,
  required: flag.required,
  description: Option.getOrUndefined(flag.description),
});

const toJsonArgDoc = (arg: ArgDoc): JsonArgDoc => ({
  name: arg.name,
  type: arg.type,
  required: arg.required,
  variadic: arg.variadic,
  description: Option.getOrUndefined(arg.description),
});

export const toJsonHelpDoc = (
  doc: HelpDoc,
  options?: { readonly learnMore?: string | undefined },
): JsonHelpDoc => ({
  type: "help",
  description: doc.description,
  usage: doc.usage,
  flags: doc.flags.map(toJsonFlagDoc),
  globalFlags: doc.globalFlags?.map(toJsonFlagDoc),
  args: doc.args?.map(toJsonArgDoc),
  subcommands: doc.subcommands?.map((group) => ({
    group: group.group,
    commands: group.commands.map((command) => ({
      name: command.name,
      alias: command.alias,
      shortDescription: command.shortDescription,
      description: command.description,
    })),
  })),
  examples: doc.examples?.map((example) => ({
    command: example.command,
    description: example.description,
  })),
  ...(options?.learnMore !== undefined && options.learnMore !== ""
    ? { learnMore: options.learnMore }
    : {}),
});

export const makeJsonVersionDoc = (name: string, version: string): JsonVersionDoc => ({
  type: "version",
  name,
  version,
});
