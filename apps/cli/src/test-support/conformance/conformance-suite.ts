/**
 * Renderer conformance suite — the checks any painter of the typed `Doc`
 * tree must pass, expressed as pure functions over painted lines so a test
 * file can register them for the production painter and for an alternative
 * behind the same seam. Every check returns the offending lines (empty when
 * the painter conforms) so a failure names the evidence.
 */

import { plain, type Doc, type DocNode, type Text, type TreeItem } from "../../screen/doc.js";
import { stripTerminalFormatting } from "../../screen/width.js";
import type { PaintStyle } from "../../screen/paint-text.js";
import { asciiGlyphs } from "../../screen/glyphs.js";
import { displayWidth } from "../../screen/width.js";

export interface Painter {
  readonly name: string;
  readonly paint: (doc: Doc, style: PaintStyle) => ReadonlyArray<string>;
}

export const conformanceWidths = [40, 80, 120, 200] as const;

const ESCAPE = "\u001b";

const textOf = (value: Text): string => plain(value);

/**
 * Visit every text value a document carries, in document order, saying which
 * of them a person copies out of the terminal.
 */
const forEachText = (doc: Doc, visit: (value: Text, copyable: boolean) => void): void => {
  const pushText = (value: Text | undefined): void => {
    if (value !== undefined) visit(value, false);
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
        node.aside?.forEach((part) => pushText(part.text));
        return;
      case "paragraph":
        pushText(node.text);
        return;
      case "ledger":
        node.columns.forEach((column) => pushText(column.header));
        node.rows.forEach((row) => {
          row.cells.forEach(pushText);
          row.children?.forEach(walk);
        });
        node.folds?.forEach((fold) => {
          visit(fold.noun, false);
          pushText(fold.hint);
        });
        return;
      case "prompt":
        pushText(node.question);
        if (node.note !== undefined) pushText(node.note);
        node.chips.forEach((chip) => {
          visit(chip.key, false);
          visit(chip.word, false);
        });
        node.options?.forEach((option) => {
          pushText(option.title);
          option.details?.forEach(pushText);
        });
        pushText(node.entry);
        pushText(node.filter);
        node.hint?.status.forEach((status) => visit(status, false));
        node.hint?.keys.forEach((key) => {
          // `arrows` is a semantic token: each painter chooses its own visible
          // arrow label rather than printing the token itself.
          if (key.key !== "arrows") visit(key.key, false);
          visit(key.word, false);
        });
        return;
      case "wait":
        pushText(node.status);
        pushText(node.clock);
        pushText(node.detail);
        node.chips.forEach((chip) => {
          visit(chip.key, false);
          visit(chip.word, false);
        });
        return;
      case "answer":
        pushText(node.label);
        pushText(node.value);
        return;
      case "callout":
        pushText(node.title);
        pushText(node.aside);
        node.children?.forEach(walk);
        return;
      case "table":
        pushText(node.caption);
        node.columns.forEach((column) => pushText(column.header));
        node.rows.forEach((row) => row.cells.forEach(pushText));
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
          // URL actions are intentionally only the URL; their prose label is
          // metadata for richer interfaces, not terminal output.
          if (action.url === undefined) visit(action.description, false);
          // A next command or URL is copied and run: the painter marks it copyable.
          if (action.cmd !== undefined) visit(action.cmd, true);
          if (action.url !== undefined) visit(action.url, true);
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
        visit(node.content, false);
        return;
      case "blank":
        return;
    }
  };
  doc.forEach(walk);
};

/** Every text value a document carries, in document order. */
export const collectTexts = (doc: Doc): ReadonlyArray<string> => {
  const texts: Array<string> = [];
  forEachText(doc, (value) => texts.push(textOf(value)));
  return texts;
};

/** Non-text facts a replaceable painter must preserve behind the `Doc` seam. */
export type SemanticFactKind =
  | "span.tone"
  | "span.tint"
  | "span.bold"
  | "span.link"
  | "span.copyable"
  | "span.invert"
  | "headline.tone"
  | "headline.verdict"
  | "paragraph.tone"
  | "ledger.column.role"
  | "ledger.column.priority"
  | "ledger.column.align"
  | "ledger.row.id"
  | "ledger.row.mark"
  | "ledger.row.depth"
  | "ledger.fold.mark"
  | "prompt.chip.current"
  | "prompt.option.current"
  | "prompt.option.picked"
  | "prompt.option.depth"
  | "prompt.option.before"
  | "answer.mark"
  | "callout.tone"
  | "table.column.align"
  | "table.column.width"
  | "table.column.minWidth"
  | "table.column.priority"
  | "table.row.mark"
  | "next.action.target";

