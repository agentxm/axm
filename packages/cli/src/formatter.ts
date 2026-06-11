/**
 * Custom CLI output formatter that renders compact root help and appends a
 * "learn more" footer from command annotations.
 */

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import type { FlagDoc, HelpDoc } from "effect/unstable/cli/HelpDoc";
import { CliOutput } from "effect/unstable/cli";

import { BRANDING } from "@agentxm/client-core/unstable/branding";
import {
  JsonHelpDocSchema,
  JsonVersionDocSchema,
  isSubcommandDoc,
  toJsonHelpDoc,
} from "@agentxm/client-core/unstable/cli-runtime";

type ArgDoc = NonNullable<HelpDoc["args"]>[number];

/**
 * Annotation key for "learn more" footer text.
 * Attach to commands via `Command.annotate(LearnMore, "...")`.
 */
export const LearnMore: ServiceMap.Reference<string> = ServiceMap.Reference("axm/learn-more", {
  defaultValue: () => "",
});

const LEARN_MORE_INLINE_COMMAND_WIDTH = 40;

/**
 * Builds a `LEARN MORE` footer string from `axm help <topic>` rows, with the
 * command column padded to a consistent width. Pass the result to
 * `Command.annotate(LearnMore, ...)`.
 */
export const formatLearnMore = (
  rows: ReadonlyArray<readonly [command: string, description: string]>,
): string => {
  const width = Math.min(
    rows.reduce((max, [command]) => Math.max(max, command.length), 0),
    LEARN_MORE_INLINE_COMMAND_WIDTH,
  );
  const lines = rows.flatMap(([command, description]) =>
    command.length > LEARN_MORE_INLINE_COMMAND_WIDTH
      ? [`  ${command}`, `    ${description}`]
      : [`  ${command.padEnd(width)}  ${description}`],
  );
  return ["LEARN MORE", ...lines].join("\n");
};

const getLearnMore = (doc: HelpDoc): string =>
  ServiceMap.getReferenceUnsafe(doc.annotations, LearnMore);

type RootSubcommandDoc = {
  readonly name: string;
  readonly alias?: string | undefined;
  readonly shortDescription?: string | undefined;
  readonly description?: string | undefined;
};

const groupLabel = (group: string | undefined): string => {
  if (group === undefined) return "commands";

  return group.toUpperCase();
};

/** Core capability commands, rendered with descriptions at the top of root help. */
const CORE_COMMANDS = [
  "agents",
  "commands",
  "files",
  "hooks",
  "mcps",
  "packs",
  "rules",
  "skills",
  "subagents",
];
const CORE_GROUP_LABEL = "CORE";

/** Compact group that should render above the descriptive Core block. */
const LEADING_COMPACT_GROUP = "GETTING STARTED";

/**
 * Parent commands whose subcommands are promoted to the root command set.
 * The parent is omitted from the root listing to avoid duplicating its
 * children (e.g. `auth` — `login`/`logout`/`whoami`/`token` appear at root).
 */
const PROMOTED_PARENT_COMMANDS = ["auth"];

/**
 * Display labels for the compact (description-free) command groups. Only
 * defined when the display label differs from the group key.
 */
const COMPACT_GROUP_LABELS: Record<string, string> = {
  "GETTING STARTED": "START HERE",
};

/** Indent for content rows under section headers (commands, flags, usage). */
const SECTION_INDENT = "  ";

/** Display label for the global flags compact row appended to root help. */
const GLOBAL_FLAGS_LABEL = "GLOBAL FLAGS";

/** Target line width for wrapping the compact command lists. */
const ROOT_HELP_WIDTH = 80;
const TABLE_HELP_WIDTH = 78;

/**
 * Groups command names into rows whose rendered width — a leading `indent`,
 * the names, and ", " separators — stays within `width`. Wrapping is computed
 * on plain names so it is unaffected by ANSI color escapes added later.
 */
