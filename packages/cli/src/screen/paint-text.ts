import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import type { Change, Doc, DocNode, RowNode, Span, Text, Tone, TreeItem } from "./doc.js";
import { displayWidth, padDisplay, truncateDisplay, wrapDisplay } from "./width.js";

const ESC = "\u001b[";
const RESET = `${ESC}0m`;

export interface Glyphs {
  readonly status: Readonly<Record<Exclude<Tone, "neutral" | "dim">, string>>;
  readonly change: Readonly<Record<Change, string>>;
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
};

export interface PaintStyle {
  readonly width: number;
  readonly colors: boolean;
  readonly glyphs?: Glyphs;
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

const paintTextValue = (value: Text, style: PaintStyle, inherited?: Tone): string => {
  const spans: ReadonlyArray<Span> = typeof value === "string" ? [{ text: value }] : value;
  return spans
    .map((span) => {
      const tone = span.tone ?? inherited;
      return styleSpan(tone === undefined ? span : { ...span, tone }, style.colors);
    })
    .join("");
};

const visibleTextValue = (value: Text): string =>
  typeof value === "string" ? value : value.map((span) => span.text).join("");

const statusGlyph = (tone: Tone, glyphs: Glyphs): string =>
  tone === "neutral" || tone === "dim" ? " " : glyphs.status[tone];

const paintWrapped = (
  value: Text,
  style: PaintStyle,
  options?: { readonly indent?: number; readonly hanging?: number; readonly tone?: Tone },
): ReadonlyArray<string> => {
  const indent = options?.indent ?? 0;
  const hanging = options?.hanging ?? indent;
  const text = visibleTextValue(value);
  const lines = wrapDisplay(text, style.width - hanging);
  return lines.map((line, index) => {
    const padding = " ".repeat(index === 0 ? indent : hanging);
    return `${padding}${paintTextValue(line, style, options?.tone)}`;
  });
};

const paintRowCells = (
  rows: ReadonlyArray<RowNode>,
  style: PaintStyle,
  indent: number,
): ReadonlyArray<string> => {
  if (rows.length === 0) return [];
  const glyphs = style.glyphs ?? unicodeGlyphs;
  const columnCount = Math.max(...rows.map((row) => row.cells.length));
  const widths = Array.from({ length: columnCount }, (_, index) =>
    Math.max(0, ...rows.map((row) => displayWidth(visibleTextValue(row.cells[index] ?? "")))),
  );
  const gutter = indent + 2;
  const gapWidth = Math.max(0, columnCount - 1) * 3;
  const natural = widths.reduce((sum, width) => sum + width, 0) + gapWidth;
  if (natural > style.width - gutter && widths.length > 0) {
    const last = widths.length - 1;
    const fixed = widths.slice(0, last).reduce((sum, width) => sum + width, 0) + gapWidth;
    widths[last] = Math.max(4, style.width - gutter - fixed);
  }

  const lines: Array<string> = [];
  for (const row of rows) {
    const cells = row.cells.map((cell, index) => {
      const rendered = paintTextValue(cell, style);
      const width = widths[index] ?? displayWidth(rendered);
      const value = truncateDisplay(rendered, width);
      return index === row.cells.length - 1 ? value : padDisplay(value, width);
    });
    lines.push(`${" ".repeat(indent)}${glyphs.change[row.change]} ${cells.join("   ")}`);
    if (row.children !== undefined) {
      lines.push(...paintNodes(row.children, style, indent + 4));
    }
  }
  return lines;
};

const actionTarget = (action: SuggestedAction): string => action.cmd ?? action.url ?? "";

const paintTreeItems = (
  items: ReadonlyArray<TreeItem>,
  style: PaintStyle,
  prefix: string,
): ReadonlyArray<string> => {
  const lines: Array<string> = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) continue;
    const last = index === items.length - 1;
    const connector = last ? "└─ " : "├─ ";
    const detail =
      item.detail === undefined ? "" : `  ${paintTextValue(item.detail, style, "dim")}`;
    lines.push(`${prefix}${connector}${paintTextValue(item.text, style)}${detail}`);
    if (item.children !== undefined) {
      lines.push(...paintTreeItems(item.children, style, `${prefix}${last ? "   " : "│  "}`));
    }
  }
  return lines;
};

