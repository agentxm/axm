import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import type {
  Change,
  Doc,
  DocNode,
  LedgerColumn,
  LedgerFold,
  LedgerNode,
  LedgerRow,
  Mark,
  PromptChip,
  PromptHint,
  PromptKey,
  PromptNode,
  PromptOption,
  PromptPicked,
  RowNode,
  Span,
  Status,
  TableColumn,
  TableRow,
  Text,
  Tint,
  Tone,
  TreeItem,
  WaitNode,
} from "./doc.js";
import { joinGridLine, layoutTable, type LayoutColumn, type TableLayout } from "./table-layout.js";
import { displayWidth, padDisplay } from "./width.js";
import { longestWordWidth, spansOf, truncateText, visibleText, wrapText } from "./wrap-text.js";

const ESC = "\u001b[";
const RESET = `${ESC}0m`;
/** Reverse video: the terminal's own way to fill a cell behind its text. */
const INVERT = `${ESC}7m`;
const COLUMN_GAP = 3;
/**
 * Every marked node paints its mark in this gutter — a space, the mark, and
 * spaces to fill — so content after any mark starts at the same column.
 */
const GUTTER_WIDTH = 5;
/**
 * Preferred width of the key lane between the gutter and the value column,
 * matching the preferred width of a ledger's name column.
 */
const KEY_WIDTH = 27;
const MIN_FIELD_VALUE_WIDTH = 12;
/** Narrowest inline width a change row's last cell accepts before taking its own line. */
const FLEX_MIN_WIDTH = 16;
/** Cells between one key chip and the next. */
const CHIP_GAP = 3;
/** Cells between a question and the filter typed after it. */
const FILTER_GAP = 2;
/** What an empty filter shows, inviting a person to narrow the list. */
const FILTER_INVITATION = "type to filter";
/** A key whose name is at least this long is a word, such as `space`, and reads alone. */
const NAMED_KEY_LENGTH = 3;

export interface Glyphs {
  readonly status: Readonly<Record<Exclude<Tone, "neutral" | "dim">, string>>;
  readonly change: Readonly<Record<Change, string>>;
  /**
   * Marks that stand for interaction and unit progress rather than an outcome:
   * the question a prompt asks, the caret before the answer being edited, a
   * unit that has not started, and the three states of a choice.
   */
  readonly marks: {
    readonly prompt: string;
    readonly caret: string;
    readonly waiting: string;
    readonly selected: string;
    readonly unselected: string;
    readonly partial: string;
  };
  /**
   * The arrows that point at the options a list leaves out, and that name the
   * keys that move through it. They paint inline, leading their own line.
   */
  readonly arrows: { readonly up: string; readonly down: string };
  /**
   * The frames a running unit's mark animates through, in paint order. The
   * first frame is the mark a still document paints, so a set with one frame
   * simply does not animate. Every frame is one cell, so the animation never
   * shifts the line it prefixes.
   */
  readonly spinner: ReadonlyArray<string>;
  readonly tree: {
    readonly branch: string;
    readonly last: string;
    readonly pipe: string;
    readonly space: string;
  };
  /** Separator between parts of one line (summary parts, action targets). */
  readonly separator: string;
}

export const unicodeGlyphs: Glyphs = {
  status: { ok: "✔", warn: "▲", error: "✖", info: "●" },
  change: {
    create: "+",
    update: "~",
    remove: "-",
    unchanged: "=",
    blocked: "▲",
    failed: "✖",
    "rolled-back": "↶",
  },
  marks: {
    prompt: "?",
    caret: "❯",
    waiting: "·",
    selected: "◉",
    unselected: "◯",
    partial: "◪",
  },
  arrows: { up: "↑", down: "↓" },
  // Both frames are Neutral in Unicode East Asian Width, so the mark occupies
  // one cell in every terminal; ◐ and ◑ are Ambiguous and were dropped.
  spinner: ["◒", "◓"],
  tree: { branch: "├─ ", last: "└─ ", pipe: "│  ", space: "   " },
  separator: " · ",
};

/**
 * Seven-bit glyphs for terminals and locales without Unicode symbol support.
 * Status is two letters so `+` always means created and never doubles as an
 * outcome, and every mark still fits the five-column gutter, so the two sets
 * lay out identically.
 */
export const asciiGlyphs: Glyphs = {
  status: { ok: "ok", warn: "!!", error: "xx", info: ".." },
  change: {
    create: "+",
    update: "~",
    remove: "-",
    unchanged: "=",
    blocked: "!!",
    failed: "xx",
    "rolled-back": "<",
  },
  marks: {
    prompt: "?",
    caret: ">",
    waiting: ".",
    selected: "[x]",
    unselected: "[ ]",
    partial: "[-]",
  },
  arrows: { up: "^", down: "v" },
  // A terminal that cannot be trusted with symbols is not animated either, so
  // the running mark stands still.
  spinner: [".."],
  tree: { branch: "|- ", last: "`- ", pipe: "|  ", space: "   " },
  separator: " - ",
};

/** `"unbounded"` paints natural widths: no wrapping, truncation, or padding to a terminal width. */
export type PaintWidth = number | "unbounded";

export interface PaintStyle {
  readonly width: PaintWidth;
  readonly colors: boolean;
  readonly glyphs?: Glyphs;
  /**
   * The spinner frame a running mark paints, which the live region advances on
   * each repaint. A still document leaves it out and takes the set's first
   * frame, so the same document paints the same way twice.
   */
  readonly spinner?: string;
}

