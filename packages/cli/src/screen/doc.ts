import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

export type Tone = "neutral" | "ok" | "warn" | "error" | "info" | "dim";

export type Change =
  "create" | "update" | "remove" | "unchanged" | "blocked" | "failed" | "rolled-back";

export interface Span {
  readonly text: string;
  readonly tone?: Tone;
  readonly bold?: boolean;
  readonly link?: string;
}

export type Text = string | ReadonlyArray<Span>;

export interface HeadlineNode {
  readonly _tag: "headline";
  readonly tone: Tone;
  readonly text: Text;
  readonly aside?: Text;
}

export interface ParagraphNode {
  readonly _tag: "paragraph";
  readonly text: Text;
  readonly tone?: Tone;
}

export interface RowNode {
  readonly _tag: "row";
  readonly change: Change;
  readonly cells: ReadonlyArray<Text>;
  readonly children?: Doc;
}

export interface RowsNode {
  readonly _tag: "rows";
  readonly rows: ReadonlyArray<RowNode>;
}

export interface CollapsedNode {
  readonly _tag: "collapsed";
  readonly change: Change;
  readonly count: number;
  readonly noun: string;
  readonly hint?: string;
}

export interface CalloutNode {
  readonly _tag: "callout";
  readonly tone: Tone;
  readonly title: Text;
  readonly children?: Doc;
}

export interface TableColumn {
  readonly header: Text;
  readonly align?: "left" | "right";
}

export interface TableNode {
  readonly _tag: "table";
  readonly columns: ReadonlyArray<TableColumn>;
  readonly rows: ReadonlyArray<ReadonlyArray<Text>>;
  readonly caption?: Text;
}

export interface Field {
  readonly label: Text;
  readonly value: Text;
}

export interface FieldsNode {
  readonly _tag: "fields";
  readonly fields: ReadonlyArray<Field>;
}

export interface TreeItem {
  readonly text: Text;
  readonly detail?: Text;
  readonly children?: ReadonlyArray<TreeItem>;
}

export interface TreeNode {
  readonly _tag: "tree";
  readonly roots: ReadonlyArray<TreeItem>;
}

export interface NextNode {
  readonly _tag: "next";
  readonly actions: ReadonlyArray<SuggestedAction>;
}

export interface SummaryPart {
  readonly text: Text;
}

export interface SummaryNode {
  readonly _tag: "summary";
  readonly tone?: Tone;
  readonly parts: ReadonlyArray<SummaryPart>;
  readonly elapsedMs?: number;
}

export interface SectionNode {
  readonly _tag: "section";
  readonly title?: Text;
  readonly children: Doc;
}

export interface MarkdownNode {
  readonly _tag: "markdown";
  readonly content: string;
}

export interface RawNode {
  readonly _tag: "raw";
  readonly content: string;
}

export interface BlankNode {
  readonly _tag: "blank";
}

export type DocNode =
  | HeadlineNode
  | ParagraphNode
  | RowNode
  | RowsNode
  | CollapsedNode
  | CalloutNode
  | TableNode
  | FieldsNode
  | TreeNode
  | NextNode
  | SummaryNode
  | SectionNode
  | MarkdownNode
  | RawNode
  | BlankNode;

export type Doc = ReadonlyArray<DocNode>;

export const text = (value: string, options?: Omit<Span, "text">): ReadonlyArray<Span> => [
  { text: value, ...options },
];

export const plain = (value: Text): string =>
  typeof value === "string" ? value : value.map((span) => span.text).join("");