const paintNode = (node: DocNode, style: PaintStyle, indent: number): ReadonlyArray<string> => {
  const glyphs = style.glyphs ?? unicodeGlyphs;
  switch (node._tag) {
    case "headline": {
      const glyph = statusGlyph(node.tone, glyphs);
      const aside = node.aside === undefined ? "" : `  ${paintTextValue(node.aside, style, "dim")}`;
      return paintWrapped(node.text, style, {
        indent: indent + 2,
        hanging: indent + 2,
        tone: node.tone,
      }).map((line, index) => (index === 0 ? `${glyph}${line.slice(indent + 1)}${aside}` : line));
    }
    case "paragraph":
      return paintWrapped(node.text, style, {
        indent,
        hanging: indent,
        ...(node.tone === undefined ? {} : { tone: node.tone }),
      });
    case "row":
      return paintRowCells([node], style, indent);
    case "rows":
      return paintRowCells(node.rows, style, indent);
    case "collapsed": {
      const hint = node.hint === undefined ? "" : `  ${paintTextValue(node.hint, style, "dim")}`;
      return [
        `${" ".repeat(indent)}${glyphs.change[node.change]} ${String(node.count)} ${node.noun}${hint}`,
      ];
    }
    case "callout": {
      const title = `${statusGlyph(node.tone, glyphs)} ${paintTextValue(node.title, style, node.tone)}`;
      const children =
        node.children === undefined ? [] : paintNodes(node.children, style, indent + 2);
      return [`${" ".repeat(indent)}${title}`, ...children];
    }
    case "table": {
      const tableRows: ReadonlyArray<RowNode> = node.rows.map((cells) => ({
        _tag: "row",
        change: "unchanged",
        cells,
      }));
      const headers = node.columns.map((column) => column.header);
      const caption = node.caption === undefined ? [] : [paintTextValue(node.caption, style)];
      return [
        ...caption,
        `${" ".repeat(indent + 2)}${headers.map((header) => paintTextValue(header, style, "dim")).join("   ")}`,
        ...paintRowCells(tableRows, style, indent),
      ];
    }
    case "fields": {
      const width = Math.max(
        0,
        ...node.fields.map((field) => displayWidth(visibleTextValue(field.label))),
      );
      return node.fields.map(
        (field) =>
          `${" ".repeat(indent)}${padDisplay(paintTextValue(field.label, style, "dim"), width)}  ${paintTextValue(field.value, style)}`,
      );
    }
    case "tree":
      return paintTreeItems(node.roots, style, " ".repeat(indent));
    case "next":
      return [
        `${" ".repeat(indent)}${paintTextValue("Next", style, "dim")}`,
        ...node.actions.map((action) => {
          const target = actionTarget(action);
          const suffix = target.length === 0 ? "" : ` · ${paintTextValue(target, style, "dim")}`;
          return `${" ".repeat(indent + 2)}${action.description}${suffix}`;
        }),
      ];
    case "summary": {
      const elapsed =
        node.elapsedMs === undefined ? "" : ` in ${Math.max(0, node.elapsedMs / 1000).toFixed(1)}s`;
      const content = node.parts.map((part) => paintTextValue(part.text, style)).join(" · ");
      return [`${" ".repeat(indent)}${paintTextValue(content + elapsed, style, node.tone)}`];
    }
    case "section": {
      const title =
        node.title === undefined
          ? []
          : [`${" ".repeat(indent)}${paintTextValue(node.title, style, "dim")}`];
      return [...title, ...paintNodes(node.children, style, indent + (title.length === 0 ? 0 : 2))];
    }
    case "markdown":
    case "raw":
      return node.content.split("\n").map((line) => `${" ".repeat(indent)}${line}`);
    case "blank":
      return [""];
  }
};

const paintNodes = (doc: Doc, style: PaintStyle, indent: number): ReadonlyArray<string> =>
  doc.flatMap((node) => paintNode(node, style, indent));

export const paintText = (doc: Doc, style: PaintStyle): ReadonlyArray<string> =>
  paintNodes(doc, { ...style, width: Math.max(20, style.width) }, 0);