interface ResolvedStyle {
  readonly width: PaintWidth;
  readonly colors: boolean;
  readonly glyphs: Glyphs;
  readonly spinner: string;
  /**
   * Cells before the value column that field values and callout asides share
   * across one document; below twice its preferred column it moves left to
   * keep half the terminal width for values.
   */
  readonly valueColumn: number;
}

const toneCodes: Readonly<Record<Tone, string>> = {
  neutral: "",
  ok: `${ESC}32m`,
  warn: `${ESC}33m`,
  error: `${ESC}31m`,
  info: `${ESC}36m`,
  dim: `${ESC}2m`,
};

const tintCodes: Readonly<Record<Tint, string>> = {
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
};

const colorCode = (span: Span): string =>
  span.tone === undefined && span.tint !== undefined
    ? tintCodes[span.tint]
    : toneCodes[span.tone ?? "neutral"];

const styleSpan = (span: Span, colors: boolean): string => {
  if (!colors) return span.text;
  const prefix = `${span.bold === true ? `${ESC}1m` : ""}${span.invert === true ? INVERT : ""}${colorCode(span)}`;
  const linked =
    span.link === undefined
      ? span.text
      : `\u001b]8;;${span.link}\u001b\\${span.text}\u001b]8;;\u001b\\`;
  return prefix.length === 0 ? linked : `${prefix}${linked}${RESET}`;
};

const paintSpans = (spans: ReadonlyArray<Span>, style: ResolvedStyle, inherited?: Tone): string =>
  spans
    .map((span) => {
      // A tinted span keeps its own colour inside a toned line.
      const tone = span.tone ?? (span.tint === undefined ? inherited : undefined);
      return styleSpan(tone === undefined ? span : { ...span, tone }, style.colors);
    })
    .join("");

const paintValue = (value: Text, style: ResolvedStyle, inherited?: Tone): string =>
  paintSpans(typeof value === "string" ? [{ text: value }] : value, style, inherited);

/** Width left for content after `used` cells, never below one cell. */
const remaining = (width: PaintWidth, used: number): PaintWidth =>
  width === "unbounded" ? "unbounded" : Math.max(1, width - used);

const fits = (width: PaintWidth, line: string): boolean =>
  width === "unbounded" || displayWidth(line) <= width;

/** Wrap and paint a value into lines without any indentation. */
const paintLines = (
  value: Text,
  width: PaintWidth,
  style: ResolvedStyle,
  tone?: Tone,
): ReadonlyArray<string> => wrapText(value, width).map((line) => paintSpans(line, style, tone));

const spaces = (count: number): string => " ".repeat(Math.max(0, count));

/**
 * Paint a value behind a first-line prefix, continuation lines behind `rest`
 * (defaulting to blank space as wide as `first`).
 */
const paintPrefixed = (
  value: Text,
  style: ResolvedStyle,
  options: {
    readonly indent: number;
    readonly first: string;
    readonly rest?: string;
    readonly tone?: Tone;
  },
): ReadonlyArray<string> => {
  const rest = options.rest ?? spaces(displayWidth(options.first));
  const used = options.indent + Math.max(displayWidth(options.first), displayWidth(rest));
  const lines = paintLines(value, remaining(style.width, used), style, options.tone);
  const indent = spaces(options.indent);
  return (lines.length === 0 ? [""] : lines).map(
    (line, index) => `${indent}${index === 0 ? options.first : rest}${line}`,
  );
};

const dim = (value: string, style: ResolvedStyle): string =>
  paintSpans([{ text: value, tone: "dim" }], style);

const statusGlyph = (tone: Tone, glyphs: Glyphs): string | undefined =>
  tone === "neutral" || tone === "dim" ? undefined : glyphs.status[tone];

const isStatus = (mark: Mark): mark is Status =>
  mark === "ok" || mark === "warn" || mark === "error" || mark === "info";

/**
 * The glyph a ledger row's mark paints: a status glyph, a change operation,
 * or — while a unit is still in flight — the spinner frame or the waiting mark.
 */
const markGlyph = (mark: Mark, style: ResolvedStyle): string => {
  if (mark === "working") return style.spinner;
  if (mark === "waiting") return style.glyphs.marks.waiting;
  return isStatus(mark) ? style.glyphs.status[mark] : style.glyphs.change[mark];
};

/** A mark (or none) in the gutter, padded so content starts after it. */
const gutter = (mark: string | undefined): string => {
  const cell = ` ${mark ?? ""}`;
  return `${cell}${spaces(GUTTER_WIDTH - displayWidth(cell))}`;
};

const blankGutter = spaces(GUTTER_WIDTH);

const bold = (value: Text): ReadonlyArray<Span> =>
  (typeof value === "string" ? [{ text: value }] : value).map((span) => ({ ...span, bold: true }));

/**
 * Put an aside at the value column after the last line when the line ends
 * before it, else after a gap when it still fits, else on a line of its own
 * at the value column.
 */
