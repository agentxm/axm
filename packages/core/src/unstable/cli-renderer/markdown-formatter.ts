import { lexer, type MarkedToken, type Token, type Tokens } from "marked";

import type { ResolvedTableColumn } from "./cli-renderer.js";
import { ANSI_BOLD, ANSI_CYAN, ANSI_DIM, ANSI_RESET, Symbols } from "./ansi-chrome.js";
import { formatTable } from "./table-formatter.js";

type MarkdownTableRow = { [key: string]: string };

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");
const MIN_WRAP_WIDTH = 24;

const annotate = (text: string, styles: ReadonlyArray<string>): string =>
  styles.length === 0 ? text : `${styles.join("")}${text}${ANSI_RESET}`;

const visibleLength = (text: string): number => text.replace(ANSI_PATTERN, "").length;

const repeat = (value: string, count: number): string => value.repeat(Math.max(0, count));

const isMarkedToken = (token: Token): token is MarkedToken => {
  switch (token.type) {
    case "blockquote":
    case "br":
    case "checkbox":
    case "code":
    case "codespan":
    case "def":
    case "del":
    case "em":
    case "escape":
    case "heading":
    case "hr":
    case "html":
    case "image":
    case "link":
    case "list":
    case "list_item":
    case "paragraph":
    case "space":
    case "strong":
    case "table":
    case "text":
      return true;
    default:
      return false;
  }
};

const supportedTokens = (tokens: ReadonlyArray<Token>): Array<MarkedToken> =>
  tokens.filter(isMarkedToken);

