import { parameterHelpLine } from "../../cli-parameters.js";
/**
 * The human form of a command-help document.
 *
 * Built-in `--help`, a parent command invoked without a subcommand, and
 * `axm help <command-path>` all reach the terminal through this view. It says
 * what each section means — which names are commands, which are flags, what
 * is a literal to copy — and leaves colour, width, and wrapping to the
 * Screen's painter, which decides them per stream.
 */

import { brandingDoc } from "../../branding/index.js";
import type {
  JsonArgDoc,
  JsonFlagDoc,
  JsonHelpDoc,
  JsonSubcommandDoc,
} from "../../cli-runtime/index.js";
import { learnMoreRows } from "../../formatter.js";
import {
  commandSpan,
  invocation,
  type Doc,
  type DocNode,
  type Field,
  type Span,
  type Text,
} from "../../screen/index.js";

const heading = (title: string): Text => [{ text: title, bold: true, tone: "neutral" }];

const section = (title: string, children: Doc): Doc =>
  children.length === 0 ? [] : [{ _tag: "section", title: heading(title), children }];

const commandName = (name: string): Span => commandSpan(name);

const flagName = (name: string): Span => ({ text: name, tint: "green" });

const namesRow = (
  names: ReadonlyArray<string>,
  paint: (name: string) => Span,
): ReadonlyArray<Span> =>
  names.flatMap((name, index) => (index === 0 ? [paint(name)] : [{ text: ", " }, paint(name)]));

const fieldsNode = (fields: ReadonlyArray<Field>): Doc =>
  fields.length === 0 ? [] : [{ _tag: "fields", fields }];

const learnMoreDoc = (learnMore: string | undefined): Doc => {
  if (learnMore === undefined || learnMore === "") return [];
  const { title, rows } = learnMoreRows(learnMore);
  return section(
    title,
    fieldsNode(
      rows.map(([command, description]) => ({
        label: invocation(command),
        value: description,
      })),
    ),
  );
};

const outputContractDoc = (doc: JsonHelpDoc): Doc =>
  doc.output === undefined
    ? []
    : section(
        "OUTPUT",
        fieldsNode([
          { label: "Class", value: doc.output.class },
          {
            label: "Modes",
            value: doc.output.modes.length === 0 ? "formatter-owned" : doc.output.modes.join(", "),
          },
          { label: "Effects", value: doc.output.effects },
          { label: "Meaning", value: doc.output.meaning },
          { label: "Schema", value: doc.output.schemaCommand },
        ]),
      );

// ---------------------------------------------------------------------------
// Root help
// ---------------------------------------------------------------------------

const groupLabel = (group: string | undefined): string =>
  group === undefined ? "commands" : group.toUpperCase();

/** Registered group that should render before the other command groups. */
const LEADING_GROUP = "START HERE";

/**
 * Groups rendered as a name list rather than a described table, each mapped
 * to the footer that closes it, or to `null` for no footer. Form is the view's
 * to decide, so the command tree declares group membership and nothing about
 * layout.
 */
const COMPACT_GROUP_FOOTERS: Record<string, string | null> = {
  "EXTENSION TYPES": "Run axm <type> --help for type-specific commands",
  AUTH: null,
  CLI: null,
};

const GLOBAL_FLAGS_LABEL = "GLOBAL FLAGS";

/**
 * Root help names the global flags and stops there; command help already
 * prints every one of them with its description.
 */
const GLOBAL_FLAGS_FOOTER = "Run axm <command> --help for flag details";

const formatSubcommandName = (name: string, alias: string | undefined): string =>
  alias === undefined ? name : `${name}, ${alias}`;

interface CommandRow {
  readonly displayName: string;
  readonly description: string;
}

/**
 * Folds a command named `un<previous>` into the row above it, so an inverse
 * pair reads as one entry under its forward command's description. Adjacency
 * is the whole rule: the group declares row order, and an inverse separated
 * from its forward command keeps its own row.
 */
const foldInverseCommands = (
  commands: ReadonlyArray<JsonSubcommandDoc>,
): ReadonlyArray<CommandRow> => {
  const rows: Array<CommandRow> = [];
  let forwardName: string | undefined;

  for (const command of commands) {
    const previous = rows[rows.length - 1];
    if (
      forwardName !== undefined &&
      previous !== undefined &&
      command.name === `un${forwardName}`
    ) {
      rows[rows.length - 1] = {
        ...previous,
        displayName: `${previous.displayName}, ${command.name}`,
      };
      continue;
    }

    rows.push({
      displayName: formatSubcommandName(command.name, command.alias),
      description: command.shortDescription ?? command.description ?? "",
    });
    forwardName = command.name;
  }

  return rows;
};

const compactGroupDoc = (
  label: string,
  names: ReadonlyArray<string>,
  footer: string | null,
  paint: (name: string) => Span,
): Doc =>
  names.length === 0
    ? []
    : section(label, [
        { _tag: "paragraph", text: namesRow(names, paint) },
        ...(footer === null ? [] : [{ _tag: "paragraph", tone: "dim", text: footer } as const]),
      ]);