export interface SemanticFact {
  readonly kind: SemanticFactKind;
  readonly path: string;
  readonly value: string | number | boolean;
}

export const semanticFactKinds: ReadonlyArray<SemanticFactKind> = [
  "span.tone",
  "span.tint",
  "span.bold",
  "span.link",
  "span.copyable",
  "span.invert",
  "headline.tone",
  "headline.verdict",
  "paragraph.tone",
  "ledger.column.role",
  "ledger.column.priority",
  "ledger.column.align",
  "ledger.row.id",
  "ledger.row.mark",
  "ledger.row.depth",
  "ledger.fold.mark",
  "prompt.chip.current",
  "prompt.option.current",
  "prompt.option.picked",
  "prompt.option.depth",
  "prompt.option.before",
  "answer.mark",
  "callout.tone",
  "table.column.align",
  "table.column.width",
  "table.column.minWidth",
  "table.column.priority",
  "table.row.mark",
  "next.action.target",
];

/** Collect painter-relevant semantics without consulting any painted text. */
export const collectSemanticFacts = (doc: Doc): ReadonlyArray<SemanticFact> => {
  const facts: Array<SemanticFact> = [];
  const add = (
    kind: SemanticFactKind,
    path: string,
    value: string | number | boolean | undefined,
  ): void => {
    if (value !== undefined) facts.push({ kind, path, value });
  };
  const spans = (value: Text | undefined, path: string): void => {
    if (value === undefined || typeof value === "string") return;
    value.forEach((span, index) => {
      const at = `${path}.span[${String(index)}]`;
      add("span.tone", at, span.tone);
      add("span.tint", at, span.tint);
      add("span.bold", at, span.bold);
      add("span.link", at, span.link);
      add("span.copyable", at, span.copyable);
      add("span.invert", at, span.invert);
    });
  };
  const walkTree = (items: ReadonlyArray<TreeItem>, path: string): void => {
    items.forEach((item, index) => {
      const at = `${path}[${String(index)}]`;
      spans(item.text, `${at}.text`);
      spans(item.detail, `${at}.detail`);
      if (item.children !== undefined) walkTree(item.children, `${at}.children`);
    });
  };
  const walk = (node: DocNode, path: string): void => {
    switch (node._tag) {
      case "headline":
        add("headline.tone", path, node.tone);
        add("headline.verdict", path, node.verdict);
        spans(node.text, `${path}.text`);
        node.aside?.forEach((part, index) => spans(part.text, `${path}.aside[${String(index)}]`));
        return;
      case "paragraph":
        add("paragraph.tone", path, node.tone);
        spans(node.text, `${path}.text`);
        return;
      case "ledger":
        node.columns.forEach((column, index) => {
          const at = `${path}.columns[${String(index)}]`;
          add("ledger.column.role", at, column.role);
          add("ledger.column.priority", at, column.priority);
          add("ledger.column.align", at, column.align);
          spans(column.header, `${at}.header`);
        });
        node.rows.forEach((row, index) => {
          const at = `${path}.rows[${String(index)}]`;
          add("ledger.row.id", at, row.id);
          add("ledger.row.mark", at, row.mark);
          add("ledger.row.depth", at, row.depth);
          row.cells.forEach((cell, cellIndex) => spans(cell, `${at}.cells[${String(cellIndex)}]`));
          row.children?.forEach((child, childIndex) =>
            walk(child, `${at}.children[${String(childIndex)}]`),
          );
        });
        node.folds?.forEach((fold, index) => {
          add("ledger.fold.mark", `${path}.folds[${String(index)}]`, fold.mark);
          spans(fold.hint, `${path}.folds[${String(index)}].hint`);
        });
        return;
      case "prompt":
        spans(node.question, `${path}.question`);
        spans(node.note, `${path}.note`);
        spans(node.entry, `${path}.entry`);
        node.chips.forEach((chip, index) =>
          add("prompt.chip.current", `${path}.chips[${String(index)}]`, chip.current),
        );
        node.options?.forEach((option, index) => {
          const at = `${path}.options[${String(index)}]`;
          add("prompt.option.current", at, option.current);
          add("prompt.option.picked", at, option.picked);
          add("prompt.option.depth", at, option.depth);
          add("prompt.option.before", at, option.before);
          spans(option.title, `${at}.title`);
          option.details?.forEach((detail, detailIndex) =>
            spans(detail, `${at}.details[${String(detailIndex)}]`),
          );
        });
        return;
      case "wait":
        spans(node.status, `${path}.status`);
        spans(node.clock, `${path}.clock`);
        spans(node.detail, `${path}.detail`);
        node.chips.forEach((chip, index) =>
          add("prompt.chip.current", `${path}.chips[${String(index)}]`, chip.current),
        );
        return;
      case "answer":
        add("answer.mark", path, node.mark);
        spans(node.label, `${path}.label`);
        spans(node.value, `${path}.value`);
        return;
      case "callout":
        add("callout.tone", path, node.tone);
        spans(node.title, `${path}.title`);
        spans(node.aside, `${path}.aside`);
        node.children?.forEach((child, index) => walk(child, `${path}.children[${String(index)}]`));
        return;
      case "table":
        spans(node.caption, `${path}.caption`);
        node.columns.forEach((column, index) => {
          const at = `${path}.columns[${String(index)}]`;
          add("table.column.align", at, column.align);
          add("table.column.width", at, column.width);
          add("table.column.minWidth", at, column.minWidth);
          add("table.column.priority", at, column.priority);
          spans(column.header, `${at}.header`);
        });
        node.rows.forEach((row, index) => {
          const at = `${path}.rows[${String(index)}]`;
          add("table.row.mark", at, row.mark);
          row.cells.forEach((cell, cellIndex) => spans(cell, `${at}.cells[${String(cellIndex)}]`));
        });
        return;
      case "fields":
        node.fields.forEach((field, index) => {
          spans(field.label, `${path}.fields[${String(index)}].label`);
          spans(field.value, `${path}.fields[${String(index)}].value`);
        });
        return;
      case "tree":
        walkTree(node.roots, `${path}.roots`);
        return;
      case "next":
        node.actions.forEach((action, index) => {
          add(
            "next.action.target",
            `${path}.actions[${String(index)}]`,
            action.cmd === undefined ? "url" : "cmd",
          );
          spans(action.description, `${path}.actions[${String(index)}].description`);
        });
        return;
      case "summary":
        node.parts.forEach((part, index) => spans(part.text, `${path}.parts[${String(index)}]`));
        return;
      case "section":
        spans(node.title, `${path}.title`);
        node.children.forEach((child, index) => walk(child, `${path}.children[${String(index)}]`));
        return;
      case "markdown":
      case "raw":
      case "blank":
        return;
    }
  };
  doc.forEach((node, index) => walk(node, `doc[${String(index)}]`));
  return facts;
};

