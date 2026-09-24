/**
 * Effect CLI output formatter for AXM.
 *
 * Effect CLI renders built-in help and version output through this string
 * formatter and its console. The formatter owns no styling, layout, or output
 * mode: every document it formats is the machine document, which the
 * application reads back and presents through the Screen (see
 * `built-in-output.ts`). Parse errors are not rendered here at all; the
 * application paints them from the parser's failure.
 */

import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import type { HelpDoc } from "effect/unstable/cli/HelpDoc";
import { CliOutput } from "effect/unstable/cli";

import { JsonHelpDocSchema, JsonVersionDocSchema, toJsonHelpDoc } from "./cli-runtime/index.js";

/**
 * Annotation key for "learn more" footer text.
 * Attach to commands via `Command.annotate(LearnMore, "...")`.
 */
export const LearnMore: ServiceMap.Reference<string> = ServiceMap.Reference("axm/learn-more", {
  defaultValue: () => "",
});

const LEARN_MORE_INLINE_COMMAND_WIDTH = 40;

/** Indent every learn-more row carries under its heading. */
const LEARN_MORE_ROW_INDENT = "  ";

/**
 * Builds a `LEARN MORE` footer string from `axm help <topic>` rows, with the
 * command column padded to a consistent width. Pass the result to
 * `Command.annotate(LearnMore, ...)`. The string is part of the machine help
 * document; {@link learnMoreRows} reads it back for the human view.
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
      ? [`${LEARN_MORE_ROW_INDENT}${command}`, `${LEARN_MORE_ROW_INDENT}  ${description}`]
      : [`${LEARN_MORE_ROW_INDENT}${command.padEnd(width)}  ${description}`],
  );
  return ["LEARN MORE", ...lines].join("\n");
};

export type LearnMoreRow = readonly [command: string, description: string];

/**
 * The heading and rows of a learn-more footer, read back from the string
 * {@link formatLearnMore} built: the inverse of its two row forms, so the
 * human view lays the rows out itself instead of printing the padded text.
 */
export const learnMoreRows = (
  learnMore: string,
): { readonly title: string; readonly rows: ReadonlyArray<LearnMoreRow> } => {
  const [title = "", ...lines] = learnMore.split("\n");
  const rows: Array<LearnMoreRow> = [];
  for (const line of lines) {
    const row = line.startsWith(LEARN_MORE_ROW_INDENT)
      ? line.slice(LEARN_MORE_ROW_INDENT.length)
      : line;
    const previous = rows[rows.length - 1];
    if (row.startsWith(LEARN_MORE_ROW_INDENT) && previous !== undefined && previous[1] === "") {
      rows[rows.length - 1] = [previous[0], row.trimStart()];
      continue;
    }
    const inline = /^(.*?\S) {2,}(\S.*)$/u.exec(row);
    rows.push(inline === null ? [row, ""] : [inline[1] ?? "", inline[2] ?? ""]);
  }
  return { title, rows };
};

const getLearnMore = (doc: HelpDoc): string => ServiceMap.get(doc.annotations, LearnMore);

/** Creates the CLI output formatter: help and version as their machine documents. */
export const makeAxmFormatter = (): CliOutput.Formatter => ({
  ...CliOutput.defaultFormatter({ colors: false }),

  formatHelpDoc: (doc: HelpDoc): string =>
    JSON.stringify(
      Schema.encodeSync(JsonHelpDocSchema)(toJsonHelpDoc(doc, { learnMore: getLearnMore(doc) })),
      null,
      2,
    ),

  formatVersion: (name: string, version: string): string =>
    JSON.stringify(
      Schema.encodeSync(JsonVersionDocSchema)({ type: "version", name, version }),
      null,
      2,
    ),
});
