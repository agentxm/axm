import { plain } from "./doc.js";
import type {
  PromptChip,
  PromptHint,
  PromptKey,
  PromptNode,
  PromptOption,
  PromptPicked,
  Span,
  Text,
  Tone,
  WaitNode,
} from "./doc.js";
import {
  COLUMN_GAP,
  GUTTER_WIDTH,
  bold,
  fits,
  gutter,
  markGlyph,
  paintPrefixed,
  paintSpans,
  spaces,
  withSupplement,
  type ResolvedStyle,
} from "./paint-kit.js";
import { hintKeyName, isHintKeyToken } from "./glyphs.js";
import { displayWidth, truncateLine } from "./width.js";
import { spansOf, truncateText, wrapText } from "./wrap-text.js";

/** Cells between one key chip and the next. */
const CHIP_GAP = 3;
/** Cells between a question and the filter typed after it. */
const FILTER_GAP = 2;
/** What an empty filter shows, inviting a person to narrow the list. */
const FILTER_INVITATION = "type to filter";
/** The fewest cells an option's details are worth showing in beside its title. */
const DETAILS_MIN_WIDTH = 24;
/** A key whose name is at least this long is a word, such as `space`, and reads alone. */
const NAMED_KEY_LENGTH = 3;

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/**
 * One key chip: the key in a filled cell, and its word after it. The fill's
 * trailing cell is dropped on a line's last wordless chip, because a painted
 * line never ends in a space.
 */
const chipSpans = (
  chip: PromptChip,
  options: { readonly word: boolean; readonly last: boolean },
): ReadonlyArray<Span> => {
  const emphasis: Omit<Span, "text"> =
    chip.current === true ? { tone: "info", bold: true } : { tone: "dim" };
  const fill: Span = {
    text: ` ${chip.key}${options.word || !options.last ? " " : ""}`,
    invert: true,
    ...emphasis,
  };
  return options.word
    ? [fill, { text: " " }, { text: chip.word, ...(chip.current === true ? { bold: true } : {}) }]
    : [fill];
};

/** Every chip of one prompt, in paint order, with or without their words. */
const chipsSpans = (chips: ReadonlyArray<PromptChip>, word: boolean): ReadonlyArray<Span> =>
  chips.flatMap((chip, index) => [
    ...(index === 0 ? [] : [{ text: spaces(CHIP_GAP) }]),
    ...chipSpans(chip, { word, last: index === chips.length - 1 }),
  ]);

const spansWidth = (spans: ReadonlyArray<Span>): number => displayWidth(plain(spans));

/**
 * The line being typed, behind the caret. An empty line is the caret alone,
 * so the question line never ends in a space.
 */
const entrySpans = (entry: Text, style: ResolvedStyle): ReadonlyArray<Span> =>
  plain(entry).length === 0
    ? [{ text: style.glyphs.marks.caret }]
    : [{ text: `${style.glyphs.marks.caret} ` }, ...spansOf(entry)];

/**
 * The question and what answers it on its own line. A typed entry follows the
 * question while both fit, else takes the line beneath it. Key chips follow
 * the question while both fit one line; then they take the line beneath it,
 * aligned to the content column; then they lose their words, and the question
 * wraps with a hanging indent.
 */
