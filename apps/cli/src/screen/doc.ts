import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

export type Tone = "neutral" | "ok" | "warn" | "error" | "info" | "dim";

/** A tone that carries a status glyph; `neutral` and `dim` carry none. */
export type Status = Exclude<Tone, "neutral" | "dim">;

export type Change =
  "create" | "update" | "remove" | "unchanged" | "blocked" | "failed" | "rolled-back";

/**
 * A unit that has not settled: `working` is the running mark the live region
 * animates, and `waiting` a unit that has not started. Only a live ledger
 * carries one, because a settled document knows what happened.
 */
export type LiveMark = "working" | "waiting";

/** Every mark a gutter paints: an outcome, a change operation, or live progress. */
export type Mark = Change | Status | LiveMark;

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
  /**
   * Reverse video, so the span reads as a filled cell. A key chip uses it for
   * the choice `enter` takes; a terminal without color shows the same choice
   * by its capital letter instead.
   */
  readonly invert?: true;
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
  readonly mark: Mark;
  readonly cells: ReadonlyArray<Text>;
  /** Nesting under the row above, such as a pack's members under their pack. */
  readonly depth?: number;
  /** Per-agent outcomes and details, shown at verbose level. */
  readonly children?: Doc;
}

/** The rows a ledger folds into one line because they repeat one outcome. */
export interface LedgerFold {
  readonly mark: Mark;
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
 * One lettered choice of a question: the key that picks it, and the word that
 * says what it means. The key is shown as it must be typed, so the capital
 * letter is what marks the default on a terminal without color.
 */
export interface PromptChip {
  readonly key: string;
  readonly word: string;
  /** The choice `enter` takes: its chip is filled and its word emphasized. */
  readonly current?: true;
}

/**
 * One option of a question whose answers need reading before one is chosen:
 * its title at the content column, and what it means dim at the value column.
 */
export interface PromptOption {
  readonly title: Text;
  /**
   * Facts about the option, which the painter joins with its own separator.
   * They show whole or not at all, so a narrow terminal loses them before it
   * touches a title.
   */
  readonly details?: ReadonlyArray<Text>;
  /** The option the caret stands on, which `enter` takes. */
  readonly current?: true;
  /**
   * Whether the option is picked, for a question that takes several: its mark
   * stands between the caret and the title. A group's header is `partial`
   * while only some of its options are.
   */
  readonly picked?: PromptPicked;
  /** Steps in from the content column, such as a group's options under its header. */
  readonly depth?: number;
  /** How many options the list skips before this one, named on a line above it. */
  readonly before?: number;
}

export type PromptPicked = "all" | "some" | "none";

/**
 * One key a list answers to: the key as typed, or `arrows` for the up and
 * down arrows the painter draws, and the word for what it does.
 */
export interface PromptKey {
  readonly key: string;
  readonly word: string;
}

/**
 * The line beneath a list: where it stands, such as how many are picked, and
 * the keys that act on it. Where the line is short the keys lose their words
 * and the arrows go; where it is shorter still only the status stays.
 */
export interface PromptHint {
  readonly status: ReadonlyArray<string>;
  readonly keys: ReadonlyArray<PromptKey>;
}

/**
 * A question being asked: the prompt mark in the gutter, the question itself,
 * and whatever answers it — key chips, a list of options that opens beneath
 * it, or the line being typed behind the caret. The painter puts the chips
 * after the question, on their own line, or without their words, as the width
 * allows. Every option is one line, so a list is exactly as tall as it looks.
 * The `Screen` builds one from an `Ask` while a prompt is open; views never
 * build it.
 */
export interface PromptNode {
  readonly _tag: "prompt";
  readonly question: Text;
  /** What the question means, in one dim line beneath it. */
  readonly note?: Text;
  readonly chips: ReadonlyArray<PromptChip>;
  /** The options that fit the space the question was given, in order. */
  readonly options?: ReadonlyArray<PromptOption>;
  /** How many options did not fit below the list, named on one line beneath it. */
  readonly more?: number;
  /** The answer being typed, behind the caret. */
  readonly entry?: Text;
  /**
   * What narrows the list, typed after the question. An empty filter invites
   * typing while the line has room for the invitation.
   */
  readonly filter?: string;
  /** The line beneath a list naming where it stands and the keys it takes. */
  readonly hint?: PromptHint;
}

/**
 * A wait standing open: the running mark in the gutter, what is being waited
 * on, how long is left at the value column, and the key chips that act on it.
 * The `Screen` builds one while a wait is open; views never build it.
 */
export interface WaitNode {
  readonly _tag: "wait";
  /** What the terminal is parked on, in one line that never carries a value to copy. */
  readonly status: Text;
  /** How long is left, at the value column; absent when nothing expires. */
  readonly remaining?: Text;
  readonly chips: ReadonlyArray<PromptChip>;
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
  | PromptNode
  | WaitNode
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
