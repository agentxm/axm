import { plain } from "./doc.js";
import type {
  Doc,
  LedgerColumn,
  LedgerFold,
  LedgerNode,
  LedgerRow,
  Mark,
  TableColumn,
  TableRow,
  Text,
  Tone,
} from "./doc.js";
import {
  COLUMN_GAP,
  GUTTER_WIDTH,
  MIN_FIELD_VALUE_WIDTH,
  blankGutter,
  gutter,
  markGlyph,
  paintLines,
  paintPrefixed,
  paintValue,
  remaining,
  spaces,
  withSupplement,
  type ResolvedStyle,
  type PaintWidth,
} from "./paint-kit.js";
import { joinGridLine, layoutTable, type LayoutColumn, type TableLayout } from "./table-layout.js";
import type { Glyphs } from "./glyphs.js";
import { displayWidth, padDisplay } from "./width.js";
import { longestWordWidth, spansOf, truncateText } from "./wrap-text.js";

/**
 * Label–value pairs with each value starting at `valueStart`. A label that
 * leaves less than `gap` cells before it, or a value whose longest word cannot
 * fit beside it or that would get less than a short line, moves the value
 * below the label instead of splitting it. Unbounded output never moves a
 * value: a long label pushes its own value right instead.
 */
export const paintFields = (
  fields: ReadonlyArray<{ readonly label: Text; readonly value: Text }>,
  style: ResolvedStyle,
  options: { readonly indent: number; readonly valueStart: number; readonly gap: number },
): ReadonlyArray<string> => {
  const { indent, gap } = options;
  const valueWidth = remaining(style.width, options.valueStart);
  return fields.flatMap((field) => {
    const labelWidth = displayWidth(plain(field.label));
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
// Tables and ledgers
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
    headerWidth: displayWidth(plain(header)),
    naturalWidth: Math.max(0, ...values.map((value) => displayWidth(plain(value)))),
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
  const names = layout.hidden.map((index) => plain(source.headers[index] ?? "")).join(", ");
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
export const paintTable = (
  columns: ReadonlyArray<TableColumn>,
  rows: ReadonlyArray<TableRow>,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> => {
  const headers = columns.map((column) => column.header);
  const rowGutter = (row: TableRow): string =>
    row.mark === undefined ? blankGutter : gutter(style.glyphs.outcomes[row.mark]);
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
    stackBelow: style.width === "unbounded" ? 0 : Math.max(0, 40 - indent - GUTTER_WIDTH),
  });
  if (layout._tag === "stacked") {
    const fieldsStart = indent + GUTTER_WIDTH;
    return rows.flatMap((row, rowIndex) => {
      // A stacked row names only the cells it has; an empty one would be a bare label.
      if (row.cells.every((cell) => plain(cell).length === 0)) return [];
      const [first = "", ...rest] = paintFields(
        columns
          .map((column, index) => ({ label: column.header, value: cellAt(row.cells, index) }))
          .filter((field) => plain(field.value).length > 0),
        style,
        {
          indent: fieldsStart,
          valueStart:
            fieldsStart +
            Math.max(0, ...columns.map((column) => displayWidth(plain(column.header)))) +
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
const ledgerColumn = (
  column: LedgerColumn,
  cells: ReadonlyArray<Text>,
  nameLaneWidth: number,
): LayoutColumn => {
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
    const naturalWidth = Math.max(laid.naturalWidth, nameLaneWidth);
    const minWidth = Math.min(naturalWidth, nameLaneWidth);
    // A name gives way in the middle instead of wrapping, so one long unbroken
    // name never holds the column wider than the key lane.
    return {
      ...laid,
      naturalWidth,
      minWidth,
      width: nameLaneWidth,
      wordWidth: Math.min(laid.wordWidth, minWidth),
    };
  }
  return column.role === "fixed" ? { ...laid, minWidth: laid.naturalWidth } : laid;
};

/**
 * The tone a reason takes: its own row's mark, so the line and the mark above
 * it make one claim. A row that simply never ran states a fact rather than a
 * failure, so it reads as an aside.
 */
const reasonTone = (mark: Mark): Tone => {
  switch (mark) {
    case "failed":
    case "error":
      return "error";
    case "blocked":
    case "rolled-back":
    case "warn":
      return "warn";
    default:
      return "dim";
  }
};

/**
 * The cells of the columns the grid could not lay out, beneath the row they
 * belong to. A value that does not fit beside its row moves under it; it never
 * leaves the document. One hidden column needs no label — the value is the
 * only thing missing — and several are named so a reader knows which is which.
 */
const relocatedText = (
  row: LedgerRow,
  hidden: ReadonlyArray<number>,
  headers: ReadonlyArray<Text>,
  glyphs: Glyphs,
): Text => {
  const shown = hidden.flatMap((index) => {
    const cell = cellAt(row.cells, index);
    return plain(cell).length === 0 ? [] : [{ header: plain(headers[index] ?? ""), cell }];
  });
  const [only] = shown;
  if (only === undefined) return "";
  if (shown.length === 1) return only.cell;
  return shown.flatMap((part, position) => [
    ...(position === 0 ? [] : [{ text: glyphs.separator }]),
    ...(part.header.length === 0 ? [] : [{ text: `${part.header}  ` }]),
    ...spansOf(part.cell),
  ]);
};

const paintRelocated = (
  row: LedgerRow,
  hidden: ReadonlyArray<number>,
  headers: ReadonlyArray<Text>,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> => {
  const text = relocatedText(row, hidden, headers, style.glyphs);
  return plain(text).length === 0
    ? []
    : paintPrefixed(text, style, { indent: indent + GUTTER_WIDTH, first: "", tone: "dim" });
};

/**
 * Why a row did not settle as planned, at the content column beneath it. It is
 * painted whatever the layout did to the columns, because the reason is the
 * one value a reader cannot recover from anywhere else.
 */
const paintReason = (
  row: LedgerRow,
  style: ResolvedStyle,
  indent: number,
): ReadonlyArray<string> =>
  row.reason === undefined || plain(row.reason).length === 0
    ? []
    : paintPrefixed(row.reason, style, {
        indent: indent + GUTTER_WIDTH,
        first: "",
        tone: reasonTone(row.mark),
      });

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
    : withSupplement(lines, fold.hint, style, indent + GUTTER_WIDTH);
};

/**
 * One ledger: a dim header line, one gutter-marked line per row, and a fold
 * line for each group of rows that repeat an outcome. Columns after the name
 * start at the value column, so a ledger, its fields, and its answers share
 * one lane.
 *
 * Under width pressure a ledger wraps its cells, then drops its `optional`
 * columns, then stacks each row into its mark and name with its remaining
 * values dim beneath. A value a dropped column held is repainted under its own
 * row, and a row's reason is painted there whatever the layout chose, so width
 * moves what a ledger carries and never removes it.
 */
export const paintLedger = (
  node: LedgerNode,
  style: ResolvedStyle,
  indent: number,
  paintChildren: (
    doc: Doc,
    style: ResolvedStyle,
    mark: number,
    content: number,
  ) => ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const glyphs = style.glyphs;
  const nameLaneWidth = Math.max(1, style.valueColumn - indent - GUTTER_WIDTH - COLUMN_GAP);
  const columns = node.columns.map((column, index) =>
    ledgerColumn(
      column,
      node.rows.map((row) => {
        const cell = cellAt(row.cells, index);
        // A nested name is measured with its indent, so the column holds both.
        return index === 0 && depthLead(row) > 0 ? `${spaces(depthLead(row))}${plain(cell)}` : cell;
      }),
      nameLaneWidth,
    ),
  );
  const layout = layoutTable({
    columns,
    available: remaining(style.width, indent + GUTTER_WIDTH),
    gap: COLUMN_GAP,
    stackBelow: 0,
    droppable: ["optional"],
    wrapBeforeDrop: true,
  });
  const fold = (node.folds ?? []).flatMap((each) => paintFold(each, style, indent));
  const children = (row: LedgerRow): ReadonlyArray<string> =>
    row.children === undefined
      ? []
      : paintChildren(row.children, style, indent + GUTTER_WIDTH, indent + GUTTER_WIDTH);
  if (layout._tag !== "grid") {
    // Stacked: the mark and the name on one line, the rest dim beneath it.
    return [
      ...node.rows.flatMap((row) => {
        // A stacked row keeps every value it has, optional columns included:
        // there is no narrower layout left for one of them to move to.
        const rest = node.columns
          .flatMap((_column, position) => (position === 0 ? [] : [cellAt(row.cells, position)]))
          .filter((cell) => plain(cell).length > 0);
        return [
          // The mark stays in the gutter; only the name moves under its parent.
          ...paintPrefixed(
            style.width === "unbounded"
              ? cellAt(row.cells, 0)
              : truncateText(
                  cellAt(row.cells, 0),
                  Math.max(1, style.width - indent - GUTTER_WIDTH - depthLead(row)),
                  "middle",
                  style.glyphs.ellipsis,
                ),
            style,
            {
              indent,
              first: `${gutter(markGlyph(row.mark, style))}${spaces(depthLead(row))}`,
            },
          ),
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
          ...paintReason(row, style, indent),
          ...children(row),
        ];
      }),
      ...fold,
    ];
  }
  const headers = node.columns.map((column) => column.header);
  const headerCells = gridCells(layout, headers);
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
        ? {
            ...name,
            text: truncateText(name.text, name.width - lead, "middle", style.glyphs.ellipsis),
          }
        : name;
    return lead === 0 ? [shortened, ...rest] : [{ ...shortened, lead }, ...rest];
  };
  return [
    ...(headerCells.some((header) => plain(header.text).length > 0)
      ? paintCells(headerCells, style, {
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
      ...paintRelocated(row, layout.hidden, headers, style, indent),
      ...paintReason(row, style, indent),
      ...children(row),
    ]),
    ...fold,
  ];
};
