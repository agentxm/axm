/**
 * Custom CLI output formatter that renders metadata-driven root help and
 * appends a "learn more" footer from command annotations.
 */

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import type { FlagDoc, HelpDoc } from "effect/unstable/cli/HelpDoc";
import { CliOutput } from "effect/unstable/cli";

import { BRANDING } from "./branding/index.js";
import { stripTerminalFormatting } from "./cli-renderer/index.js";
import {
  JsonHelpDocSchema,
  JsonVersionDocSchema,
  isSubcommandDoc,
  toJsonHelpDoc,
} from "./cli-runtime/index.js";

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

const getLearnMore = (doc: HelpDoc): string => ServiceMap.get(doc.annotations, LearnMore);

const groupLabel = (group: string | undefined): string => {
  if (group === undefined) return "commands";

  return group.toUpperCase();
};

/** Registered group that should render before the other command groups. */
const LEADING_GROUP = "GETTING STARTED";

/**
 * Display labels for command groups. Only
 * defined when the display label differs from the group key.
 */
const COMPACT_GROUP_LABELS: Record<string, string> = {
  "GETTING STARTED": "START HERE",
};

/** Indent for content rows under section headers (commands, flags, usage). */
const SECTION_INDENT = "  ";

/** Display label for the global flags compact row appended to root help. */
const GLOBAL_FLAGS_LABEL = "GLOBAL FLAGS";
const OUTPUT_MODE_FLAGS = new Set(["non-interactive", "verbose", "debug", "quiet"]);

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

const formatSubcommandName = (name: string, alias: string | undefined): string =>
  alias === undefined ? name : `${name}, ${alias}`;

interface HelpColors {
  readonly enabled: boolean;
  readonly bold: (text: string) => string;
  readonly cyan: (text: string) => string;
  readonly dim: (text: string) => string;
  readonly green: (text: string) => string;
}

const makeHelpColors = (enabled: boolean): HelpColors => {
  if (!enabled) {
    return {
      enabled: false,
      bold: (text) => text,
      cyan: (text) => text,
      dim: (text) => text,
      green: (text) => text,
    };
  }

  return {
    enabled: true,
    bold: (text) => `\u001b[1m${text}\u001b[0m`,
    cyan: (text) => `\u001b[36m${text}\u001b[0m`,
    dim: (text) => `\u001b[2m${text}\u001b[0m`,
    green: (text) => `\u001b[32m${text}\u001b[0m`,
  };
};

const renderCommandRow = (
  command: {
    readonly name: string;
    readonly alias?: string | undefined;
    readonly shortDescription?: string | undefined;
    readonly description?: string | undefined;
  },
  columnWidth: number,
  colors: HelpColors,
): string => {
  const displayName = formatSubcommandName(command.name, command.alias);
  const padding = " ".repeat(Math.max(1, columnWidth - displayName.length));
  return `  ${colors.cyan(displayName)}${padding}${command.shortDescription ?? command.description ?? ""}`;
};

const renderRootHelpDoc = (doc: HelpDoc, colors: HelpColors): string => {
  const renderCommandGroup = (
    label: string,
    commands: NonNullable<HelpDoc["subcommands"]>[number]["commands"],
  ): ReadonlyArray<string> => {
    if (commands.length === 0) return [];

    const columnWidth =
      commands.reduce(
        (max, command) => Math.max(max, formatSubcommandName(command.name, command.alias).length),
        0,
      ) + 1;

    return [
      colors.bold(COMPACT_GROUP_LABELS[label] ?? label),
      ...commands.map((command) => renderCommandRow(command, columnWidth, colors)),
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

  const leadingGroups: Array<ReadonlyArray<string>> = [];
  const trailingGroups: Array<ReadonlyArray<string>> = [];
  for (const group of doc.subcommands ?? []) {
    const label = groupLabel(group.group);
    const rendered = renderCommandGroup(label, group.commands);
    if (rendered.length === 0) continue;
    (label === LEADING_GROUP ? leadingGroups : trailingGroups).push(rendered);
  }

  const globalFlagRow = renderCompactGroup(
    GLOBAL_FLAGS_LABEL,
    (doc.globalFlags ?? []).map((flag) => `--${flag.name}`),
    colors.green,
  );
  if (globalFlagRow.length > 0) trailingGroups.push(globalFlagRow);

  const outputModeFlags = (doc.globalFlags ?? []).filter(
    (flag) => OUTPUT_MODE_FLAGS.has(flag.name) && Option.isSome(flag.description),
  );
  if (outputModeFlags.length > 0) {
    const width =
      outputModeFlags.reduce((max, flag) => Math.max(max, `--${flag.name}`.length), 0) + 1;
    trailingGroups.push([
      colors.bold("OUTPUT MODES"),
      ...outputModeFlags.map((flag) =>
        renderCommandRow(
          {
            name: `--${flag.name}`,
            description: Option.getOrElse(flag.description, () => ""),
          },
          width,
          colors,
        ),
      ),
    ]);
  }

  const sections: Array<ReadonlyArray<string>> = [...leadingGroups, ...trailingGroups].filter(
    (section) => section.length > 0,
  );
  const body = sections.flatMap((section, index) =>
    index === 0 ? [...section] : ["", ...section],
  );

  return [
    colors.enabled ? BRANDING : stripTerminalFormatting(BRANDING),
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
 * 1. Branded root help derived from registered command metadata
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
