/**
 * Renderer conformance suite — the checks any painter of the typed `Doc`
 * tree must pass, expressed as pure functions over painted lines so a test
 * file can register them for the production painter and for an alternative
 * behind the same seam. Every check returns the offending lines (empty when
 * the painter conforms) so a failure names the evidence.
 */

import type { Doc, DocNode, Text, TreeItem } from "../doc.js";
import { stripTerminalFormatting } from "../output-policy.js";
import { asciiGlyphs, type PaintStyle } from "../paint-text.js";
import { displayWidth } from "../width.js";
import { visibleText } from "../wrap-text.js";

export interface Painter {
  readonly name: string;
  readonly paint: (doc: Doc, style: PaintStyle) => ReadonlyArray<string>;
}

export const conformanceWidths = [40, 80, 120, 200] as const;

const ESCAPE = "\u001b";

const textOf = (value: Text): string => visibleText(value);

/** Every text value a document carries, in document order. */
export const collectTexts = (doc: Doc): ReadonlyArray<string> => {
  const texts: Array<string> = [];
  const pushText = (value: Text | undefined): void => {
    if (value !== undefined) texts.push(textOf(value));
  };
  const walkTree = (items: ReadonlyArray<TreeItem>): void => {
    for (const item of items) {
      pushText(item.text);
      pushText(item.detail);
      if (item.children !== undefined) walkTree(item.children);
    }
  };
  const walk = (node: DocNode): void => {
    switch (node._tag) {
      case "headline":
        pushText(node.text);
        pushText(node.aside);
        return;
      case "paragraph":
        pushText(node.text);
        return;
      case "row":
        node.cells.forEach(pushText);
        node.children?.forEach(walk);
        return;
      case "rows":
        node.rows.forEach(walk);
        return;
      case "collapsed":
        texts.push(node.noun);
        if (node.hint !== undefined) texts.push(node.hint);
        return;
      case "callout":
        pushText(node.title);
        node.children?.forEach(walk);
        return;
      case "table":
        pushText(node.caption);
        node.columns.forEach((column) => pushText(column.header));
        node.rows.forEach((row) => row.forEach(pushText));
        return;
      case "fields":
        node.fields.forEach((field) => {
          pushText(field.label);
          pushText(field.value);
        });
        return;
      case "tree":
        walkTree(node.roots);
        return;
      case "next":
        node.actions.forEach((action) => {
          texts.push(action.description);
          if (action.cmd !== undefined) texts.push(action.cmd);
          if (action.url !== undefined) texts.push(action.url);
        });
        return;
      case "summary":
        node.parts.forEach((part) => pushText(part.text));
        return;
      case "section":
        pushText(node.title);
        node.children.forEach(walk);
        return;
      case "markdown":
      case "raw":
        texts.push(node.content);
        return;
      case "blank":
        return;
    }
  };
  doc.forEach(walk);
  return texts;
};

/** Lines a painter passes through verbatim: the content of `raw` and `markdown` nodes. */
const verbatimLines = (doc: Doc): ReadonlySet<string> => {
  const lines = new Set<string>();
  const walk = (node: DocNode): void => {
    if (node._tag === "markdown" || node._tag === "raw") {
      for (const line of node.content.split("\n")) lines.add(line.trim());
    } else if (node._tag === "row" || node._tag === "callout") {
      node.children?.forEach(walk);
    } else if (node._tag === "rows") {
      node.rows.forEach(walk);
    } else if (node._tag === "section") {
      node.children.forEach(walk);
    }
  };
  doc.forEach(walk);
  return lines;
};

/**
 * Width property: no painted line exceeds the width, except a line carried
 * verbatim from `raw` or `markdown` content.
 */
export const widthViolations = (
  painter: Painter,
  doc: Doc,
  width: number,
): ReadonlyArray<string> => {
  const verbatim = verbatimLines(doc);
  return painter
    .paint(doc, { width, colors: false })
    .filter((line) => displayWidth(line) > width && !verbatim.has(line.trim()));
};

