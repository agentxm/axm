/**
 * Alternative painter — the optionality spike, not a product feature.
 *
 * A second renderer with a different visual language (rules under headlines
 * and table headers, bar-prefixed callouts, separator-delimited columns,
 * colon-joined fields) wired behind the same `Doc` seam as the production
 * painter and run through the same conformance suite. It exists to prove
 * that the seam carries a renderer swap; nothing in the CLI wires it in.
 */

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import type { Doc, DocNode, RowNode, Span, TableColumn, Text, Tone, TreeItem } from "../doc.js";
import { unicodeGlyphs, type Glyphs, type PaintStyle, type PaintWidth } from "../paint-text.js";
import { layoutTable, type LayoutColumn, type TableLayout } from "../table-layout.js";
import { displayWidth, padDisplay } from "../width.js";
import { longestWordWidth, visibleText, wrapText } from "../wrap-text.js";

const ESC = "\u001b[";
const RESET = `${ESC}0m`;
const GAP = 3;

interface Style {
  readonly width: PaintWidth;
  readonly colors: boolean;
  readonly glyphs: Glyphs;
  readonly box: { readonly rule: string; readonly bar: string; readonly separator: string };
}

const toneCodes: Readonly<Record<Tone, string>> = {
  neutral: "",
  ok: `${ESC}32m`,
  warn: `${ESC}33m`,
  error: `${ESC}31m`,
  info: `${ESC}36m`,
  dim: `${ESC}2m`,
};

const paintSpans = (spans: ReadonlyArray<Span>, style: Style, tone?: Tone): string =>
  spans
    .map((span) => {
      const code = `${span.bold === true ? `${ESC}1m` : ""}${toneCodes[span.tone ?? tone ?? "neutral"]}`;
      return style.colors && code.length > 0 ? `${code}${span.text}${RESET}` : span.text;
    })
    .join("");

const spaces = (count: number): string => " ".repeat(Math.max(0, count));

const room = (width: PaintWidth, used: number): PaintWidth =>
  width === "unbounded" ? "unbounded" : Math.max(1, width - used);

/** Wrap a value behind a prefix; continuation lines get a blank prefix of the same width. */
const block = (
  value: Text,
  style: Style,
  indent: number,
  prefix: string,
  tone?: Tone,
  rest = spaces(displayWidth(prefix)),
): ReadonlyArray<string> => {
  const lines = wrapText(value, room(style.width, indent + displayWidth(prefix)));
  return (lines.length === 0 ? [[]] : lines).map(
    (line, index) =>
      `${spaces(indent)}${index === 0 ? prefix : rest}${paintSpans(line, style, tone)}`,
  );
};

const rule = (style: Style, indent: number, length: number): string =>
  `${spaces(indent)}${paintSpans([{ text: style.box.rule.repeat(Math.max(1, style.width === "unbounded" ? length : Math.min(length, style.width - indent))) }], style, "dim")}`;

const column = (header: Text, cells: ReadonlyArray<Text>, spec?: TableColumn): LayoutColumn => {
  const values = [header, ...cells];
  return {
    headerWidth: displayWidth(visibleText(header)),
    naturalWidth: Math.max(0, ...values.map((value) => displayWidth(visibleText(value)))),
    wordWidth: Math.max(0, ...values.map(longestWordWidth)),
    ...(spec?.width === undefined ? {} : { width: spec.width }),
    ...(spec?.minWidth === undefined ? {} : { minWidth: spec.minWidth }),
    priority: spec?.priority ?? "required",
    align: spec?.align ?? "left",
  };
};