const wrapText = (text: string, width: number): Array<string> => {
  const safeWidth = Math.max(MIN_WRAP_WIDTH, width);
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: Array<string> = [];
  let current = "";

  for (const word of words) {
    if (current.length === 0) {
      current = word;
      continue;
    }

    const next = `${current} ${word}`;
    if (visibleLength(next) > safeWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines.length === 0 ? [""] : lines;
};

const renderWrapped = (
  text: string,
  width: number,
  firstPrefix = "",
  nextPrefix: string = firstPrefix,
): string => {
  const lines = wrapText(text, width - visibleLength(firstPrefix));
  return lines.map((line, index) => `${index === 0 ? firstPrefix : nextPrefix}${line}`).join("\n");
};

const renderInlineTokens = (tokens: ReadonlyArray<Token>): string =>
  supportedTokens(tokens)
    .map((token) => renderInlineToken(token))
    .join("");

const renderInlineToken = (token: MarkedToken): string => {
  switch (token.type) {
    case "br":
      return "\n";
    case "checkbox":
      return token.checked ? "[x]" : "[ ]";
    case "codespan":
      return annotate(token.text, [ANSI_DIM]);
    case "del":
    case "em":
      return annotate(renderInlineTokens(token.tokens), [ANSI_DIM]);
    case "escape":
      return token.text;
    case "html":
      return isHtmlComment(token.text) ? "" : token.text;
    case "image": {
      const label = token.text.length === 0 ? token.href : token.text;
      return `${label}${annotate(` (${token.href})`, [ANSI_DIM])}`;
    }
    case "link": {
      const label = renderInlineTokens(token.tokens);
      return `${label}${annotate(` (${token.href})`, [ANSI_DIM])}`;
    }
    case "strong":
      return annotate(renderInlineTokens(token.tokens), [ANSI_BOLD]);
    case "text":
      return token.tokens === undefined ? token.text : renderInlineTokens(token.tokens);
    case "blockquote":
    case "code":
    case "def":
    case "heading":
    case "hr":
    case "list":
    case "list_item":
    case "paragraph":
    case "space":
    case "table":
      return token.raw;
    default:
      return token satisfies never;
  }
};

const isHtmlComment = (text: string): boolean => {
  const trimmed = text.trim();
  return trimmed.startsWith("<!--") && trimmed.endsWith("-->");
};

const renderHeading = (token: Tokens.Heading, width: number): string => {
  const text = renderInlineTokens(token.tokens);
  const symbol =
    token.depth === 1 ? Symbols.intro : token.depth === 2 ? Symbols.step : Symbols.info;
  const line = annotate(`${symbol}  ${text}`, [ANSI_BOLD, ANSI_CYAN]);

  if (token.depth === 1) {
    const ruleWidth = Math.min(Math.max(visibleLength(text), 1), Math.max(width - 4, 1));
    return `${line}\n${annotate(`   ${repeat("\u2500", ruleWidth)}`, [ANSI_CYAN])}`;
  }

  return line;
};

const renderCode = (token: Tokens.Code): string =>
  token.text
    .split("\n")
    .map((line) => annotate(`  ${line}`, [ANSI_DIM]))
    .join("\n");

const markerForListItem = (list: Tokens.List, index: number): string => {
  if (!list.ordered) return "\u2022";
  const start = typeof list.start === "number" ? list.start : 1;
  return `${start + index}.`;
};

const renderList = (token: Tokens.List, width: number, depth: number): string => {
  const lines: Array<string> = [];

  for (let index = 0; index < token.items.length; index++) {
    const item = token.items[index];
    if (item === undefined) {
      continue;
    }
    const rendered = renderListItem(item, token, index, width, depth);
    if (rendered.length > 0) {
      lines.push(rendered);
    }
  }

  return lines.join("\n");
};

const renderListItem = (
  item: Tokens.ListItem,
  list: Tokens.List,
  index: number,
  width: number,
  depth: number,
): string => {
  const indent = repeat("  ", depth);
  const marker = markerForListItem(list, index);
  const firstPrefix = `${indent}${marker} `;
  const nextPrefix = `${indent}${repeat(" ", visibleLength(marker) + 1)}`;
  const lines: Array<string> = [];

  for (const token of supportedTokens(item.tokens)) {
    if (token.type === "paragraph" || token.type === "text") {
      const text =
        token.type === "paragraph" ? renderInlineTokens(token.tokens) : renderInlineToken(token);
      lines.push(renderWrapped(text, width, firstPrefix, nextPrefix));
      continue;
    }
    if (token.type === "list") {
      lines.push(renderList(token, width, depth + 1));
      continue;
    }

    const rendered = renderBlockToken(token, width, depth + 1);
    if (rendered.length > 0) {
      lines.push(rendered);
    }
  }

  if (lines.length === 0 && item.text.length > 0) {
    return renderWrapped(item.text, width, firstPrefix, nextPrefix);
  }

  return lines.join("\n");
};

const tableCellText = (cell: Tokens.TableCell): string =>
  cell.tokens.length === 0 ? cell.text : renderInlineTokens(cell.tokens).replace(ANSI_PATTERN, "");

const tableAlign = (align: "center" | "left" | "right" | null): "left" | "right" =>
  align === "right" ? "right" : "left";

const renderTable = (token: Tokens.Table, width: number): string => {
  const keys = token.header.map((_cell, index) => `c${index}`);
  const rows: Array<MarkdownTableRow> = [];

  for (const sourceRow of token.rows) {
    const row: MarkdownTableRow = {};
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      const cell = sourceRow[index];
      if (key !== undefined) {
        row[key] = cell === undefined ? "" : tableCellText(cell);
      }
    }
    rows.push(row);
  }

  const columns: Array<ResolvedTableColumn<MarkdownTableRow>> = [];
  for (let index = 0; index < token.header.length; index++) {
    const cell = token.header[index];
    const key = keys[index];
    if (cell !== undefined && key !== undefined) {
      columns.push({
        key,
        header: tableCellText(cell),
        render: (row) => row[key] ?? "",
        align: tableAlign(token.align[index] ?? null),
        width: "auto",
      });
    }
  }

  return formatTable(rows, columns, undefined, width);
};

const renderBlockToken = (token: MarkedToken, width: number, depth = 0): string => {
  switch (token.type) {
    case "blockquote":
      return renderWrapped(renderInlineTokens(token.tokens), width, "> ", "> ");
    case "br":
    case "checkbox":
    case "def":
    case "escape":
    case "space":
      return "";
    case "code":
      return renderCode(token);
    case "codespan":
    case "del":
    case "em":
    case "image":
    case "link":
    case "strong":
    case "text":
      return renderWrapped(renderInlineToken(token), width);
    case "heading":
      return renderHeading(token, width);
    case "hr":
      return annotate(repeat("\u2500", Math.min(width, 72)), [ANSI_DIM]);
    case "html":
      return isHtmlComment(token.text) ? "" : token.text;
    case "list":
      return renderList(token, width, depth);
    case "list_item":
      return renderWrapped(token.text, width);
    case "paragraph":
      return renderWrapped(renderInlineTokens(token.tokens), width);
    case "table":
      return renderTable(token, width);
    default:
      return token satisfies never;
  }
};

export const formatMarkdown = (content: string, width: number, colors: boolean): string => {
  if (!colors) {
    return content;
  }

  const rendered = supportedTokens(lexer(content, { gfm: true }))
    .map((token) => renderBlockToken(token, Math.max(MIN_WRAP_WIDTH, width)))
    .filter((block) => block.length > 0)
    .join("\n\n");

  return rendered.length === 0 ? "" : `${rendered}\n`;
};
