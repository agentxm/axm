import type { ParameterRecord } from "../cli-parameters.js";
import * as ServiceMap from "effect/Context";
import {
  ParameterSchema,
  ParameterRecordsAnnotation,
  toParameterReference,
} from "../cli-parameters.js";
import { axmGlobalFlags } from "../cli-flags/index.js";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { FlagDoc, HelpDoc } from "effect/cli/HelpDoc";

export type JsonFlagDoc = ParameterRecord;
export type JsonArgDoc = ParameterRecord;

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

export const JsonFlagDocSchema = ParameterSchema;
export const JsonArgDocSchema = ParameterSchema;

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

/** What the formatter writes to Effect CLI's console: one built-in document. */
export const FormatterDocumentSchema = Schema.Union([JsonHelpDocSchema, JsonVersionDocSchema]);
export type FormatterDocument = typeof FormatterDocumentSchema.Type;

/**
 * Reads a formatter document back from the console text Effect CLI wrote.
 * `None` is console text that is not a formatter document.
 */
export const decodeFormatterDocument: (text: string) => Option.Option<FormatterDocument> =
  Schema.decodeUnknownOption(Schema.fromJsonString(FormatterDocumentSchema));

export const toJsonFlagDoc = (flag: FlagDoc): JsonFlagDoc => ({
  name: flag.name,
  aliases: flag.aliases,
  type: flag.type,
  required: flag.required,
  ...(Option.isSome(flag.description) ? { description: flag.description.value } : {}),
});

export const toJsonHelpDoc = (
  doc: HelpDoc,
  options?: { readonly learnMore?: string | undefined },
): JsonHelpDoc => {
  const records = ServiceMap.get(doc.annotations, ParameterRecordsAnnotation);
  const globalRecords = axmGlobalFlags.map(({ flag }) => toParameterReference(flag));
  const flagRecord = (flag: FlagDoc): ParameterRecord =>
    records.find((row) => row.kind === "flag" && row.parameter.name === flag.name)?.parameter ??
    toJsonFlagDoc(flag);
  const args = doc.args?.map(
    (arg): ParameterRecord =>
      records.find((row) => row.kind === "argument" && row.parameter.name === arg.name)
        ?.parameter ?? {
        name: arg.name,
        aliases: [],
        type: arg.type,
        required: arg.required,
        ...(Option.isSome(arg.description) ? { description: arg.description.value } : {}),
        ...(arg.variadic ? { variadic: { min: arg.required ? 1 : 0 } } : {}),
      },
  );
  const path = doc.usage.replace(/\s*[[<].*$/u, "").trim();
  const usage =
    doc.subcommands !== undefined && doc.subcommands.some((group) => group.commands.length > 0)
      ? `${path} <${path === "axm" ? "command" : "subcommand"}> [flags]`
      : `${path} [flags]${(args ?? [])
          .map((arg) => {
            const name = `<${arg.name}>${arg.variadic === undefined ? "" : "..."}`;
            return ` ${arg.required ? name : `[${name}]`}`;
          })
          .join("")}`;
  return {
    type: "help",
    description: doc.description,
    usage,
    flags: doc.flags.map(flagRecord),
    globalFlags: doc.globalFlags?.map(
      (flag) => globalRecords.find((record) => record.name === flag.name) ?? toJsonFlagDoc(flag),
    ),
    args,
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
  };
};