const wrapCommandRows = (
  commands: ReadonlyArray<string>,
  indent: number,
  width: number,
): ReadonlyArray<ReadonlyArray<string>> => {
  const rows: Array<Array<string>> = [];
  let current: Array<string> = [];
  let currentWidth = 0;

  commands.forEach((command, index) => {
    const separatorWidth = index < commands.length - 1 ? ", ".length : 0;
    const cost = command.length + separatorWidth;
    if (current.length > 0 && indent + currentWidth + cost > width) {
      rows.push(current);
      current = [];
      currentWidth = 0;
    }
    current.push(command);
    currentWidth += cost;
  });

  if (current.length > 0) rows.push(current);
  return rows;
};

const ROOT_COMMAND_DESCRIPTIONS: Record<string, string> = {
  agents: "Manage target coding agents",
  auth: "Manage registry authentication",
  commands: "Manage slash-command extensions",
  discover: "Find extensions for this project",
  files: "Manage context file utility extensions",
  help: "Show topic and command help",
  install: "Install extensions from the registry",
  lint: "Check workspace configuration",
  login: "Sign in to a registry",
  logout: "Sign out of a registry",
  mcps: "Manage MCP server configuration and extensions",
  outdated: "Show extensions with updates",
  packs: "Manage extension bundles",
  prune: "Remove unmanaged extension files",
  rules: "Manage instruction files and rule extensions",
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

const formatSubcommandName = (name: string, alias: string | undefined): string =>
  alias === undefined ? name : `${name}, ${alias}`;

const rootCommandDisplayName = (
  command: string,
  files: ReadonlyMap<string, RootSubcommandDoc>,
): string => {
  const doc = files.get(command);
  return formatSubcommandName(command, doc?.alias);
};

interface HelpColors {
  readonly bold: (text: string) => string;
  readonly cyan: (text: string) => string;
  readonly dim: (text: string) => string;
  readonly green: (text: string) => string;
}

const makeHelpColors = (enabled: boolean): HelpColors => {
  if (!enabled) {
    return {
      bold: (text) => text,
      cyan: (text) => text,
      dim: (text) => text,
      green: (text) => text,
    };
  }

  return {
    bold: (text) => `\u001b[1m${text}\u001b[0m`,
    cyan: (text) => `\u001b[36m${text}\u001b[0m`,
    dim: (text) => `\u001b[2m${text}\u001b[0m`,
    green: (text) => `\u001b[32m${text}\u001b[0m`,
  };
};

const rootCommandDescription = (
  command: string,
  files: ReadonlyMap<string, RootSubcommandDoc>,
): string => {
  const customDescription = ROOT_COMMAND_DESCRIPTIONS[command];
  if (customDescription !== undefined) return customDescription;

  const doc = files.get(command);
  return doc?.shortDescription ?? doc?.description ?? "";
};

const renderCommandRow = (
  command: string,
  description: string,
  columnWidth: number,
  files: ReadonlyMap<string, RootSubcommandDoc>,
  colors: HelpColors,
): string => {
  const displayName = rootCommandDisplayName(command, files);
  const padding = " ".repeat(Math.max(1, columnWidth - displayName.length));
  return `  ${colors.cyan(displayName)}${padding}${description}`;
};

const renderRootHelpDoc = (doc: HelpDoc, colors: HelpColors): string => {
  const commandFiles = new Map(
    (doc.subcommands ?? []).flatMap((group) =>
      group.commands.map((command) => [command.name, command]),
    ),
  );

  const renderCoreGroup = (commands: ReadonlyArray<string>): ReadonlyArray<string> => {
    if (commands.length === 0) return [];

    const columnWidth =
      commands.reduce(
        (max, command) => Math.max(max, rootCommandDisplayName(command, commandFiles).length),
        0,
      ) + 1;

    return [
      colors.bold(CORE_GROUP_LABEL),
      ...commands.map((command) =>
        renderCommandRow(
          command,
          rootCommandDescription(command, commandFiles),
          columnWidth,
          commandFiles,
          colors,
        ),
      ),
    ];
  };

  const renderCompactGroup = (
    label: string,
    commands: ReadonlyArray<string>,
    colorize: (text: string) => string = colors.cyan,
  ): ReadonlyArray<string> => {
    if (commands.length === 0) return [];

    const displayLabel = COMPACT_GROUP_LABELS[label] ?? label;
    const rows = wrapCommandRows(commands, SECTION_INDENT.length, ROOT_HELP_WIDTH);

    return [
      colors.bold(displayLabel),
      ...rows.map((row, rowIndex) => {
        const trailingComma = rowIndex < rows.length - 1 ? "," : "";
        return `${SECTION_INDENT}${row.map((command) => colorize(command)).join(", ")}${trailingComma}`;
      }),
    ];
  };

  const leadingCompact: Array<ReadonlyArray<string>> = [];
  const trailingCompact: Array<ReadonlyArray<string>> = [];
  for (const group of doc.subcommands ?? []) {
    const label = groupLabel(group.group);
    const commands = group.commands
      .map((command) => command.name)
      .filter(
        (command) =>
          !CORE_COMMANDS.includes(command) && !PROMOTED_PARENT_COMMANDS.includes(command),
      );
    const rendered = renderCompactGroup(label, commands);
    if (rendered.length === 0) continue;
    (label === LEADING_COMPACT_GROUP ? leadingCompact : trailingCompact).push(rendered);
  }

  const globalFlagRow = renderCompactGroup(
    GLOBAL_FLAGS_LABEL,
    (doc.globalFlags ?? []).map((flag) => `--${flag.name}`),
    colors.green,
  );
  if (globalFlagRow.length > 0) trailingCompact.push(globalFlagRow);

  const sections: Array<ReadonlyArray<string>> = [
    ...leadingCompact,
    renderCoreGroup(CORE_COMMANDS),
    ...trailingCompact,
  ].filter((section) => section.length > 0);
  const body = sections.flatMap((section, index) =>
    index === 0 ? [...section] : ["", ...section],
  );

  return [
    BRANDING,
    "",
    colors.bold("USAGE"),
    `${SECTION_INDENT}${colors.cyan(doc.usage.replace("<subcommand>", "<command>"))}`,
    "",
    ...body,
  ].join("\n");
};

type HelpRow = {
  readonly left: string;
  readonly right: string;
};

const wrapText = (text: string, width: number): ReadonlyArray<string> => {
  if (text.length <= width) return [text];

  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: Array<string> = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length <= width) {
      current = candidate;
      return;
    }
    if (current.length > 0) lines.push(current);
    current = word;
  });

  if (current.length > 0) lines.push(current);
  return lines.length > 0 ? lines : [text];
};