const paintQuestion = (
  node: PromptNode,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> => {
  const first = gutter(style.glyphs.marks.prompt);
  const contentStart = indent + GUTTER_WIDTH;
  const question = bold(node.question);
  const questionWidth = displayWidth(plain(node.question));
  if (
    questionWidth === 0 &&
    node.filter === undefined &&
    node.entry === undefined &&
    node.chips.length === 0
  )
    return [];
  const room = (used: number): boolean => style.width === "unbounded" || used <= style.width;
  const alone = paintPrefixed(question, style, { indent, first });
  if (!style.wrap && style.width !== "unbounded") {
    const suffix: ReadonlyArray<Span> =
      node.filter !== undefined
        ? node.filter.length === 0
          ? [{ text: FILTER_INVITATION, tone: "dim" }]
          : [{ text: node.filter }]
        : node.entry !== undefined
          ? entrySpans(node.entry, style)
          : node.chips.length === 0
            ? []
            : chipsSpans(
                node.chips,
                contentStart + spansWidth(chipsSpans(node.chips, true)) <= style.width,
              );
    if (suffix.length === 0) return alone;
    const suffixWidth = spansWidth(suffix);
    const gap = node.filter !== undefined ? FILTER_GAP : node.entry === undefined ? COLUMN_GAP : 1;
    const available = Math.max(1, style.width - contentStart - gap - suffixWidth);
    const shortened = spansOf(truncateText(question, available, "end", style.glyphs.ellipsis));
    return [
      truncateLine(
        `${spaces(indent)}${first}${paintSpans(shortened, style)}${spaces(gap)}${paintSpans(suffix, style)}`,
        style.width,
        style.glyphs.ellipsis,
      ),
    ];
  }
  if (node.filter !== undefined) {
    // An empty filter invites typing while the line has room for it; a typed
    // one is what the list shows, so it takes the next line rather than go.
    const filter: ReadonlyArray<Span> =
      node.filter.length === 0
        ? [{ text: FILTER_INVITATION, tone: "dim" }]
        : [{ text: node.filter }];
    if (room(contentStart + questionWidth + FILTER_GAP + spansWidth(filter))) {
      return [
        `${spaces(indent)}${first}${paintSpans(question, style)}${spaces(FILTER_GAP)}${paintSpans(filter, style)}`,
      ];
    }
    return node.filter.length === 0
      ? alone
      : [...alone, ...paintPrefixed(node.filter, style, { indent: contentStart, first: "" })];
  }
  if (node.entry !== undefined) {
    const entry = entrySpans(node.entry, style);
    return room(contentStart + questionWidth + 1 + spansWidth(entry))
      ? [`${spaces(indent)}${first}${paintSpans(question, style)} ${paintSpans(entry, style)}`]
      : [...alone, `${spaces(contentStart)}${paintSpans(entry, style)}`];
  }
  if (node.chips.length === 0) return alone;
  const worded = chipsSpans(node.chips, true);
  const chips = room(contentStart + spansWidth(worded)) ? worded : chipsSpans(node.chips, false);
  return room(contentStart + questionWidth + COLUMN_GAP + spansWidth(worded))
    ? [
        `${spaces(indent)}${first}${paintSpans(question, style)}${spaces(COLUMN_GAP)}${paintSpans(worded, style)}`,
      ]
    : [
        ...alone,
        ...(room(contentStart + spansWidth(chips))
          ? [`${spaces(contentStart)}${paintSpans(chips, style)}`]
          : paintPrefixed(chips, style, { indent: contentStart, first: "" })),
      ];
};

/** The mark a picked, partly picked, or unpicked option carries. */
const pickedGlyph = (picked: PromptPicked, style: ResolvedStyle): string =>
  picked === "all"
    ? style.glyphs.marks.selected
    : picked === "some"
      ? style.glyphs.marks.partial
      : style.glyphs.marks.unselected;

/**
 * What stands before an option's title: the caret in the gutter where it
 * stands, then — for a question that takes several — the option's mark, and
 * two cells for each step in.
 */
const optionLead = (
  option: PromptOption,
  style: ResolvedStyle,
  indent: number,
): { readonly caret: string; readonly mark: string; readonly width: number } => {
  const current = option.current === true;
  const step = spaces(2 * (option.depth ?? 0));
  if (option.picked === undefined) {
    const caret = `${spaces(indent)}${gutter(current ? style.glyphs.marks.caret : undefined)}${step}`;
    return { caret, mark: "", width: displayWidth(caret) };
  }
  const caret = `${spaces(indent)} ${current ? style.glyphs.marks.caret : " "} `;
  const mark = `${pickedGlyph(option.picked, style)} ${step}`;
  return { caret, mark, width: displayWidth(caret) + displayWidth(mark) };
};

/** An option's title, shortened in the middle to what the line leaves it. */
const optionTitle = (option: PromptOption, style: ResolvedStyle, start: number): Text =>
  style.width === "unbounded"
    ? option.title
    : truncateText(option.title, Math.max(1, style.width - start), "middle", style.glyphs.ellipsis);

/** Where what was typed first shows in `text`, whatever its case, or `-1`. */
const matchAt = (text: string, filter: string | undefined): number => {
  if (filter === undefined || filter.length === 0) return -1;
  const lowered = text.toLowerCase();
  // A letter whose lower case is longer would move every index after it.
  return lowered.length === text.length ? lowered.indexOf(filter.toLowerCase()) : -1;
};

/** A value with what was typed in bold where it first shows, so a match is seen to be one. */
const withMatch = (value: Text, filter: string | undefined): ReadonlyArray<Span> => {
  const spans = spansOf(value);
  const index = spans.findIndex((span) => matchAt(span.text, filter) >= 0);
  const span = spans[index];
  if (span === undefined || filter === undefined) return spans;
  const at = matchAt(span.text, filter);
  const end = at + filter.length;
  return [
    ...spans.slice(0, index),
    ...(at === 0 ? [] : [{ ...span, text: span.text.slice(0, at) }]),
    { ...span, text: span.text.slice(at, end), bold: true },
    ...(end === span.text.length ? [] : [{ ...span, text: span.text.slice(end) }]),
    ...spans.slice(index + 1),
  ];
};

/**
 * Details shortened to `room` cells. They lose their end, unless what was
 * typed shows only past it: then they open at the words before the match, so
 * an option is never listed without the reason it is.
 */
const shortenedDetails = (
  details: ReadonlyArray<Span>,
  room: number,
  style: ResolvedStyle,
  filter: string | undefined,
): ReadonlyArray<Span> => {
  const text = plain(details);
  const at = matchAt(text, filter);
  const ellipsis = style.glyphs.ellipsis;
  const cut = room - displayWidth(ellipsis);
  const from =
    at < 0 || displayWidth(text.slice(0, at + (filter ?? "").length)) <= cut
      ? 0
      : text.lastIndexOf(" ", Math.max(0, at - Math.floor(room / 3))) + 1;
  const shown: Text = from === 0 ? details : `${ellipsis}${text.slice(from)}`;
  return spansOf(truncateText(withMatch(shown, filter), Math.max(1, room), "end", ellipsis));
};

/** An option's details joined by the painter's own separator. */
const optionDetails = (option: PromptOption, style: ResolvedStyle): ReadonlyArray<Span> =>
  (option.details ?? []).flatMap((detail, index) => [
    ...(index === 0 ? [] : [{ text: style.glyphs.separator }]),
    ...spansOf(detail),
  ]);

/** Where an option's details start: the list's column, unless its title reaches past it. */
const detailsStart = (title: Text, column: number, start: number): number =>
  Math.max(column, start + displayWidth(plain(title)) + COLUMN_GAP);

/**
 * The column a list's details share: the value column, or past it as far as
 * the longest title needs while that leaves details half the line. One long
 * title therefore moves every option's details together rather than its own
 * alone, and a title too long for that still reaches past the column.
 */
const detailsColumn = (
  options: ReadonlyArray<PromptOption>,
  style: ResolvedStyle,
  indent: number,
): number => {
  const longest = Math.max(
    0,
    ...options.map((option) => {
      const start = optionLead(option, style, indent).width;
      return start + displayWidth(plain(optionTitle(option, style, start))) + COLUMN_GAP;
    }),
  );
  return Math.max(
    style.valueColumn,
    style.width === "unbounded" ? longest : Math.min(longest, Math.floor(style.width / 2)),
  );
};

/**
 * One option on one line: the caret in the gutter where it stands, its mark
 * when the question takes several, the title, and — when the list shows
 * details at all — its details dim at the list's column, shortened to what
 * the line leaves them. The option the caret stands on is tinted, mark and
 * title together. A title too long for the line shortens in the middle. What
 * was typed to narrow the list is bold where the title or details carry it.
 */
const paintOption = (
  option: PromptOption,
  style: ResolvedStyle,
  indent: number,
  list: {
    readonly withDetails: boolean;
    readonly column: number;
    readonly filter: string | undefined;
  },
): string => {
  const tone: Tone | undefined = option.current === true ? "info" : undefined;
  const lead = optionLead(option, style, indent);
  const start = lead.width;
  const title = optionTitle(option, style, start);
  const line = `${lead.caret}${lead.mark.length === 0 ? "" : paintSpans([{ text: lead.mark }], style, tone)}${paintSpans(withMatch(title, list.filter), style, tone)}`;
  const details = optionDetails(option, style);
  if (!list.withDetails || details.length === 0) return line;
  const detailsAt = detailsStart(title, list.column, start);
  const gap = detailsAt - start - displayWidth(plain(title));
  const shown =
    style.width === "unbounded" || detailsAt + spansWidth(details) <= style.width
      ? withMatch(details, list.filter)
      : shortenedDetails(details, style.width - detailsAt, style, list.filter);
  return `${line}${spaces(gap)}${paintSpans(shown, style, "dim")}`;
};

/**
 * The dim line that names how many options a list leaves out on one side, and
 * what they are where the list says. It is one line however much it names.
 */
const paintSkipped = (
  arrow: string,
  count: number,
  style: ResolvedStyle,
  indent: number,
  what?: Text,
): ReadonlyArray<string> => {
  const start = indent + GUTTER_WIDTH;
  const named = `${arrow} ${String(count)} more${what === undefined ? "" : `${style.glyphs.separator}${plain(what)}`}`;
  const line =
    style.width === "unbounded"
      ? named
      : plain(truncateText(named, Math.max(1, style.width - start), "end", style.glyphs.ellipsis));
  return [`${spaces(start)}${paintSpans([{ text: line }], style, "dim")}`];
};

/** One key as the hint names it, with its word or, where the line is short, without. */
const keyText = (key: PromptKey, style: ResolvedStyle, worded: boolean): string => {
  const name = hintKeyName(key.key, style.glyphs);
  return worded ? `${name} ${key.word}` : name;
};

/**
 * The line beneath a list. The whole hint when it fits; then without the
 * arrows, and with named keys such as `space` standing alone; then with every
 * key standing alone; then its status alone.
 */
const paintHint = (
  hint: PromptHint,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> => {
  const full = [...hint.status, ...hint.keys.map((key) => keyText(key, style, true))];
  const short = [
    ...hint.status,
    ...hint.keys
      .filter((key) => !isHintKeyToken(key.key, style.glyphs))
      .map((key) => keyText(key, style, key.key.length < NAMED_KEY_LENGTH)),
  ];
  const bare = [
    ...hint.status,
    ...hint.keys
      .filter((key) => !isHintKeyToken(key.key, style.glyphs))
      .map((key) => keyText(key, style, false)),
  ];
  const joined = (parts: ReadonlyArray<string>): string => parts.join(style.glyphs.separator);
  const fitting =
    [full, short, bare].find((parts) => fits(style.width, `${spaces(indent)}${joined(parts)}`)) ??
    hint.status;
  return paintPrefixed(joined(fitting), style, { indent, first: "", tone: "dim" });
};

/**
 * What the caret's option means, on the lines a list keeps for it when its
 * options are too long to carry their details whole beside their titles. The
 * details wrap across those lines and name the option first while they have
 * room to, because the caret may stand far above them; what the lines cannot
 * hold is cut at their end. The lines stay, empty where the caret's own
 * details already show whole beside its title, so the list is exactly as tall
 * as it looks, says nothing twice, and keeps its height as the caret moves.
 */
const paintCurrentDetails = (
  options: ReadonlyArray<PromptOption>,
  style: ResolvedStyle,
  indent: number,
  lines: number,
  shownWhole: (option: PromptOption) => boolean,
): ReadonlyArray<string> => {
  const current = options.find((option) => option.current === true);
  const details = current === undefined ? [] : optionDetails(current, style);
  if (current === undefined || details.length === 0) return [];
  const kept = (shown: ReadonlyArray<string>): ReadonlyArray<string> => [
    ...shown,
    ...Array.from({ length: lines - shown.length }, () => ""),
  ];
  if (shownWhole(current)) return kept([]);
  const start = indent + GUTTER_WIDTH;
  const painted = (line: string): string =>
    `${spaces(start)}${paintSpans([{ text: line }], style, "dim")}`;
  const named = `${plain(current.title)}${style.glyphs.separator}${plain(details)}`;
  if (style.width === "unbounded") return kept([painted(named)]);
  const room = Math.max(1, style.width - start);
  const wrapped = (text: string): ReadonlyArray<string> =>
    wrapText(text, room).map((line) => plain(line));
  const whole = wrapped(named);
  const text = whole.length <= lines ? whole : wrapped(plain(details));
  // What the last line cannot hold goes, with the mark that says it went.
  const last = text.slice(lines - 1).join(" ");
  return kept(
    [...text.slice(0, lines - 1), plain(truncateText(last, room, "end", style.glyphs.ellipsis))]
      .filter((line) => line.length > 0)
      .map(painted),
  );
};

/**
 * A question and what answers it: its question line, a dim note beneath it,
 * and — for a question whose answers need reading — the options that fit,
 * with a line naming how many it left out above and below, and the hint
 * beneath the list. Options show their details whole where every option's
 * fit, and shortened where every option's keep enough of the line to be worth
 * reading: a list whose details come and go row by row would read as options
 * that have none, so a narrow list drops them all before it touches a title.
 * A list that could not show every option's details whole names the caret's
 * own beneath the list. Details start at one column for the whole list.
 */
export const paintPrompt = (
  node: PromptNode,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> => {
  const contentStart = indent + GUTTER_WIDTH;
  const listed = node.options ?? [];
  const offered = [...listed, ...(node.spare === undefined ? [] : [node.spare])];
  const column = detailsColumn(offered, style, indent);
  /** The cells an option's details would take, and those its line leaves them. */
  const detailsRoom = (option: PromptOption): { readonly need: number; readonly room: number } => {
    const start = optionLead(option, style, indent).width;
    const title = optionTitle(option, style, start);
    return {
      need: spansWidth(optionDetails(option, style)),
      room:
        style.width === "unbounded"
          ? Number.POSITIVE_INFINITY
          : style.width - detailsStart(title, column, start),
    };
  };
  const whole = offered.every((option) => {
    const { need, room } = detailsRoom(option);
    return need === 0 || need <= room;
  });
  const withDetails = offered.every((option) => {
    const { need, room } = detailsRoom(option);
    return need === 0 || need <= room || room >= DETAILS_MIN_WIDTH;
  });
  // The line kept for the caret's details goes to the next option when no
  // option needs it.
  const options = whole && node.spare !== undefined ? [...listed, node.spare] : listed;
  const more = (node.more ?? 0) - (options.length - listed.length);
  return [
    ...paintQuestion(node, style, indent),
    ...(node.note === undefined
      ? []
      : paintPrefixed(node.note, style, { indent: contentStart, first: "", tone: "dim" })),
    ...options.flatMap((option) => [
      ...(option.before === undefined || option.before <= 0
        ? []
        : paintSkipped(style.glyphs.arrows.up, option.before, style, indent)),
      paintOption(option, style, indent, { withDetails, column, filter: node.filter }),
    ]),
    ...(more <= 0 ? [] : paintSkipped(style.glyphs.arrows.down, more, style, indent, node.below)),
    ...(whole
      ? []
      : paintCurrentDetails(options, style, indent, node.detailLines ?? 1, (option) => {
          const { need, room } = detailsRoom(option);
          return withDetails && need <= room;
        })),
    ...(node.hint === undefined ? [] : paintHint(node.hint, style, indent)),
  ];
};

/**
 * A wait standing open: the running mark, what is being waited on and how long
 * is left — or, for a wait that does not expire, its clock at the value
 * column — and the keys beneath it. The line never carries a value a person
 * copies — the wait printed those to the transcript once — so it is safe to
 * repaint and truncate.
 */
export const paintWait = (
  node: WaitNode,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> => {
  const contentStart = indent + GUTTER_WIDTH;
  const status = paintPrefixed(node.status, style, {
    indent,
    first: gutter(markGlyph("working", style)),
  });
  const timed =
    node.remaining === undefined
      ? status
      : withSupplement(status, node.remaining, style, contentStart, {
          gap: style.glyphs.separator,
        });
  const clocked =
    node.clock === undefined
      ? timed
      : withSupplement(timed, node.clock, style, style.valueColumn, {
          gap: (last) => spaces(Math.max(COLUMN_GAP, style.valueColumn - displayWidth(last))),
        });
  const lines =
    node.detail === undefined
      ? clocked
      : [
          ...clocked,
          ...paintPrefixed(node.detail, style, { indent: contentStart, first: "", tone: "dim" }),
        ];
  if (node.chips.length === 0) return lines;
  const worded = chipsSpans(node.chips, true);
  const chips =
    style.width === "unbounded" || contentStart + spansWidth(worded) <= style.width
      ? worded
      : chipsSpans(node.chips, false);
  return [
    ...lines,
    ...(style.width === "unbounded" || contentStart + spansWidth(chips) <= style.width
      ? [`${spaces(contentStart)}${paintSpans(chips, style)}`]
      : paintPrefixed(chips, style, { indent: contentStart, first: "" })),
  ];
};