const describedGroupDoc = (label: string, commands: ReadonlyArray<JsonSubcommandDoc>): Doc =>
  section(
    label,
    fieldsNode(
      foldInverseCommands(commands).map((row) => ({
        label: [commandName(row.displayName)],
        value: row.description,
      })),
    ),
  );

const rootHelpDoc = (doc: JsonHelpDoc): Doc => {
  const leadingGroups: Array<Doc> = [];
  const trailingGroups: Array<Doc> = [];
  for (const group of doc.subcommands ?? []) {
    const label = groupLabel(group.group);
    const compactFooter = COMPACT_GROUP_FOOTERS[label];
    const rendered =
      compactFooter === undefined
        ? describedGroupDoc(label, group.commands)
        : compactGroupDoc(
            label,
            group.commands.map((command) => command.name),
            compactFooter,
            commandName,
          );
    (label === LEADING_GROUP ? leadingGroups : trailingGroups).push(rendered);
  }

  // Each part is a section or none at all; the painter sets sibling sections apart.
  const parts: ReadonlyArray<Doc> = [
    brandingDoc,
    section("USAGE", [
      { _tag: "paragraph", text: invocation(doc.usage.replace("<subcommand>", "<command>")) },
    ]),
    ...leadingGroups,
    ...trailingGroups,
    compactGroupDoc(
      GLOBAL_FLAGS_LABEL,
      (doc.globalFlags ?? []).map((flag) => `--${flag.name}`),
      GLOBAL_FLAGS_FOOTER,
      flagName,
    ),
    outputContractDoc(doc),
    learnMoreDoc(doc.learnMore),
  ];
  return parts.flat();
};

// ---------------------------------------------------------------------------
// Command help
// ---------------------------------------------------------------------------

const formatFlagName = (flag: JsonFlagDoc): string =>
  [
    `--${flag.name}`,
    ...flag.aliases.map((alias) =>
      alias.startsWith("-") ? alias : alias.length === 1 ? `-${alias}` : `--${alias}`,
    ),
  ].join(", ");

const formatArgName = (arg: JsonArgDoc): string => {
  const name = `<${arg.name}>${arg.variadic !== undefined ? "..." : ""}`;
  return arg.required ? name : `[${name}]`;
};

const formatArgDescription = parameterHelpLine;

const flagFields = (flags: ReadonlyArray<JsonFlagDoc>): ReadonlyArray<Field> =>
  flags.map((flag) => ({
    label: [flagName(formatFlagName(flag))],
    value: parameterHelpLine(flag),
  }));

const commandHelpSections = (doc: JsonHelpDoc): Doc => {
  // Each part is a section or none at all; the painter sets sibling sections apart.
  const parts: ReadonlyArray<Doc> = [
    doc.description === ""
      ? []
      : section("DESCRIPTION", [{ _tag: "paragraph", text: doc.description }]),
    section("USAGE", [{ _tag: "paragraph", text: invocation(doc.usage) }]),
    section(
      "ARGUMENTS",
      fieldsNode(
        (doc.args ?? []).map((arg) => ({
          label: [commandName(formatArgName(arg))],
          value: formatArgDescription(arg),
        })),
      ),
    ),
    section("FLAGS", fieldsNode(flagFields(doc.flags))),
    section("INHERITED FLAGS", fieldsNode(flagFields(doc.inheritedFlags ?? []))),
    section(GLOBAL_FLAGS_LABEL, fieldsNode(flagFields(doc.globalFlags ?? []))),
    ...(doc.subcommands ?? []).map((group) =>
      section(
        group.group === undefined ? "SUBCOMMANDS" : groupLabel(group.group),
        fieldsNode(
          group.commands.map((command) => ({
            label: [commandName(formatSubcommandName(command.name, command.alias))],
            value: command.shortDescription ?? command.description ?? "",
          })),
        ),
      ),
    ),
    section(
      "EXAMPLES",
      // Each example is its own group, so the painter sets one apart from the next.
      (doc.examples ?? []).map((example): DocNode => ({
        _tag: "section",
        children: [
          ...(example.description === undefined
            ? []
            : [{ _tag: "paragraph", tone: "dim", text: `# ${example.description}` } as const]),
          { _tag: "paragraph", text: invocation(example.command) },
        ],
      })),
    ),
    outputContractDoc(doc),
    learnMoreDoc(doc.learnMore),
  ];
  return parts.flat();
};

/**
 * Root help describes the tool; command help describes one executable path.
 * The usage line tells them apart: a root usage names only the tool before
 * its first bracket.
 */
const isCommandDoc = (doc: JsonHelpDoc): boolean => {
  const beforeBrackets = doc.usage.replace(/\s*[[<].*$/, "").trim();
  return beforeBrackets.split(/\s+/).filter((token) => token.length > 0).length > 1;
};

export const commandHelpDoc = (doc: JsonHelpDoc): Doc =>
  isCommandDoc(doc) ? commandHelpSections(doc) : rootHelpDoc(doc);