const renderWrappedRows = (
  rows: ReadonlyArray<HelpRow>,
  colors: HelpColors,
  colorizeLeft: (text: string) => string,
): ReadonlyArray<string> => {
  if (rows.length === 0) return [];

  const leftWidth =
    rows.reduce((max, row) => Math.max(max, row.left.length), 0) + SECTION_INDENT.length;
  const rightWidth = Math.max(24, TABLE_HELP_WIDTH - SECTION_INDENT.length - leftWidth);

  return rows.flatMap((row) => {
    const rightLines = wrapText(row.right, rightWidth);
    const leftPadding = " ".repeat(Math.max(1, leftWidth - row.left.length));
    const continuation = `${SECTION_INDENT}${" ".repeat(leftWidth)}`;

    return rightLines.map((line, index) =>
      index === 0
        ? `${SECTION_INDENT}${colorizeLeft(row.left)}${leftPadding}${line}`
        : `${continuation}${line}`,
    );
  });
};

const formatFlagName = (flag: FlagDoc): string => {
  const names = [`--${flag.name}`];
  flag.aliases.forEach((alias) => {
    names.push(alias.startsWith("-") ? alias : alias.length === 1 ? `-${alias}` : `--${alias}`);
  });
  return names.join(", ");
};

const formatArgName = (arg: ArgDoc): string => {
  const name = arg.variadic ? `${arg.name}...` : arg.name;
  return arg.required ? `<${name}>` : `[<${name}>]`;
};

const formatArgDescription = (arg: ArgDoc): string => {
  const description = Option.getOrElse(arg.description, () => "");
  return arg.required ? description : `${description} (optional)`;
};

const renderSection = (
  label: string,
  lines: ReadonlyArray<string>,
  colors: HelpColors,
): ReadonlyArray<string> => (lines.length === 0 ? [] : [colors.bold(label), ...lines]);

