import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { plain } from "./doc.js";
import type { Doc, DocNode, Span, Tone } from "./doc.js";
import { fragment } from "./grammar.js";
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

/** How far a `Next` description that wraps onto its own line hangs beneath its command. */
const HANGING_INDENT = 2;

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
        indent: node.inset === true ? content + GUTTER_WIDTH : content,
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
          : withSupplement(title, joinedParts(node.aside, glyphs), style, style.valueColumn, {
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
    case "next":
      return [
        `${spaces(content)}${dim("Next", style)}`,
        ...node.actions.flatMap((suggested) => {
          const action = { ...suggested, description: fragment(suggested.description) };
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
          if (plain(action.description).length === 0) return lines;
          // A description that cannot share its command's line hangs beneath
          // it, so on a terminal without colour it is not read as a command.
          return withSupplement(lines, action.description, style, actionStart + HANGING_INDENT, {
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
  const isInset = (node: DocNode): boolean => node._tag === "paragraph" && node.inset === true;
  // Guidance that sets a value apart, such as the brief a sign-in prints, is
  // spaced like a structured result, so its `Next` stands apart from the prose.
  const structured = doc.some(
    (node) =>
      node._tag === "ledger" ||
      node._tag === "table" ||
      isInset(node) ||
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
      case "callout":
      case "next":
      case "prompt":
      case "wait":
        return true;
      case "answer":
        return previous?._tag !== "answer";
      case "section":
        // A titled group is a block of its own; an untitled one continues the prose before it.
        return (
          node.title !== undefined ||
          previous?._tag === "ledger" ||
          previous?._tag === "table" ||
          previous?._tag === "fields"
        );
      case "paragraph":
      case "summary":
      case "markdown":
      case "raw":
        return (
          previous?._tag === "ledger" || previous?._tag === "table" || previous?._tag === "fields"
        );
      case "blank":
        return false;
    }
  };

  const setApart = (node: DocNode, previous: DocNode): boolean =>
    (structured && startsBlock(node, previous)) ||
    // `Next` closes a result, so anything a view puts after it starts anew.
    previous._tag === "next" ||
    // Sibling groups stand apart from each other.
    (node._tag === "section" && previous._tag === "section") ||
    // The one value a sentence asks a person to act on stands apart from the prose around it.
    isInset(node) ||
    isInset(previous);

  // A marked headline's text starts past the gutter, so the prose that
  // continues it starts there too rather than back at the margin.
  const marked = (node: DocNode): boolean =>
    node._tag === "headline" &&
    node.verdict !== true &&
    statusGlyph(node.tone, style.glyphs) !== undefined;
  const continuation: Placement = { mark, content: Math.max(content, mark + GUTTER_WIDTH) };

  const lines: Array<string> = [];
  let previous: DocNode | undefined;
  // Whether prose here continues a marked headline: blank lines between its
  // paragraphs keep the run, and any other node ends it.
  let continuing = false;
  for (const node of doc) {
    continuing =
      (previous !== undefined && marked(previous)) ||
      (continuing && (previous?._tag === "paragraph" || previous?._tag === "blank"));
    const placement =
      continuing && node._tag === "paragraph" && node.inset !== true
        ? continuation
        : { mark, content };
    if (
      node._tag !== "blank" &&
      previous !== undefined &&
      previous._tag !== "blank" &&
      setApart(node, previous) &&
      lines.at(-1) !== ""
    ) {
      lines.push("");
    }
    lines.push(...paintNode(node, style, placement));
    previous = node;
  }
  return lines;
};

export const paintText = (doc: Doc, style: PaintStyle): ReadonlyArray<string> =>
  paintNodes(doc, resolveStyle(style), 0, 0);