/** Paint one grid row as separator-joined, wrapped cells behind a prefix. */
const gridRow = (
  layout: Extract<TableLayout, { _tag: "grid" }>,
  cells: ReadonlyArray<Text>,
  style: Style,
  indent: number,
  prefix: string,
  tone?: Tone,
): ReadonlyArray<string> => {
  const painted = layout.columns.map((entry) =>
    wrapText(cells[entry.index] ?? "", entry.width).map((line) => paintSpans(line, style, tone)),
  );
  const height = Math.max(1, ...painted.map((lines) => lines.length));
  const joiner = paintSpans([{ text: ` ${style.box.separator} ` }], style, "dim");
  return Array.from({ length: height }, (_, row) => {
    const segments = layout.columns.map((entry, position) => painted[position]?.[row] ?? "");
    // Trailing empty cells (a short row, or a continuation line) end the line
    // early so no separator or padding trails past the last visible cell.
    const lastVisible = segments.reduce(
      (last, text, position) => (visibleText(text).length > 0 ? position : last),
      -1,
    );
    const line = layout.columns
      .slice(0, lastVisible + 1)
      .map((entry, position) =>
        position === lastVisible
          ? (segments[position] ?? "")
          : padDisplay(segments[position] ?? "", entry.width, entry.align),
      )
      .join(joiner);
    return `${spaces(indent)}${row === 0 ? prefix : spaces(displayWidth(prefix))}${line}`.replace(
      /\s+$/u,
      "",
    );
  });
};

const paintTable = (
  columns: ReadonlyArray<TableColumn>,
  rows: ReadonlyArray<ReadonlyArray<Text>>,
  style: Style,
  indent: number,
): ReadonlyArray<string> => {
  const headers = columns.map((entry) => entry.header);
  const layout = layoutTable({
    columns: columns.map((spec, index) =>
      column(
        spec.header,
        rows.map((row) => row[index] ?? ""),
        spec,
      ),
    ),
    available: room(style.width, indent),
    gap: GAP,
  });
  if (layout._tag === "stacked") {
    return rows.flatMap((row, rowIndex) => [
      ...(rowIndex === 0 ? [] : [rule(style, indent, 8)]),
      ...columns.flatMap((spec, index) =>
        block(
          row[index] ?? "",
          style,
          indent,
          `${paintSpans([{ text: `${visibleText(spec.header)}: ` }], style, "dim")}`,
        ),
      ),
    ]);
  }
  const width =
    layout.columns.reduce((sum, entry) => sum + entry.width, 0) + GAP * (layout.columns.length - 1);
  const hidden = layout.hidden.map((index) => visibleText(headers[index] ?? "")).join(", ");
  return [
    ...gridRow(layout, headers, style, indent, "", "dim"),
    rule(style, indent, width),
    ...rows.flatMap((row) => gridRow(layout, row, style, indent, "")),
    ...(hidden.length === 0 ? [] : block(`Hidden: ${hidden}`, style, indent, "", "dim")),
  ];
};

const paintRows = (
  rows: ReadonlyArray<RowNode>,
  style: Style,
  indent: number,
): ReadonlyArray<string> => {
  const count = Math.max(0, ...rows.map((row) => row.cells.length));
  const layout = layoutTable({
    columns: Array.from({ length: count }, (_, index) =>
      column(
        "",
        rows.map((row) => row.cells[index] ?? ""),
      ),
    ),
    available: room(style.width, indent + 2),
    gap: GAP,
  });
  return rows.flatMap((row) => {
    const gutter = `${style.glyphs.change[row.change]} `;
    const lines =
      layout._tag === "grid"
        ? gridRow(layout, row.cells, style, indent, gutter)
        : row.cells.flatMap((cell, index) =>
            block(cell, style, indent, index === 0 ? gutter : "  "),
          );
    return [
      ...lines,
      ...(row.children === undefined ? [] : paintNodes(row.children, style, indent + 4)),
    ];
  });
};

const paintTree = (
  items: ReadonlyArray<TreeItem>,
  style: Style,
  prefix: string,
): ReadonlyArray<string> =>
  items.flatMap((item, index) => {
    const last = index === items.length - 1;
    const child = `${prefix}${last ? style.glyphs.tree.space : style.glyphs.tree.pipe}`;
    const text: ReadonlyArray<Span> = [
      ...(typeof item.text === "string" ? [{ text: item.text }] : item.text),
      ...(item.detail === undefined
        ? []
        : [{ text: `  ${visibleText(item.detail)}`, tone: "dim" as const }]),
    ];
    return [
      ...block(
        text,
        style,
        0,
        `${prefix}${last ? style.glyphs.tree.last : style.glyphs.tree.branch}`,
        undefined,
        child,
      ),
      ...(item.children === undefined ? [] : paintTree(item.children, style, child)),
    ];
  });

const target = (action: SuggestedAction): string => action.cmd ?? action.url ?? "";

const statusGlyph = (tone: Tone, glyphs: Glyphs): string =>
  tone === "neutral" || tone === "dim" ? " " : glyphs.status[tone];

