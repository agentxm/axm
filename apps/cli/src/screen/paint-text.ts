import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { plain } from "./doc.js";
import type { Doc, DocNode, Span, Tone, TreeItem } from "./doc.js";
import { displayWidth, padDisplay } from "./width.js";
import { longestWordWidth } from "./wrap-text.js";
import { paintFields, paintLedger, paintTable } from "./paint-grid.js";
import {
  COLUMN_GAP,
  GUTTER_WIDTH,
  MIN_FIELD_VALUE_WIDTH,
  bold,
  dim,
  gutter,
  joinedParts,
  paintPrefixed,
  paintValue,
  remaining,
  resolveStyle,
  spaces,
  statusGlyph,
  withSupplement,
  type PaintStyle,
  type ResolvedStyle,
} from "./paint-kit.js";
import { paintPrompt, paintWait } from "./paint-prompt.js";

export type { PaintStyle, PaintWidth } from "./paint-kit.js";

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
        : withSupplement(lines, item.detail, style, displayWidth(childPrefix));
    return [
      ...detailed,
      ...(item.children === undefined ? [] : paintTreeItems(item.children, style, childPrefix)),
    ];
  });

/**
 * Where a node paints: `mark` is the column its gutter starts at, and
 * `content` is where a node without a mark starts. They differ inside a titled
 * section, whose unmarked children sit at the content column while marked
 * children keep their marks in the gutter below the title.
 */
interface Placement {
  readonly mark: number;
  readonly content: number;
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
      if (mark === undefined || node.verdict === true) {
        // A title carries no mark, and a verdict leaves status to the rows above it.
        const lines = paintPrefixed(
          node.verdict === true && mark !== undefined ? bold(node.text) : node.text,
          style,
          { indent: content, first: "", tone: node.tone },
        );
        return node.aside === undefined
          ? lines
          : withSupplement(lines, joinedParts(node.aside, glyphs), style, content + 2);
      }
      const lines = paintPrefixed(node.text, style, {
        indent,
        first: gutter(mark),
        tone: node.tone,
      });
      return node.aside === undefined
        ? lines
        : withSupplement(lines, joinedParts(node.aside, glyphs), style, style.valueColumn, {
            gap: (last) => spaces(Math.max(COLUMN_GAP, style.valueColumn - displayWidth(last))),
          });
    }
    case "paragraph":
      return paintPrefixed(node.text, style, {
        indent: content,
        first: "",
        ...(node.tone === undefined ? {} : { tone: node.tone }),
      });
    case "ledger":
      return paintLedger(node, style, indent, paintNodes);
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
        labelStart + displayWidth(plain(node.label)) + COLUMN_GAP,
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
        ...(node.aside === undefined
          ? title
          : withSupplement(title, node.aside, style, style.valueColumn, {
              gap: (last) => spaces(Math.max(COLUMN_GAP, style.valueColumn - displayWidth(last))),
            })),
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
          const targetText = actionTarget(action);
          const target: ReadonlyArray<Span> = [{ text: targetText, copyable: true }];
          const actionStart = content + GUTTER_WIDTH;
          if (targetText.length === 0) {
            return paintPrefixed(action.description, style, {
              indent: actionStart,
              first: "",
              tone: "dim",
            });
          }
          const lines = paintPrefixed(target, style, { indent: actionStart, first: "" });
          if (action.url !== undefined || plain(action.description).length === 0) return lines;
          return withSupplement(lines, action.description, style, actionStart, {
            gap: spaces(COLUMN_GAP),
            ownLine: action.description,
          });
        }),
      ];
    case "summary": {
      return paintPrefixed(joinedParts(node.parts, glyphs), style, { indent: content, first: "" });
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
): ReadonlyArray<string> => {
  const firstHeadline = doc.find((node) => node._tag === "headline");
  const structured = doc.some(
    (node) =>
      node._tag === "ledger" ||
      node._tag === "table" ||
      node._tag === "tree" ||
      (node._tag === "fields" &&
        firstHeadline?._tag === "headline" &&
        firstHeadline.tone === "neutral"),
  );
  const startsBlock = (node: DocNode, previous: DocNode | undefined): boolean => {
    switch (node._tag) {
      case "headline":
      case "ledger":
      case "table":
      case "fields":
      case "tree":
      case "callout":
      case "next":
      case "prompt":
      case "wait":
        return true;
      case "answer":
        return previous?._tag !== "answer";
      case "paragraph":
      case "summary":
      case "section":
      case "markdown":
      case "raw":
        return (
          previous?._tag === "ledger" ||
          previous?._tag === "table" ||
          previous?._tag === "fields" ||
          previous?._tag === "tree"
        );
      case "blank":
        return false;
    }
  };

  const lines: Array<string> = [];
  let previous: DocNode | undefined;
  for (const node of doc) {
    if (
      structured &&
      node._tag !== "blank" &&
      previous !== undefined &&
      previous._tag !== "blank" &&
      startsBlock(node, previous) &&
      lines.at(-1) !== ""
    ) {
      lines.push("");
    }
    lines.push(...paintNode(node, style, { mark, content }));
    previous = node;
  }
  return lines;
};

export const paintText = (doc: Doc, style: PaintStyle): ReadonlyArray<string> =>
  paintNodes(doc, resolveStyle(style), 0, 0);