/**
 * The values a document promises to show whole: URLs, commands, one-time codes
 * and request identifiers. A value cut to fit cannot be copied and used, so
 * these are the only content a painter may overflow the width with.
 */
export const copyableValues = (doc: Doc): ReadonlyArray<string> => {
  const values: Array<string> = [];
  forEachText(doc, (value, copyable) => {
    if (copyable) {
      values.push(textOf(value));
      return;
    }
    if (typeof value === "string") return;
    for (const span of value) if (span.copyable === true) values.push(span.text);
  });
  return values;
};

/** Lines a painter passes through verbatim: the content of `raw` and `markdown` nodes. */
const verbatimLines = (doc: Doc): ReadonlySet<string> => {
  const lines = new Set<string>();
  const walk = (node: DocNode): void => {
    if (node._tag === "markdown" || node._tag === "raw") {
      for (const line of node.content.split("\n")) lines.add(line.trim());
    } else if (node._tag === "callout") {
      node.children?.forEach(walk);
    } else if (node._tag === "ledger") {
      for (const row of node.rows) row.children?.forEach(walk);
    } else if (node._tag === "section") {
      node.children.forEach(walk);
    }
  };
  doc.forEach(walk);
  return lines;
};

/**
 * Width property: no painted line exceeds the width, except a line carried
 * verbatim from `raw` or `markdown` content, or one carrying a copyable value,
 * which is shown whole and overflows rather than be cut.
 */
export const widthViolations = (
  painter: Painter,
  doc: Doc,
  width: number,
): ReadonlyArray<string> => {
  const verbatim = verbatimLines(doc);
  const copyable = copyableValues(doc);
  return painter
    .paint(doc, { width, colors: false })
    .filter(
      (line) =>
        displayWidth(line) > width &&
        !verbatim.has(line.trim()) &&
        !copyable.some((value) => line.includes(value)),
    );
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
  return [40, 80].flatMap((width) =>
    painter
      .paint(doc, { width, colors: false, glyphs: asciiGlyphs })
      .filter((line) => [...nonAscii(line)].some((character) => !allowed.has(character)))
      .map((line) => `${String(width)}: ${line}`),
  );
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
  "ledger",
  "prompt",
  "wait",
  "answer",
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
    if (node._tag === "callout") node.children?.forEach(walk);
    if (node._tag === "ledger") for (const row of node.rows) row.children?.forEach(walk);
    if (node._tag === "section") node.children.forEach(walk);
  };
  doc.forEach(walk);
  return kinds;
};