const withAside = (
  lines: ReadonlyArray<string>,
  aside: Text,
  style: ResolvedStyle,
): ReadonlyArray<string> => {
  const painted = paintValue(aside, style, "dim");
  if (painted.length === 0) return lines;
  const last = lines[lines.length - 1];
  if (last !== undefined) {
    const joined = `${last}${spaces(Math.max(COLUMN_GAP, style.valueColumn - displayWidth(last)))}${painted}`;
    if (fits(style.width, joined)) return [...lines.slice(0, -1), joined];
  }
  return [
    ...lines,
    ...paintPrefixed(aside, style, { indent: style.valueColumn, first: "", tone: "dim" }),
  ];
};

/**
 * Append a dim aside to the last line when it fits, else paint it wrapped on
 * lines of its own at `ownLineIndent`.
 */
const withTrailing = (
  lines: ReadonlyArray<string>,
  trailing: Text,
  style: ResolvedStyle,
  ownLineIndent: number,
  options?: { readonly gap?: string; readonly ownLine?: Text },
): ReadonlyArray<string> => {
  const painted = paintValue(trailing, style, "dim");
  if (painted.length === 0) return lines;
  const last = lines[lines.length - 1];
  const joined = last === undefined ? undefined : `${last}${options?.gap ?? "  "}${painted}`;
  if (joined !== undefined && fits(style.width, joined)) return [...lines.slice(0, -1), joined];
  return [
    ...lines,
    ...paintPrefixed(options?.ownLine ?? trailing, style, {
      indent: ownLineIndent,
      first: "",
      tone: "dim",
    }),
  ];
};

// ---------------------------------------------------------------------------
// Tables and change rows
// ---------------------------------------------------------------------------

interface GridSource {
  readonly columns: ReadonlyArray<LayoutColumn>;
  readonly headers: ReadonlyArray<Text>;
  readonly rows: ReadonlyArray<ReadonlyArray<Text>>;
}

const layoutColumn = (
  column: TableColumn | undefined,
  header: Text,
  cells: ReadonlyArray<Text>,
): LayoutColumn => {
  const values = [header, ...cells];
  return {
    headerWidth: displayWidth(visibleText(header)),
    naturalWidth: Math.max(0, ...values.map((value) => displayWidth(visibleText(value)))),
    wordWidth: Math.max(0, ...values.map(longestWordWidth)),
    ...(column?.width === undefined ? {} : { width: column.width }),
    ...(column?.minWidth === undefined ? {} : { minWidth: column.minWidth }),
    priority: column?.priority ?? "preferred",
    align: column?.align ?? "left",
  };
};

const cellAt = (row: ReadonlyArray<Text>, index: number): Text => row[index] ?? "";

interface PaintedCell {
  readonly text: Text;
  readonly width: PaintWidth;
  readonly align: "left" | "right";
  /** Cells the content is indented by inside the column, on every line. */
  readonly lead?: number;
}

/** Paint one row of cells (possibly several lines) behind a first-line prefix. */
const paintCells = (
  cells: ReadonlyArray<PaintedCell>,
  style: ResolvedStyle,
  options: { readonly indent: number; readonly first: string; readonly tone?: Tone },
): ReadonlyArray<string> => {
  const painted = cells.map((cell) => {
    const lead = cell.lead ?? 0;
    const lines = paintLines(cell.text, remaining(cell.width, lead), style, options.tone);
    return lead === 0 ? lines : lines.map((line) => `${spaces(lead)}${line}`);
  });
  const height = Math.max(1, ...painted.map((lines) => lines.length));
  const rest = spaces(displayWidth(options.first));
  return Array.from({ length: height }, (_, lineIndex) => {
    const line = joinGridLine(
      cells.map((cell, position) => ({
        text: painted[position]?.[lineIndex] ?? "",
        width: cell.width === "unbounded" ? 0 : cell.width,
        align: cell.align,
      })),
      COLUMN_GAP,
      padDisplay,
    );
    return `${spaces(options.indent)}${lineIndex === 0 ? options.first : rest}${line}`;
  });
};

const gridCells = (
  layout: Extract<TableLayout, { _tag: "grid" }>,
  cells: ReadonlyArray<Text>,
): ReadonlyArray<PaintedCell> =>
  layout.columns.map((column) => ({
    text: cellAt(cells, column.index),
    width: column.width,
    align: column.align,
  }));

