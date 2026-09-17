import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

export type Tone = "neutral" | "ok" | "warn" | "error" | "info" | "dim";

/** A tone that carries a status glyph; `neutral` and `dim` carry none. */
export type Status = Exclude<Tone, "neutral" | "dim">;

export type Change =
  "create" | "update" | "remove" | "unchanged" | "blocked" | "failed" | "rolled-back";

export interface Span {
  readonly text: string;
  readonly tone?: Tone;
  readonly bold?: boolean;
  readonly link?: string;
  /**
   * A value a person copies out of the terminal — a URL, a command, a one-time
   * code, a request identifier. The painter never wraps, splits, or truncates
   * one: it moves to a line of its own and overflows the width instead.
   */
  readonly copyable?: true;
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

/**
 * How a ledger column takes and yields width: the `name` column is protected
 * and shortened last, a `fixed` column keeps its natural width, and an
 * `elastic` column takes the spare width and shrinks first.
 */
export type LedgerColumnRole = "name" | "fixed" | "elastic";

export interface LedgerColumn {
  readonly header: Text;
  readonly role: LedgerColumnRole;
  readonly priority?: TableColumnPriority;
  readonly align?: "left" | "right";
}

export interface LedgerRow {
  /** The unit this row is about; live progress joins to plan rows by it. */
  readonly id?: string;
  readonly mark: Change | Status;
  readonly cells: ReadonlyArray<Text>;
  /** Nesting under the row above, such as a pack's members under their pack. */
  readonly depth?: number;
  /** Per-agent outcomes and details, shown at verbose level. */
  readonly children?: Doc;
}

/** The rows a ledger folds into one line because they repeat one outcome. */
export interface LedgerFold {
  readonly mark: Change | Status;
  readonly count: number;
  readonly noun: string;
  readonly hint?: Text;
}

export interface LedgerNode {
  readonly _tag: "ledger";
  readonly columns: ReadonlyArray<LedgerColumn>;
  readonly rows: ReadonlyArray<LedgerRow>;
  readonly folded?: LedgerFold;
}

/**
 * A settled prompt: one gutter line whose answer sits at the value column.
 * The `Screen` appends it when a prompt settles; views never build it.
 */
export interface AnswerNode {
  readonly _tag: "answer";
  readonly label: Text;
  readonly value: Text;
  /** `ok` marks an answer the person gave; `dim` an answer taken as given. */
  readonly mark: "ok" | "dim";
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
  /** A dim aside, such as a stable code, painted at the value column. */
  readonly aside?: Text;
  readonly children?: Doc;
}

/**
 * How a column yields when the table is wider than the terminal: `required`
 * columns are never dropped, `optional` columns are dropped first, and
 * `preferred` columns (the default) are dropped only after every optional one.
 */
export type TableColumnPriority = "required" | "preferred" | "optional";

export interface TableColumn {
  readonly header: Text;
  readonly align?: "left" | "right";
  /** Preferred width in cells; the painter shrinks below it under pressure. */
  readonly width?: number;
  /** Width the column keeps while it is shown; defaults to its header width. */
  readonly minWidth?: number;
  readonly priority?: TableColumnPriority;
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
  | LedgerNode
  | AnswerNode
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