/** Trailing whitespace is padding to a phantom width; no painted line carries it. */
export const trailingWhitespaceViolations = (
  painter: Painter,
  doc: Doc,
  width: PaintStyle["width"],
): ReadonlyArray<string> =>
  painter.paint(doc, { width, colors: false }).filter((line) => /\s$/u.test(line));

/**
 * Unbounded painting never wraps or truncates: every single-line text value of
 * the document appears whole on one painted line, and no ellipsis is added.
 */
export const unboundedViolations = (painter: Painter, doc: Doc): ReadonlyArray<string> => {
  const lines = painter
    .paint(doc, { width: "unbounded", colors: false })
    .map(stripTerminalFormatting);
  const sourceEllipses = collectTexts(doc).join("").split("…").length - 1;
  const paintedEllipses = lines.join("").split("…").length - 1;
  const missing = collectTexts(doc)
    .filter((value) => value.length > 0 && !value.includes("\n"))
    .filter((value) => !lines.some((line) => line.includes(value)))
    .map((value) => `not on one line: ${value}`);
  return paintedEllipses > sourceEllipses ? [...missing, "ellipsis introduced"] : missing;
};

/**
 * Color fallback: colored output stripped of formatting equals plain output,
 * and plain output contains no escape sequence at all.
 */
export const colorViolations = (
  painter: Painter,
  doc: Doc,
  width: number,
): ReadonlyArray<string> => {
  const plain = painter.paint(doc, { width, colors: false });
  const colored = painter.paint(doc, { width, colors: true });
  const violations: Array<string> = [];
  if (plain.some((line) => line.includes(ESCAPE))) violations.push("plain output carries escapes");
  const strippedColored = colored.map(stripTerminalFormatting);
  if (strippedColored.length !== plain.length) {
    violations.push(`line count differs: ${String(colored.length)} vs ${String(plain.length)}`);
  }
  strippedColored.forEach((line, index) => {
    if (line !== plain[index]) violations.push(`differs after stripping: ${line}`);
  });
  return violations;
};

const nonAscii = (value: string): ReadonlySet<string> =>
  new Set([...value].filter((character) => (character.codePointAt(0) ?? 0) > 0x7f));

/**
 * Glyph fallback: with the seven-bit glyph set, the painter adds no non-ASCII
 * character of its own; only characters the document's text carries remain.
 */
export const asciiViolations = (painter: Painter, doc: Doc): ReadonlyArray<string> => {
  const allowed = nonAscii(collectTexts(doc).join(""));
  return painter
    .paint(doc, { width: 80, colors: false, glyphs: asciiGlyphs })
    .filter((line) => [...nonAscii(line)].some((character) => !allowed.has(character)));
};

/** Painting the same document twice yields identical lines. */
export const determinismViolations = (
  painter: Painter,
  doc: Doc,
  style: PaintStyle,
): ReadonlyArray<string> => {
  const first = painter.paint(doc, style);
  const second = painter.paint(doc, style);
  return first.length === second.length && first.every((line, index) => line === second[index])
    ? []
    : ["painting twice differs"];
};

/** Every node kind a painter must handle; the every-node fixture exercises them all. */
export const nodeKinds: ReadonlyArray<DocNode["_tag"]> = [
  "headline",
  "paragraph",
  "row",
  "rows",
  "collapsed",
  "callout",
  "table",
  "fields",
  "tree",
  "next",
  "summary",
  "section",
  "markdown",
  "raw",
  "blank",
];

/** Node kinds a document contains, so a fixture can prove its coverage. */
export const nodeKindsOf = (doc: Doc): ReadonlySet<DocNode["_tag"]> => {
  const kinds = new Set<DocNode["_tag"]>();
  const walk = (node: DocNode): void => {
    kinds.add(node._tag);
    if (node._tag === "row" || node._tag === "callout") node.children?.forEach(walk);
    if (node._tag === "rows") node.rows.forEach(walk);
    if (node._tag === "section") node.children.forEach(walk);
  };
  doc.forEach(walk);
  return kinds;
};