const renderSubcommandHelpDoc = (doc: HelpDoc, colors: HelpColors): string => {
  const sections: Array<ReadonlyArray<string>> = [];

  if (doc.description !== "") {
    sections.push(renderSection("DESCRIPTION", [`  ${doc.description}`], colors));
  }

  sections.push(renderSection("USAGE", [`  ${colors.cyan(doc.usage)}`], colors));

  if (doc.args !== undefined && doc.args.length > 0) {
    sections.push(
      renderSection(
        "ARGUMENTS",
        renderWrappedRows(
          doc.args.map((arg) => ({
            left: formatArgName(arg),
            right: formatArgDescription(arg),
          })),
          colors,
          colors.cyan,
        ),
        colors,
      ),
    );
  }

  if (doc.flags.length > 0) {
    sections.push(
      renderSection(
        "FLAGS",
        renderWrappedRows(
          doc.flags.map((flag) => ({
            left: formatFlagName(flag),
            right: Option.getOrElse(flag.description, () => ""),
          })),
          colors,
          colors.green,
        ),
        colors,
      ),
    );
  }

  if (doc.globalFlags !== undefined && doc.globalFlags.length > 0) {
    sections.push(
      renderSection(
        GLOBAL_FLAGS_LABEL,
        renderWrappedRows(
          doc.globalFlags.map((flag) => ({
            left: formatFlagName(flag),
            right: Option.getOrElse(flag.description, () => ""),
          })),
          colors,
          colors.green,
        ),
        colors,
      ),
    );
  }

  for (const group of doc.subcommands ?? []) {
    const label = group.group === undefined ? "SUBCOMMANDS" : groupLabel(group.group);
    sections.push(
      renderSection(
        label,
        renderWrappedRows(
          group.commands.map((command) => ({
            left: formatSubcommandName(command.name, command.alias),
            right: command.shortDescription ?? command.description ?? "",
          })),
          colors,
          colors.cyan,
        ),
        colors,
      ),
    );
  }

  if (doc.examples !== undefined && doc.examples.length > 0) {
    const examples = doc.examples.flatMap((example, index) => [
      ...(index > 0 ? [""] : []),
      ...(example.description === undefined ? [] : [`  ${colors.dim(`# ${example.description}`)}`]),
      `  ${colors.cyan(example.command)}`,
    ]);
    sections.push(renderSection("EXAMPLES", examples, colors));
  }

  return sections
    .filter((section) => section.length > 0)
    .flatMap((section, index) => (index === 0 ? [...section] : ["", ...section]))
    .join("\n");
};

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

/**
 * Creates a custom CLI output formatter that wraps the Effect default
 * formatter with axm-specific adjustments:
 *
 * 1. Compact branded root help output
 * 2. "Learn more" footer from the {@link LearnMore} command annotation
 */
export const makeAxmFormatter = (options?: {
  readonly json?: boolean | undefined;
  readonly colors?: boolean | undefined;
}): CliOutput.Formatter => {
  const colorsEnabled = options?.colors ?? true;
  const base = CliOutput.defaultFormatter({ colors: colorsEnabled });
  const helpColors = makeHelpColors(colorsEnabled);
  const json = options?.json === true;

  return {
    ...base,

    formatHelpDoc: (doc: HelpDoc): string => {
      if (json) {
        return JSON.stringify(
          Schema.encodeSync(JsonHelpDocSchema)(
            toJsonHelpDoc(doc, { learnMore: getLearnMore(doc) }),
          ),
          null,
          2,
        );
      }

      let output = isSubcommandDoc(doc)
        ? renderSubcommandHelpDoc(doc, helpColors)
        : renderRootHelpDoc(doc, helpColors);

      const learnMore = getLearnMore(doc);
      if (learnMore !== "") {
        const display = colorsEnabled
          ? learnMore.replace(/^([^\n]+)/, (heading) => `\u001b[1m${heading}\u001b[0m`)
          : learnMore;
        output += "\n\n" + display;
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

    formatErrors: (errors) => {
      if (!json) return base.formatErrors(errors);
      const message = errors.map((error) => error.message).join("; ");
      return JSON.stringify({ type: "error", code: "usage", message });
    },
  };
};
