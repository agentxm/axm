/**
 * Custom CLI output formatter that suppresses global flags on subcommand help
 * and appends a "learn more" footer from command annotations.
 */

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import type { FlagDoc, HelpDoc } from "effect/unstable/cli/HelpDoc";
import { CliOutput } from "effect/unstable/cli";

import { BRANDING } from "@agentxm/client-core/unstable/branding";

/**
 * Annotation key for "learn more" footer text.
 * Attach to commands via `Command.annotate(LearnMore, "...")`.
 */
export const LearnMore: ServiceMap.Reference<string> = ServiceMap.Reference("axm/learn-more", {
  defaultValue: () => "",
});

/**
 * Builds a `LEARN MORE` footer string from `axm help <topic>` rows, with the
 * command column padded to a consistent width. Pass the result to
 * `Command.annotate(LearnMore, ...)`.
 */
export const formatLearnMore = (
  rows: ReadonlyArray<readonly [command: string, description: string]>,
): string => {
  const width = rows.reduce((max, [command]) => Math.max(max, command.length), 0);
  const lines = rows.map(([command, description]) => `  ${command.padEnd(width)}  ${description}`);
  return ["LEARN MORE", ...lines].join("\n");
};

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

type RootSubcommandDoc = {
  readonly name: string;
  readonly shortDescription?: string | undefined;
  readonly description?: string | undefined;
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

const groupLabel = (group: string | undefined): string => {
  if (group === undefined) return "commands";

  return group.toUpperCase();
};

const COMMON_COMMANDS = ["skills", "commands", "mcp-servers", "subagents", "packs", "agents"];
const COMMON_COMMAND_GROUP = "COMMON";
const COMMAND_COLUMN_WIDTH = 16;

const ROOT_COMMAND_DESCRIPTIONS: Record<string, string> = {
  agents: "Configure coding-agent targets",
  auth: "Manage registry authentication",
  commands: "Manage slash-command extensions",
  discover: "Find extensions for this project",
  help: "Show topic and command help",
  install: "Install extensions from the registry",
  lint: "Check workspace configuration",
  login: "Sign in to a registry",
  logout: "Sign out of a registry",
  "mcp-servers": "Manage MCP server extensions",
  outdated: "Show extensions with updates",
  packs: "Manage extension bundles",
  prune: "Remove unmanaged extension files",
  setup: "Set up AXM in this project",
  skills: "Manage agent skills",
  subagents: "Manage subagent extensions",
  sync: "Render configured extensions",
  token: "Print the current auth token",
  uninstall: "Remove installed extensions",
  update: "Update installed extensions",
  upgrade: "Update the AXM CLI",
  version: "Bump extension versions",
  view: "View published extension metadata",
  whoami: "Show the signed-in account",
};

interface RootHelpColors {
  readonly bold: (text: string) => string;
  readonly cyan: (text: string) => string;
  readonly green: (text: string) => string;
}

const makeRootHelpColors = (enabled: boolean): RootHelpColors => {
  if (!enabled) {
    return {
      bold: (text) => text,
      cyan: (text) => text,
      green: (text) => text,
    };
  }

  return {
    bold: (text) => `\u001b[1m${text}\u001b[0m`,
    cyan: (text) => `\u001b[36m${text}\u001b[0m`,
    green: (text) => `\u001b[32m${text}\u001b[0m`,
  };
};

const rootCommandDescription = (
  command: string,
  docs: ReadonlyMap<string, RootSubcommandDoc>,
): string => {
  const customDescription = ROOT_COMMAND_DESCRIPTIONS[command];
  if (customDescription !== undefined) return customDescription;

  const doc = docs.get(command);
  return doc?.shortDescription ?? doc?.description ?? "";
};

const renderCommandRow = (command: string, description: string, colors: RootHelpColors): string => {
  const padding = " ".repeat(Math.max(1, COMMAND_COLUMN_WIDTH - command.length));
  return `  ${colors.green(command)}${padding}${description}`;
};

const renderRootHelpDoc = (doc: HelpDoc, colors: RootHelpColors): string => {
  const commandDocs = new Map(
    (doc.subcommands ?? []).flatMap((group) =>
      group.commands.map((command) => [command.name, command]),
    ),
  );

  const renderCommonGroup = (commands: ReadonlyArray<string>): ReadonlyArray<string> => {
    if (commands.length === 0) return [];

    return [
      `${colors.bold(COMMON_COMMAND_GROUP)}:`,
      ...commands.map((command) =>
        renderCommandRow(command, rootCommandDescription(command, commandDocs), colors),
      ),
    ];
  };

  const renderCompactGroup = (
    label: string,
    commands: ReadonlyArray<string>,
  ): ReadonlyArray<string> => {
    if (commands.length === 0) return [];

    return [
      `${colors.bold(label)}: ${commands.map((command) => colors.green(command)).join(", ")}`,
    ];
  };

  const commandGroups = [
    ...renderCommonGroup(COMMON_COMMANDS),
    ...(doc.subcommands ?? []).flatMap((group) => {
      const commands = group.commands
        .map((command) => command.name)
        .filter((command) => !COMMON_COMMANDS.includes(command));
      return renderCompactGroup(groupLabel(group.group), commands);
    }),
  ];

  return [
    BRANDING,
    "",
    `${colors.bold("Usage:")} ${colors.cyan(doc.usage.replace("<subcommand>", "<command>"))}`,
    "",
    colors.bold("All commands:"),
    ...commandGroups,
    "",
    colors.bold("More:"),
    `  ${colors.cyan("axm <command> --help")}              quick help for a command`,
    `  ${colors.cyan("axm help <topic>")}                  topic help`,
    `  ${colors.cyan("axm --json")}                        machine-readable output`,
  ].join("\n");
};

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

/**
 * Creates a custom CLI output formatter that wraps the Effect default
 * formatter with axm-specific adjustments:
 *
 * 1. Global flag suppression on subcommand help output
 * 2. "Learn more" footer from the {@link LearnMore} command annotation
 */
export const makeAxmFormatter = (options?: {
  readonly json?: boolean | undefined;
  readonly colors?: boolean | undefined;
}): CliOutput.Formatter => {
  const colorsEnabled = options?.colors ?? true;
  const base = CliOutput.defaultFormatter({ colors: colorsEnabled });
  const rootHelpColors = makeRootHelpColors(colorsEnabled);
  const json = options?.json === true;

  return {
    ...base,

    formatHelpDoc: (doc: HelpDoc): string => {
      if (json) {
        return JSON.stringify(Schema.encodeSync(JsonHelpDocSchema)(toJsonHelpDoc(doc)), null, 2);
      }

      const adjusted = getAdjustedHelpDoc(doc);
      let output = isSubcommandDoc(doc)
        ? base.formatHelpDoc(adjusted)
        : renderRootHelpDoc(adjusted, rootHelpColors);

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
