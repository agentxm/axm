/**
 * Custom CLI output formatter that suppresses global flags on subcommand help
 * and appends a "learn more" footer from command annotations.
 */

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import type { FlagDoc, HelpDoc } from "effect/unstable/cli/HelpDoc";
import { CliOutput } from "effect/unstable/cli";

import {
  JsonSchemaVersion,
  JsonSchemaVersionSchema,
} from "@agentxm/client-core/unstable/cli-runtime";

import { BRANDING } from "@agentxm/client-core/unstable/branding";

/**
 * Annotation key for "learn more" footer text.
 * Attach to commands via `Command.annotate(LearnMore, "...")`.
 */
export const LearnMore: ServiceMap.Reference<string> = ServiceMap.Reference("axm/learn-more", {
  defaultValue: () => "",
});

/**
 * Determines whether a HelpDoc represents a subcommand (as opposed to the
 * root command) by counting the command tokens in the usage string that
 * precede any bracketed placeholder like `[flags]` or `<subcommand>`.
 *
 * Root usage: `"axm <subcommand> [flags]"` => 1 token ("axm")
 * Subcommand: `"axm skills install [flags]"` => 3 tokens
 */
const isSubcommandDoc = (doc: HelpDoc): boolean => {
  const beforeBrackets = doc.usage.replace(/\s*[[<].*$/, "").trim();
  const tokens = beforeBrackets.split(/\s+/).filter((t) => t.length > 0);
  return tokens.length > 1;
};

const getVisibleGlobalFlags = (doc: HelpDoc): HelpDoc["globalFlags"] => {
  if (!isSubcommandDoc(doc)) {
    return doc.globalFlags;
  }

  const globalFlags = doc.globalFlags?.filter((flag) => flag.name === "json");
  return globalFlags !== undefined && globalFlags.length > 0 ? globalFlags : undefined;
};

const getLearnMore = (doc: HelpDoc): string =>
  ServiceMap.getReferenceUnsafe(doc.annotations, LearnMore);

const getAdjustedHelpDoc = (doc: HelpDoc): HelpDoc => {
  if (!isSubcommandDoc(doc)) return doc;

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

type JsonHelpDoc = {
  readonly _version: typeof JsonSchemaVersion;
  readonly type: "help";
  readonly description: string;
  readonly usage: string;
  readonly flags: ReadonlyArray<JsonFlagDoc>;
  readonly globalFlags?: ReadonlyArray<JsonFlagDoc> | undefined;
  readonly args?: ReadonlyArray<JsonArgDoc> | undefined;
  readonly subcommands?: ReadonlyArray<JsonSubcommandGroupDoc> | undefined;
  readonly examples?: ReadonlyArray<JsonExampleDoc> | undefined;
  readonly learnMore?: string | undefined;
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

const JsonHelpDocSchema = Schema.Struct({
  _version: JsonSchemaVersionSchema,
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

const JsonVersionDocSchema = Schema.Struct({
  _version: JsonSchemaVersionSchema,
  type: Schema.Literal("version"),
  name: Schema.String,
  version: Schema.String,
});

const toJsonFlagDoc = (flag: FlagDoc): JsonFlagDoc => ({
  name: flag.name,
  aliases: flag.aliases,
  type: flag.type,
  required: flag.required,
  description: Option.getOrUndefined(flag.description),
});

const toJsonHelpDoc = (doc: HelpDoc): JsonHelpDoc => {
  const adjusted = getAdjustedHelpDoc(doc);
  const learnMore = getLearnMore(doc);

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
    ...(learnMore !== "" && { learnMore }),
  };
};

const flagNames = (flag: FlagDoc): string => {
  const names = [`--${flag.name}`, ...flag.aliases.map((alias) => `-${alias}`)];
  return names.join(", ");
};

const flagLabel = (flag: FlagDoc): string =>
  flag.type === "boolean" ? flagNames(flag) : `${flagNames(flag)} <${flag.type}>`;

const padRows = (
  rows: ReadonlyArray<readonly [string, string]>,
  indent = "  ",
): ReadonlyArray<string> => {
  const width = rows.reduce((max, [label]) => Math.max(max, label.length), 0);
  return rows.map(([label, description]) =>
    description === "" ? `${indent}${label}` : `${indent}${label.padEnd(width)}  ${description}`,
  );
};

const commandDescription = (command: {
  readonly shortDescription: string | undefined;
  readonly description: string;
}): string => command.shortDescription ?? command.description;

const renderRootHelpDoc = (doc: HelpDoc): string => {
  const sections: Array<string> = [
    ["", BRANDING, "", doc.description].filter((line) => line !== "").join("\n"),
    ["USAGE", `  ${doc.usage}`].join("\n"),
  ];

  for (const group of doc.subcommands ?? []) {
    const groupName = group.group ?? "COMMANDS";
    const rows = group.commands.map(
      (command) => [command.name, commandDescription(command)] as const,
    );
    sections.push([`${groupName} COMMANDS`, ...padRows(rows)].join("\n"));
  }

  const flags = [...doc.flags, ...(doc.globalFlags ?? [])];
  if (flags.length > 0) {
    const rows = flags.map(
      (flag) => [flagLabel(flag), Option.getOrElse(flag.description, () => "")] as const,
    );
    sections.push(["FLAGS", ...padRows(rows)].join("\n"));
  }

  if (doc.examples !== undefined && doc.examples.length > 0) {
    const rows = doc.examples.map(
      (example) => [example.command, example.description ?? ""] as const,
    );
    sections.push(["EXAMPLES", ...padRows(rows)].join("\n"));
  }

  return sections.join("\n\n");
};

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

/**
 * Creates a custom CLI output formatter that wraps the Effect default
 * formatter with axm-specific adjustments:
 *
 * 1. Root help section reordering and hidden subcommand filtering
 * 2. Global flag suppression on subcommand help output
 * 3. "Learn more" footer from the {@link LearnMore} command annotation
 */
export const makeAxmFormatter = (options?: {
  readonly json?: boolean | undefined;
}): CliOutput.Formatter => {
  const base = CliOutput.defaultFormatter();
  const json = options?.json === true;

  return {
    ...base,

    formatHelpDoc: (doc: HelpDoc): string => {
      if (json) {
        return JSON.stringify(Schema.encodeSync(JsonHelpDocSchema)(toJsonHelpDoc(doc)), null, 2);
      }

      const adjusted = getAdjustedHelpDoc(doc);
      let output = base.formatHelpDoc(adjusted);

      if (!isSubcommandDoc(doc)) {
        output = renderRootHelpDoc(adjusted);
      }

      const learnMore = getLearnMore(doc);
      if (learnMore !== "") {
        output += "\n\n" + learnMore;
      }

      return output;
    },

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

    // Keep usage failures human-oriented on stderr even when --json is set.
    // Effect CLI owns the parse/help path, so this is the cleanest contract
    // we can provide without replacing Command.runWith().
    formatErrors: (errors) => base.formatErrors(errors),
  };
};
