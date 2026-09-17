import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import type {
  Change,
  Doc,
  DocNode,
  LedgerColumn,
  LedgerFold,
  LedgerNode,
  LedgerRow,
  RowNode,
  Span,
  Status,
  TableColumn,
  Text,
  Tone,
  TreeItem,
} from "./doc.js";
import { joinGridLine, layoutTable, type LayoutColumn, type TableLayout } from "./table-layout.js";
import { displayWidth, padDisplay } from "./width.js";
import { longestWordWidth, truncateText, visibleText, wrapText } from "./wrap-text.js";

const ESC = "\u001b[";
const RESET = `${ESC}0m`;
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

export interface Glyphs {
  readonly status: Readonly<Record<Exclude<Tone, "neutral" | "dim">, string>>;
  readonly change: Readonly<Record<Change, string>>;
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
    remove: "–",
    unchanged: "=",
    blocked: "▲",
    failed: "×",
    "rolled-back": "↶",
  },
  tree: { branch: "├─ ", last: "└─ ", pipe: "│  ", space: "   " },
  separator: " · ",
};

/** Seven-bit glyphs for terminals and locales without Unicode symbol support. */
export const asciiGlyphs: Glyphs = {
  status: { ok: "+", warn: "!", error: "x", info: "*" },
  change: {
    create: "+",
    update: "~",
    remove: "-",
    unchanged: "=",
    blocked: "!",
    failed: "x",
    "rolled-back": "<",
  },
  tree: { branch: "|- ", last: "`- ", pipe: "|  ", space: "   " },
  separator: " - ",
};

/** `"unbounded"` paints natural widths: no wrapping, truncation, or padding to a terminal width. */
export type PaintWidth = number | "unbounded";

export interface PaintStyle {
  readonly width: PaintWidth;
  readonly colors: boolean;
  readonly glyphs?: Glyphs;
}

interface ResolvedStyle {
  readonly width: PaintWidth;
  readonly colors: boolean;
  readonly glyphs: Glyphs;
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

const styleSpan = (span: Span, colors: boolean): string => {
  if (!colors) return span.text;
  const prefix = `${span.bold === true ? `${ESC}1m` : ""}${toneCodes[span.tone ?? "neutral"]}`;
  const linked =
    span.link === undefined
      ? span.text
      : `\u001b]8;;${span.link}\u001b\\${span.text}\u001b]8;;\u001b\\`;
  return prefix.length === 0 ? linked : `${prefix}${linked}${RESET}`;
};

const paintSpans = (spans: ReadonlyArray<Span>, style: ResolvedStyle, inherited?: Tone): string =>
  spans
    .map((span) => {
      const tone = span.tone ?? inherited;
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

const isStatus = (mark: Change | Status): mark is Status =>
  mark === "ok" || mark === "warn" || mark === "error" || mark === "info";

/** The glyph a ledger row's mark paints: a status glyph or a change operation. */
const markGlyph = (mark: Change | Status, glyphs: Glyphs): string =>
  isStatus(mark) ? glyphs.status[mark] : glyphs.change[mark];

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

const paintTable = (
  columns: ReadonlyArray<TableColumn>,
  rows: ReadonlyArray<ReadonlyArray<Text>>,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> => {
  const headers = columns.map((column) => column.header);
  const source: GridSource = {
    headers,
    rows,
    columns: columns.map((column, index) =>
      layoutColumn(
        column,
        column.header,
        rows.map((row) => cellAt(row, index)),
      ),
    ),
  };
  const layout = layoutTable({
    columns: source.columns,
    available: remaining(style.width, indent),
    gap: COLUMN_GAP,
  });
  if (layout._tag === "stacked") {
    return rows.flatMap((row, rowIndex) => [
      ...(rowIndex === 0 ? [] : [""]),
      ...paintFields(
        columns.map((column, index) => ({ label: column.header, value: cellAt(row, index) })),
        style,
        {
          indent,
          valueStart:
            indent +
            Math.max(0, ...columns.map((column) => displayWidth(visibleText(column.header)))) +
            2,
          gap: 2,
        },
      ),
    ]);
  }
  return [
    ...paintCells(gridCells(layout, headers), style, { indent, first: "", tone: "dim" }),
    ...rows.flatMap((row) => paintCells(gridCells(layout, row), style, { indent, first: "" })),
    ...hiddenColumnsNote(source, layout, style, indent),
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
    first: gutter(markGlyph(fold.mark, style.glyphs)),
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
            first: `${gutter(markGlyph(row.mark, glyphs))}${spaces(depthLead(row))}`,
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
        first: gutter(markGlyph(row.mark, glyphs)),
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
      return [
        ...caption,
        ...paintTable(node.columns, node.rows, style, content + (caption.length === 0 ? 0 : 2)),
      ];
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
  return {
    width,
    colors: style.colors,
    glyphs: style.glyphs ?? unicodeGlyphs,
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