const hiddenColumnsNote = (
  source: GridSource,
  layout: Extract<TableLayout, { _tag: "grid" }>,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> => {
  if (layout.hidden.length === 0) return [];
  const names = layout.hidden.map((index) => visibleText(source.headers[index] ?? "")).join(", ");
  return paintPrefixed(`Not shown at this width: ${names}`, style, {
    indent,
    first: "",
    tone: "dim",
  });
};

/**
 * A table sits behind the gutter: its header and unmarked rows leave the
 * gutter blank, and a row that needs attention puts its status mark there.
 * Stacked rows carry their mark on their first field.
 */
const paintTable = (
  columns: ReadonlyArray<TableColumn>,
  rows: ReadonlyArray<TableRow>,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> => {
  const headers = columns.map((column) => column.header);
  const rowGutter = (row: TableRow): string =>
    row.mark === undefined ? blankGutter : gutter(style.glyphs.status[row.mark]);
  const source: GridSource = {
    headers,
    rows: rows.map((row) => row.cells),
    columns: columns.map((column, index) =>
      layoutColumn(
        column,
        column.header,
        rows.map((row) => cellAt(row.cells, index)),
      ),
    ),
  };
  const layout = layoutTable({
    columns: source.columns,
    available: remaining(style.width, indent + GUTTER_WIDTH),
    gap: COLUMN_GAP,
  });
  if (layout._tag === "stacked") {
    const fieldsStart = indent + GUTTER_WIDTH;
    return rows.flatMap((row, rowIndex) => {
      // A stacked row names only the cells it has; an empty one would be a bare label.
      const [first = "", ...rest] = paintFields(
        columns
          .map((column, index) => ({ label: column.header, value: cellAt(row.cells, index) }))
          .filter((field) => visibleText(field.value).length > 0),
        style,
        {
          indent: fieldsStart,
          valueStart:
            fieldsStart +
            Math.max(0, ...columns.map((column) => displayWidth(visibleText(column.header)))) +
            2,
          gap: 2,
        },
      );
      return [
        ...(rowIndex === 0 ? [] : [""]),
        `${spaces(indent)}${rowGutter(row)}${first.slice(fieldsStart)}`,
        ...rest,
      ];
    });
  }
  return [
    ...paintCells(gridCells(layout, headers), style, {
      indent,
      first: blankGutter,
      tone: "dim",
    }),
    ...rows.flatMap((row) =>
      paintCells(gridCells(layout, row.cells), style, { indent, first: rowGutter(row) }),
    ),
    ...hiddenColumnsNote(source, layout, style, indent + GUTTER_WIDTH),
  ];
};

/**
 * Change rows align every cell but each row's last across the block; the last
 * cell flexes: it paints inline in the width left on its line when that holds
 * its longest word, and otherwise on continuation lines of its own. Below the
 * stacked threshold, or when the aligned cells cannot fit, every cell takes a
 * line.
 */
const paintRows = (
  rows: ReadonlyArray<RowNode>,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> => {
  if (rows.length === 0) return [];
  const glyphs = style.glyphs;
  const columnCount = Math.max(0, ...rows.map((row) => row.cells.length));
  const available = remaining(style.width, indent + GUTTER_WIDTH);
  const columns = Array.from({ length: Math.max(0, columnCount - 1) }, (_, index) =>
    layoutColumn(
      { header: "", priority: "required" },
      "",
      rows.flatMap((row) => (index < row.cells.length - 1 ? [cellAt(row.cells, index)] : [])),
    ),
  );
  const layout = layoutTable({ columns, available, gap: COLUMN_GAP });
  const tailWidth = (row: RowNode): PaintWidth => {
    if (available === "unbounded" || layout._tag !== "grid") return "unbounded";
    const used = layout.columns
      .slice(0, Math.max(0, row.cells.length - 1))
      .reduce((sum, column) => sum + column.width + COLUMN_GAP, 0);
    return Math.max(0, available - used);
  };
  const inlineTail =
    layout._tag === "grid" &&
    rows.every((row) => {
      const tail = row.cells[row.cells.length - 1];
      const width = tailWidth(row);
      return (
        tail === undefined ||
        width === "unbounded" ||
        (width >= FLEX_MIN_WIDTH && width >= longestWordWidth(tail))
      );
    });
  return rows.flatMap((row) => {
    const first = gutter(glyphs.change[row.change]);
    const tail = row.cells[row.cells.length - 1];
    const lines =
      layout._tag !== "grid"
        ? row.cells.flatMap((cell, index) =>
            paintPrefixed(cell, style, { indent, first: index === 0 ? first : blankGutter }),
          )
        : [
            ...paintCells(
              [
                ...gridCells(layout, row.cells.slice(0, -1)).slice(0, row.cells.length - 1),
                ...(tail !== undefined && inlineTail
                  ? [{ text: tail, width: tailWidth(row), align: "left" as const }]
                  : []),
              ],
              style,
              { indent, first },
            ),
            ...(tail !== undefined && !inlineTail
              ? paintPrefixed(tail, style, { indent, first: blankGutter })
              : []),
          ];
    const children =
      row.children === undefined
        ? []
        : paintNodes(row.children, style, indent + GUTTER_WIDTH, indent + GUTTER_WIDTH);
    return [...lines, ...children];
  });
};

// ---------------------------------------------------------------------------
// Ledgers
// ---------------------------------------------------------------------------

/** How deep a nested row's name is indented inside the name column. */
const DEPTH_INDENT = 2;

/** Cells a nested row's name is indented by, inside the name column. */
const depthLead = (row: LedgerRow): number => Math.max(0, row.depth ?? 0) * DEPTH_INDENT;

/**
 * A ledger column as the layout engine sees it. The `name` column is required
 * and keeps the key lane, so the second column starts at the value column; a
 * `fixed` column keeps its natural width; an `elastic` column shrinks first
 * and takes the spare width.
 */
const ledgerColumn = (column: LedgerColumn, cells: ReadonlyArray<Text>): LayoutColumn => {
  const laid = layoutColumn(
    {
      header: column.header,
      priority: column.role === "name" ? "required" : (column.priority ?? "preferred"),
      ...(column.align === undefined ? {} : { align: column.align }),
    },
    column.header,
    cells,
  );
  if (column.role === "name") {
    const naturalWidth = Math.max(laid.naturalWidth, KEY_WIDTH);
    const minWidth = Math.min(naturalWidth, KEY_WIDTH);
    // A name gives way in the middle instead of wrapping, so one long unbroken
    // name never holds the column wider than the key lane.
    return { ...laid, naturalWidth, minWidth, wordWidth: Math.min(laid.wordWidth, minWidth) };
  }
  return column.role === "fixed" ? { ...laid, minWidth: laid.naturalWidth } : laid;
};

/** The fold line: a mark, how many rows it stands for, and how to reveal them. */
const paintFold = (
  fold: LedgerFold,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> => {
  const lines = paintPrefixed(`${String(fold.count)} ${fold.noun}`, style, {
    indent,
    first: gutter(markGlyph(fold.mark, style)),
  });
  return fold.hint === undefined
    ? lines
    : withTrailing(lines, fold.hint, style, indent + GUTTER_WIDTH);
};

/**
 * One ledger: a dim header line, one gutter-marked line per row, and a fold
 * line for the rows that repeat an outcome. Columns after the name start at
 * the value column, so a ledger, its fields, and its answers share one lane.
 *
 * Under width pressure a ledger drops its `optional` columns and then stacks,
 * keeping each row's mark and name on one line with its remaining cells dim
 * beneath; it never drops a column whose value has nowhere else to appear.
 */
const paintLedger = (
  node: LedgerNode,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> => {
  const glyphs = style.glyphs;
  const columns = node.columns.map((column, index) =>
    ledgerColumn(
      column,
      node.rows.map((row) => {
        const cell = cellAt(row.cells, index);
        // A nested name is measured with its indent, so the column holds both.
        return index === 0 && depthLead(row) > 0
          ? `${spaces(depthLead(row))}${visibleText(cell)}`
          : cell;
      }),
    ),
  );
  const layout = layoutTable({
    columns,
    available: remaining(style.width, indent + GUTTER_WIDTH),
    gap: COLUMN_GAP,
    stackBelow: 0,
    droppable: ["optional"],
  });
  const fold = node.folded === undefined ? [] : paintFold(node.folded, style, indent);
  const children = (row: LedgerRow): ReadonlyArray<string> =>
    row.children === undefined
      ? []
      : paintNodes(row.children, style, indent + GUTTER_WIDTH, indent + GUTTER_WIDTH);
  if (layout._tag !== "grid") {
    // Stacked: the mark and the name on one line, the rest dim beneath it.
    return [
      ...node.rows.flatMap((row) => {
        const rest = node.columns
          .flatMap((column, position) =>
            position === 0 || column.priority === "optional" ? [] : [cellAt(row.cells, position)],
          )
          .filter((cell) => visibleText(cell).length > 0);
        return [
          // The mark stays in the gutter; only the name moves under its parent.
          ...paintPrefixed(cellAt(row.cells, 0), style, {
            indent,
            first: `${gutter(markGlyph(row.mark, style))}${spaces(depthLead(row))}`,
          }),
          ...(rest.length === 0
            ? []
            : paintPrefixed(
                rest.flatMap((cell, position) => [
                  ...(position === 0 ? [] : [{ text: glyphs.separator }]),
                  ...(typeof cell === "string" ? [{ text: cell }] : cell),
                ]),
                style,
                { indent: indent + GUTTER_WIDTH + depthLead(row), first: "", tone: "dim" },
              )),
          ...children(row),
        ];
      }),
      ...fold,
    ];
  }
  const headers = node.columns.map((column) => column.header);
  // The name column keeps its scope and last path segment; it is the one cell
  // the painter shortens rather than wraps.
  const shortensName = node.columns[0]?.role === "name" && layout.columns[0]?.index === 0;
  const rowCells = (row: LedgerRow): ReadonlyArray<PaintedCell> => {
    const cells = gridCells(layout, row.cells);
    const lead = depthLead(row);
    const [name, ...rest] = cells;
    if (name === undefined) return cells;
    const shortened =
      shortensName && name.width !== "unbounded"
        ? { ...name, text: truncateText(name.text, name.width - lead, "middle") }
        : name;
    return lead === 0 ? [shortened, ...rest] : [{ ...shortened, lead }, ...rest];
  };
  return [
    ...(headers.some((header) => visibleText(header).length > 0)
      ? paintCells(gridCells(layout, headers), style, {
          indent,
          first: blankGutter,
          tone: "dim",
        })
      : []),
    ...node.rows.flatMap((row) => [
      ...paintCells(rowCells(row), style, {
        indent,
        first: gutter(markGlyph(row.mark, style)),
      }),
      ...children(row),
    ]),
    ...fold,
  ];
};

// ---------------------------------------------------------------------------
// Other nodes
// ---------------------------------------------------------------------------

const actionTarget = (action: SuggestedAction): string => action.cmd ?? action.url ?? "";

const paintTreeItems = (
  items: ReadonlyArray<TreeItem>,
  style: ResolvedStyle,
  prefix: string,
): ReadonlyArray<string> =>
  items.flatMap((item, index) => {
    const last = index === items.length - 1;
    const childPrefix = `${prefix}${last ? style.glyphs.tree.space : style.glyphs.tree.pipe}`;
    const lines = paintPrefixed(item.text, style, {
      indent: 0,
      first: `${prefix}${last ? style.glyphs.tree.last : style.glyphs.tree.branch}`,
      rest: childPrefix,
    });
    const detailed =
      item.detail === undefined
        ? lines
        : withTrailing(lines, item.detail, style, displayWidth(childPrefix));
    return [
      ...detailed,
      ...(item.children === undefined ? [] : paintTreeItems(item.children, style, childPrefix)),
    ];
  });

/**
 * Label–value pairs with each value starting at `valueStart`. A label that
 * leaves less than `gap` cells before it, or a value whose longest word cannot
 * fit beside it or that would get less than a short line, moves the value
 * below the label instead of splitting it. Unbounded output never moves a
 * value: a long label pushes its own value right instead.
 */
const paintFields = (
  fields: ReadonlyArray<{ readonly label: Text; readonly value: Text }>,
  style: ResolvedStyle,
  options: { readonly indent: number; readonly valueStart: number; readonly gap: number },
): ReadonlyArray<string> => {
  const { indent, gap } = options;
  const valueWidth = remaining(style.width, options.valueStart);
  return fields.flatMap((field) => {
    const labelWidth = displayWidth(visibleText(field.label));
    const valueStart = Math.max(options.valueStart, indent + labelWidth + gap);
    return valueWidth !== "unbounded" &&
      (valueStart > options.valueStart ||
        valueWidth < MIN_FIELD_VALUE_WIDTH ||
        longestWordWidth(field.value) > valueWidth)
      ? [
          ...paintPrefixed(field.label, style, { indent, first: "", tone: "dim" }),
          ...paintPrefixed(field.value, style, { indent: indent + 2, first: "" }),
        ]
      : paintPrefixed(field.value, style, {
          indent,
          first: padDisplay(paintValue(field.label, style, "dim"), valueStart - indent),
          rest: spaces(valueStart - indent),
        });
  });
};

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

const spansWidth = (spans: ReadonlyArray<Span>): number => displayWidth(visibleText(spans));

/**
 * The line being typed, behind the caret. An empty line is the caret alone,
 * so the question line never ends in a space.
 */
const entrySpans = (entry: Text, style: ResolvedStyle): ReadonlyArray<Span> =>
  visibleText(entry).length === 0
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
  const questionWidth = displayWidth(visibleText(node.question));
  const room = (used: number): boolean => style.width === "unbounded" || used <= style.width;
  const alone = paintPrefixed(question, style, { indent, first });
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
      : [...alone, ...paintPrefixed(entry, style, { indent: contentStart, first: "" })];
  }
  if (node.chips.length === 0) return alone;
  const worded = chipsSpans(node.chips, true);
  const chips = room(contentStart + spansWidth(worded)) ? worded : chipsSpans(node.chips, false);
  return room(contentStart + questionWidth + COLUMN_GAP + spansWidth(worded))
    ? [
        `${spaces(indent)}${first}${paintSpans(question, style)}${spaces(COLUMN_GAP)}${paintSpans(worded, style)}`,
      ]
    : [...alone, `${spaces(contentStart)}${paintSpans(chips, style)}`];
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
    : truncateText(option.title, Math.max(1, style.width - start), "middle");

/** An option's details joined by the painter's own separator. */
const optionDetails = (option: PromptOption, style: ResolvedStyle): ReadonlyArray<Span> =>
  (option.details ?? []).flatMap((detail, index) => [
    ...(index === 0 ? [] : [{ text: style.glyphs.separator }]),
    ...spansOf(detail),
  ]);

/** Where an option's details start: the value column, unless its title reaches past it. */
const detailsStart = (title: Text, style: ResolvedStyle, start: number): number =>
  Math.max(style.valueColumn, start + displayWidth(visibleText(title)) + COLUMN_GAP);

/**
 * One option on one line: the caret in the gutter where it stands, its mark
 * when the question takes several, the title, and — when the list shows
 * details at all — its details dim at the value column. The option the caret
 * stands on is tinted, mark and title together. A title too long for the line
 * shortens in the middle.
 */
const paintOption = (
  option: PromptOption,
  style: ResolvedStyle,
  indent: number,
  withDetails: boolean,
): string => {
  const tone: Tone | undefined = option.current === true ? "info" : undefined;
  const lead = optionLead(option, style, indent);
  const start = lead.width;
  const title = optionTitle(option, style, start);
  const line = `${lead.caret}${lead.mark.length === 0 ? "" : paintSpans([{ text: lead.mark }], style, tone)}${paintValue(title, style, tone)}`;
  const details = optionDetails(option, style);
  if (!withDetails || details.length === 0) return line;
  const gap = detailsStart(title, style, start) - start - displayWidth(visibleText(title));
  return `${line}${spaces(gap)}${paintSpans(details, style, "dim")}`;
};

/** The dim line that names how many options a list leaves out on one side. */
const paintSkipped = (
  arrow: string,
  count: number,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> =>
  paintPrefixed(`${arrow} ${String(count)} more`, style, {
    indent: indent + GUTTER_WIDTH,
    first: "",
    tone: "dim",
  });

/** One key as the hint names it, with its word or, where the line is short, without. */
const keyText = (key: PromptKey, style: ResolvedStyle, worded: boolean): string => {
  const name =
    key.key === "arrows" ? `${style.glyphs.arrows.up}${style.glyphs.arrows.down}` : key.key;
  return worded ? `${name} ${key.word}` : name;
};

/**
 * The line beneath a list. The whole hint when it fits; then without the
 * arrows, and with named keys such as `space` standing alone; then its status
 * alone.
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
      .filter((key) => key.key !== "arrows")
      .map((key) => keyText(key, style, key.key.length < NAMED_KEY_LENGTH)),
  ];
  const joined = (parts: ReadonlyArray<string>): string => parts.join(style.glyphs.separator);
  const fitting =
    [full, short].find((parts) => fits(style.width, `${spaces(indent)}${joined(parts)}`)) ??
    hint.status;
  return paintPrefixed(joined(fitting), style, { indent, first: "", tone: "dim" });
};

/**
 * A question and what answers it: its question line, a dim note beneath it,
 * and — for a question whose answers need reading — the options that fit,
 * with a line naming how many it left out above and below, and the hint
 * beneath the list. Options show their details only when every option's fit
 * whole: a list whose details come and go row by row would read as options
 * that have none, so a narrow list drops them all before it touches a title.
 */
const paintPrompt = (
  node: PromptNode,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> => {
  const contentStart = indent + GUTTER_WIDTH;
  const options = node.options ?? [];
  const withDetails = options.every((option) => {
    const start = optionLead(option, style, indent).width;
    const title = optionTitle(option, style, start);
    return (
      style.width === "unbounded" ||
      detailsStart(title, style, start) + spansWidth(optionDetails(option, style)) <= style.width
    );
  });
  return [
    ...paintQuestion(node, style, indent),
    ...(node.note === undefined
      ? []
      : paintPrefixed(node.note, style, { indent: contentStart, first: "", tone: "dim" })),
    ...options.flatMap((option) => [
      ...(option.before === undefined || option.before <= 0
        ? []
        : paintSkipped(style.glyphs.arrows.up, option.before, style, indent)),
      paintOption(option, style, indent, withDetails),
    ]),
    ...(node.more === undefined || node.more <= 0
      ? []
      : paintSkipped(style.glyphs.arrows.down, node.more, style, indent)),
    ...(node.hint === undefined ? [] : paintHint(node.hint, style, indent)),
  ];
};

/**
 * A wait standing open: the running mark, what is being waited on, how long is
 * left at the value column, and the keys beneath it. The line never carries a
 * value a person copies — the wait printed those to the transcript once — so
 * it is safe to repaint and truncate.
 */
const paintWait = (node: WaitNode, style: ResolvedStyle, indent: number): ReadonlyArray<string> => {
  const contentStart = indent + GUTTER_WIDTH;
  const status = paintPrefixed(node.status, style, {
    indent,
    first: gutter(markGlyph("working", style)),
  });
  const lines = node.remaining === undefined ? status : withAside(status, node.remaining, style);
  if (node.chips.length === 0) return lines;
  const worded = chipsSpans(node.chips, true);
  const chips =
    style.width === "unbounded" || contentStart + spansWidth(worded) <= style.width
      ? worded
      : chipsSpans(node.chips, false);
  return [...lines, `${spaces(contentStart)}${paintSpans(chips, style)}`];
};

/** Nodes that carry marked rows; a headline after one is their verdict. */
const isMarkedRows = (node: DocNode): boolean =>
  node._tag === "row" ||
  node._tag === "rows" ||
  node._tag === "collapsed" ||
  node._tag === "ledger";

/**
 * Where a node paints: `mark` is the column its gutter starts at, and
 * `content` is where a node without a mark starts. They differ inside a titled
 * section, whose unmarked children sit at the content column while marked
 * children keep their marks in the gutter below the title.
 */
interface Placement {
  readonly mark: number;
  readonly content: number;
  readonly afterChangeRows: boolean;
}

const paintNode = (
  node: DocNode,
  style: ResolvedStyle,
  placement: Placement,
): ReadonlyArray<string> => {
  const glyphs = style.glyphs;
  const { mark: indent, content } = placement;
  switch (node._tag) {
    case "headline": {
      const mark = statusGlyph(node.tone, glyphs);
      if (mark === undefined || placement.afterChangeRows) {
        // A title carries no mark, and a verdict leaves status to the rows above it.
        const lines = paintPrefixed(
          placement.afterChangeRows && mark !== undefined ? bold(node.text) : node.text,
          style,
          { indent: content, first: "", tone: node.tone },
        );
        return node.aside === undefined
          ? lines
          : withTrailing(lines, node.aside, style, content + 2);
      }
      const lines = paintPrefixed(node.text, style, {
        indent,
        first: gutter(mark),
        tone: node.tone,
      });
      return node.aside === undefined ? lines : withAside(lines, node.aside, style);
    }
    case "paragraph":
      return paintPrefixed(node.text, style, {
        indent: content,
        first: "",
        ...(node.tone === undefined ? {} : { tone: node.tone }),
      });
    case "row":
      return paintRows([node], style, indent);
    case "rows":
      return paintRows(node.rows, style, indent);
    case "collapsed": {
      const lines = paintPrefixed(`${String(node.count)} ${node.noun}`, style, {
        indent,
        first: gutter(glyphs.change[node.change]),
      });
      return node.hint === undefined
        ? lines
        : withTrailing(lines, node.hint, style, indent + GUTTER_WIDTH);
    }
    case "ledger":
      return paintLedger(node, style, indent);
    case "prompt":
      return paintPrompt(node, style, indent);
    case "wait":
      return paintWait(node, style, indent);
    case "answer": {
      // A settled prompt reads as one record line: the question behind a mark,
      // its answer at the value column, and the answer below when it cannot fit.
      const mark = node.mark === "ok" ? statusGlyph("ok", glyphs) : undefined;
      const tone: Tone | undefined = node.mark === "dim" ? "dim" : undefined;
      const toned = tone === undefined ? {} : { tone };
      const labelStart = indent + GUTTER_WIDTH;
      const valueStart = Math.max(
        style.valueColumn,
        labelStart + displayWidth(visibleText(node.label)) + COLUMN_GAP,
      );
      const valueWidth = remaining(style.width, valueStart);
      return valueWidth !== "unbounded" &&
        (valueStart > style.valueColumn ||
          valueWidth < MIN_FIELD_VALUE_WIDTH ||
          longestWordWidth(node.value) > valueWidth)
        ? [
            ...paintPrefixed(node.label, style, { indent, first: gutter(mark), ...toned }),
            ...paintPrefixed(node.value, style, { indent: labelStart + 2, first: "", ...toned }),
          ]
        : paintPrefixed(node.value, style, {
            indent,
            first: `${gutter(mark)}${padDisplay(paintValue(node.label, style, tone), valueStart - labelStart)}`,
            rest: spaces(valueStart - indent),
            ...toned,
          });
    }
    case "callout": {
      const title = paintPrefixed(node.title, style, {
        indent,
        first: gutter(statusGlyph(node.tone, glyphs)),
        tone: node.tone,
      });
      const children =
        node.children === undefined
          ? []
          : paintNodes(node.children, style, indent + GUTTER_WIDTH, indent + GUTTER_WIDTH);
      return [
        ...(node.aside === undefined ? title : withAside(title, node.aside, style)),
        ...children,
      ];
    }
    case "table": {
      const caption =
        node.caption === undefined
          ? []
          : paintPrefixed(node.caption, style, { indent: content, first: "" });
      return [...caption, ...paintTable(node.columns, node.rows, style, indent)];
    }
    case "fields":
      // Fields sit at the content column, never left of it, with values at the value column.
      return paintFields(node.fields, style, {
        indent: Math.max(content, GUTTER_WIDTH),
        valueStart: style.valueColumn,
        gap: COLUMN_GAP,
      });
    case "tree":
      return paintTreeItems(node.roots, style, spaces(content));
    case "next":
      return [
        `${spaces(content)}${dim("Next", style)}`,
        ...node.actions.flatMap((action) => {
          // A next command or URL is copied and run, so it is never cut: it
          // takes a line of its own and overflows rather than wrap.
          const targetText = actionTarget(action);
          const target: ReadonlyArray<Span> = [{ text: targetText, copyable: true }];
          const lines = paintPrefixed(action.description, style, {
            indent: content + 2,
            first: "",
          });
          return targetText.length === 0
            ? lines
            : withTrailing(
                lines,
                [{ text: glyphs.separator.trimStart() }, ...target],
                style,
                content + 4,
                { gap: " ", ownLine: target },
              );
        }),
      ];
    case "summary": {
      const elapsed =
        node.elapsedMs === undefined ? "" : ` in ${Math.max(0, node.elapsedMs / 1000).toFixed(1)}s`;
      const parts: ReadonlyArray<Span> = node.parts.flatMap((part, index) => [
        ...(index === 0 ? [] : [{ text: glyphs.separator }]),
        ...(typeof part.text === "string" ? [{ text: part.text }] : part.text),
      ]);
      return paintPrefixed([...parts, { text: elapsed }], style, {
        indent: content,
        first: "",
        ...(node.tone === undefined ? {} : { tone: node.tone }),
      });
    }
    case "section":
      return node.title === undefined
        ? paintNodes(node.children, style, indent, content)
        : [
            ...paintPrefixed(node.title, style, { indent: content, first: "", tone: "dim" }),
            ...paintNodes(node.children, style, content, content + GUTTER_WIDTH),
          ];
    case "markdown":
    case "raw":
      return node.content.split("\n").map((line) => `${spaces(content)}${line}`);
    case "blank":
      return [""];
  }
};

const paintNodes = (
  doc: Doc,
  style: ResolvedStyle,
  mark: number,
  content: number,
): ReadonlyArray<string> =>
  doc.flatMap((node, index) =>
    paintNode(node, style, {
      mark,
      content,
      afterChangeRows: doc.slice(0, index).some(isMarkedRows),
    }),
  );

const resolveStyle = (style: PaintStyle): ResolvedStyle => {
  const width = style.width === "unbounded" ? "unbounded" : Math.max(20, style.width);
  const preferred = GUTTER_WIDTH + KEY_WIDTH + COLUMN_GAP;
  const glyphs = style.glyphs ?? unicodeGlyphs;
  return {
    width,
    colors: style.colors,
    glyphs,
    spinner: style.spinner ?? glyphs.spinner[0] ?? "",
    valueColumn:
      width === "unbounded"
        ? preferred
        : Math.max(GUTTER_WIDTH, Math.min(preferred, Math.floor(width / 2))),
  };
};

export const paintText = (doc: Doc, style: PaintStyle): ReadonlyArray<string> =>
  paintNodes(doc, resolveStyle(style), 0, 0);

/** Paint one already laid-out line of spans without wrapping or padding. */
export const paintInline = (value: Text, style: PaintStyle): string =>
  paintValue(value, resolveStyle(style));
