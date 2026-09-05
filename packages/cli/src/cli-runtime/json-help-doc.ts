import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { FlagDoc, HelpDoc } from "effect/unstable/cli/HelpDoc";

export interface JsonFlagDoc {
  readonly name: string;
  readonly aliases: ReadonlyArray<string>;
  readonly type: string;
  readonly required: boolean;
  readonly description?: string | undefined;
}

export interface JsonArgDoc {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly variadic: boolean;
  readonly description?: string | undefined;
}

export interface JsonSubcommandDoc {
  readonly name: string;
  readonly alias?: string | undefined;
  readonly shortDescription?: string | undefined;
  readonly description?: string | undefined;
}

export interface JsonSubcommandGroupDoc {
  readonly group?: string | undefined;
  readonly commands: ReadonlyArray<JsonSubcommandDoc>;
}

export interface JsonExampleDoc {
  readonly command: string;
  readonly description?: string | undefined;
}

export interface JsonHelpDoc {
  readonly type: "help";
  readonly description: string;
  readonly usage: string;
  readonly flags: ReadonlyArray<JsonFlagDoc>;
  readonly globalFlags?: ReadonlyArray<JsonFlagDoc> | undefined;
  readonly args?: ReadonlyArray<JsonArgDoc> | undefined;
  readonly subcommands?: ReadonlyArray<JsonSubcommandGroupDoc> | undefined;
  readonly examples?: ReadonlyArray<JsonExampleDoc> | undefined;
  readonly learnMore?: string | undefined;
}

export const JsonFlagDocSchema = Schema.Struct({
  name: Schema.String,
  aliases: Schema.Array(Schema.String),
  type: Schema.String,
  required: Schema.Boolean,
  description: Schema.optional(Schema.String),
});

export const JsonArgDocSchema = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  required: Schema.Boolean,
  variadic: Schema.Boolean,
  description: Schema.optional(Schema.String),
});

export const JsonSubcommandDocSchema = Schema.Struct({
  name: Schema.String,
  alias: Schema.optional(Schema.String),
  shortDescription: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
});

export const JsonSubcommandGroupDocSchema = Schema.Struct({
  group: Schema.optional(Schema.String),
  commands: Schema.Array(JsonSubcommandDocSchema),
});

export const JsonExampleDocSchema = Schema.Struct({
  command: Schema.String,
  description: Schema.optional(Schema.String),
});

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

export const JsonVersionDocSchema = Schema.Struct({
  type: Schema.Literal("version"),
  name: Schema.String,
  version: Schema.String,
});

export type JsonVersionDoc = typeof JsonVersionDocSchema.Type;

export const isSubcommandDoc = (doc: HelpDoc): boolean => {
  const beforeBrackets = doc.usage.replace(/\s*[[<].*$/, "").trim();
  const tokens = beforeBrackets.split(/\s+/).filter((token) => token.length > 0);
  return tokens.length > 1;
};

export const toJsonFlagDoc = (flag: FlagDoc): JsonFlagDoc => ({
  name: flag.name,
  aliases: flag.aliases,
  type: flag.type,
  required: flag.required,
  description: Option.getOrUndefined(flag.description),
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
  args: doc.args?.map((arg) => ({
    name: arg.name,
    type: arg.type,
    required: arg.required,
    variadic: arg.variadic,
    description: Option.getOrUndefined(arg.description),
  })),
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