const paintNode = (node: DocNode, style: Style, indent: number): ReadonlyArray<string> => {
  switch (node._tag) {
    case "headline": {
      const lines = block(
        node.text,
        style,
        indent,
        `${statusGlyph(node.tone, style.glyphs)} `,
        node.tone,
      );
      const aside = node.aside === undefined ? [] : block(node.aside, style, indent + 2, "", "dim");
      return [
        ...lines,
        ...aside,
        rule(style, indent, Math.max(...lines.map(displayWidth)) - indent),
      ];
    }
    case "paragraph":
      return block(node.text, style, indent, "", node.tone);
    case "row":
      return paintRows([node], style, indent);
    case "rows":
      return paintRows(node.rows, style, indent);
    case "collapsed":
      return block(
        `${String(node.count)} ${node.noun}${node.hint === undefined ? "" : ` (${node.hint})`}`,
        style,
        indent,
        `${style.glyphs.change[node.change]} `,
      );
    case "callout": {
      const bar = `${style.box.bar} `;
      const title = block(
        node.title,
        style,
        indent,
        `${bar}${statusGlyph(node.tone, style.glyphs)} `,
        node.tone,
        `${bar}  `,
      );
      const inner = { ...style, width: room(style.width, indent + displayWidth(bar) + 2) };
      const children = node.children === undefined ? [] : paintNodes(node.children, inner, 0);
      return [
        ...title,
        ...children.map((line) => `${spaces(indent)}${bar}  ${line}`.replace(/\s+$/u, "")),
      ];
    }
    case "table":
      return [
        ...(node.caption === undefined ? [] : block(node.caption, style, indent, "", "dim")),
        ...paintTable(node.columns, node.rows, style, indent),
      ];
    case "fields":
      return node.fields.flatMap((field) =>
        block(
          field.value,
          style,
          indent,
          paintSpans([{ text: `${visibleText(field.label)}: ` }], style, "dim"),
        ),
      );
    case "tree":
      return paintTree(node.roots, style, spaces(indent));
    case "next":
      return [
        `${spaces(indent)}${paintSpans([{ text: "Next" }], style, "dim")}`,
        ...node.actions.flatMap((action) => [
          ...block(action.description, style, indent + 2, `${style.glyphs.tree.last}`),
          ...(target(action).length === 0
            ? []
            : block(target(action), style, indent + 5, "", "dim")),
        ]),
      ];
    case "summary":
      return block(
        node.parts
          .flatMap((part, index) => [
            ...(index === 0 ? [] : [{ text: style.glyphs.separator }]),
            ...(typeof part.text === "string" ? [{ text: part.text }] : part.text),
          ])
          .concat(
            node.elapsedMs === undefined
              ? []
              : [{ text: ` in ${(node.elapsedMs / 1000).toFixed(1)}s` }],
          ),
        style,
        indent,
        "",
        node.tone,
      );
    case "section":
      return [
        ...(node.title === undefined ? [] : block(node.title, style, indent, "", "dim")),
        ...paintNodes(node.children, style, indent + (node.title === undefined ? 0 : 2)),
      ];
    case "markdown":
    case "raw":
      return node.content.split("\n").map((line) => `${spaces(indent)}${line}`);
    case "blank":
      return [""];
  }
};

const paintNodes = (doc: Doc, style: Style, indent: number): ReadonlyArray<string> =>
  doc.flatMap((node) => paintNode(node, style, indent));

/** Paint a document in the boxed visual language. Same signature as `paintText`. */
export const paintBoxed = (doc: Doc, style: PaintStyle): ReadonlyArray<string> => {
  const glyphs = style.glyphs ?? unicodeGlyphs;
  // The glyph set has no box-drawing members; the tree pipe tells whether the
  // terminal was granted Unicode symbols, so rules and bars follow it.
  const unicode = glyphs.tree.pipe.startsWith(unicodeGlyphs.tree.pipe.charAt(0));
  return paintNodes(
    doc,
    {
      width: style.width === "unbounded" ? "unbounded" : Math.max(20, style.width),
      colors: style.colors,
      glyphs,
      box: unicode
        ? { rule: "─", bar: "┃", separator: "│" }
        : { rule: "-", bar: "|", separator: "|" },
    },
    0,
  );
};
