/** AXM command annotations and learn-more footer presentation. */

import * as ServiceMap from "effect/Context";
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
 * Builds a `LEARN MORE` footer string from rows of an `axm help <topic>`
 * command or a link and what it offers, with the inline command column padded
 * to a consistent width; a row too long to sit inline takes its own line and
 * sets no padding. Pass the result to `Command.annotate(LearnMore, ...)`. The
 * string is part of the machine help document; {@link learnMoreRows} reads it
 * back for the human view.
 */
export const formatLearnMore = (
  rows: ReadonlyArray<readonly [command: string, description: string]>,
): string => {
  const width = rows.reduce(
    (max, [command]) =>
      command.length > LEARN_MORE_INLINE_COMMAND_WIDTH ? max : Math.max(max, command.length),
    0,
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
