import type { FailureSuggestedAction } from "@agentxm/workspace-kernel/operations";

import type { CalloutNode, Doc, DocNode, Field, Text, Tone } from "./doc.js";
import { factParts } from "./docs.js";
import { scopePhrase } from "./phrases.js";
import { emphatic, normalizeSuggestions } from "./presenter-helpers.js";

/**
 * The shapes a command's human result takes. Each one fixes which parts a
 * result has and the order they come in, so the order and spacing rules of
 * docs/architecture/commands/terminal-design.md hold by construction: a
 * condition stands between the rows and the verdict, and `Next` closes every
 * result. A view chooses the shape its result means and fills it; it never
 * arranges the nodes itself.
 */

/** Where a command acts, stated once on its title line so no row repeats it. */
export interface TitleWhere {
  readonly scope?: "project" | "user";
  /** The project directory's name, so a reader with several checkouts sees which one changed. */
  readonly project?: string;
  readonly agents?: ReadonlyArray<string>;
  /** Other facts about where the command acts, such as the account it publishes as. */
  readonly facts?: ReadonlyArray<Text | undefined>;
}

/** The title line that opens a result with a ledger: what it is doing, then where. */
export const titleDoc = (title: string, where: TitleWhere = {}): Doc => {
  const aside = factParts([
    where.scope === undefined ? undefined : scopePhrase(where.scope, where.project),
    where.agents === undefined || where.agents.length === 0
      ? undefined
      : `agents: ${where.agents.join(", ")}`,
    ...(where.facts ?? []),
  ]);
  return [
    {
      _tag: "headline",
      tone: "neutral",
      text: emphatic(title),
      ...(aside.length === 0 ? {} : { aside }),
    },
  ];
};

/** The actions `Next` offers; an invocation is rendered as the command a person runs. */
type NextActions = ReadonlyArray<FailureSuggestedAction>;

const nextDoc = (next: NextActions | undefined): Doc => {
  const actions = normalizeSuggestions(next);
  return actions.length === 0 ? [] : [{ _tag: "next", actions }];
};

/**
 * A command that reviewed or changed several units: its title line, the
 * ledger and whatever the ledger carries, the conditions it reports about
 * those units, its verdict, and `Next`.
 */
export interface OperationResult {
  /** Absent where there is no ledger, or quiet leaves the narration out. */
  readonly title?: Doc;
  readonly body: Doc;
  /** Conditions about the units, always callouts, between the rows and the verdict. */
  readonly conditions?: ReadonlyArray<CalloutNode>;
  readonly verdict: Doc;
  /** What follows the verdict before `Next`, such as the links a publish produced. */
  readonly after?: Doc;
  readonly next?: NextActions;
}

export const operationResultDoc = (result: OperationResult): Doc => [
  ...(result.title ?? []),
  ...result.body,
  ...(result.conditions ?? []),
  ...result.verdict,
  ...(result.after ?? []),
  ...nextDoc(result.next),
];

/**
 * A command that found nothing to show or nothing to do: one statement, with
 * no closing stop, and where it says so the command that would change that.
 * A no-op outcome is `ok` and keeps its glyph; an empty read is `neutral`.
 */
export interface EmptyResult {
  readonly tone?: Extract<Tone, "ok" | "neutral" | "info">;
  readonly statement: string;
  /** Facts beside the statement, such as where the command looked. */
  readonly facts?: ReadonlyArray<Text | undefined>;
  readonly next?: NextActions;
}

const phrase = (statement: string): string => statement.trimEnd().replace(/\.$/u, "");

export const emptyDoc = (result: EmptyResult): Doc => {
  const aside = factParts(result.facts ?? []);
  return [
    {
      _tag: "headline",
      tone: result.tone ?? "neutral",
      text: phrase(result.statement),
      ...(aside.length === 0 ? {} : { aside }),
    },
    ...nextDoc(result.next),
  ];
};

/**
 * A command that settled one thing and has facts to record about it: the
 * verdict and its facts, the record as fields, the conditions that deserve
 * attention, then `Next`. Deprecations, visibility changes, upgrades, and
 * cache maintenance share it.
 */
export interface RecordResult {
  readonly tone: Tone;
  readonly verdict: string;
  readonly facts?: ReadonlyArray<Text | undefined>;
  readonly fields?: ReadonlyArray<Field | undefined>;
  /** Prose that explains the record, such as a reason, beneath the fields. */
  readonly notes?: ReadonlyArray<Text>;
  readonly conditions?: ReadonlyArray<CalloutNode>;
  /** Detail sections a reader asked for, such as the commands an upgrade ran. */
  readonly sections?: ReadonlyArray<{ readonly title: Text; readonly children: Doc }>;
  readonly next?: NextActions;
}

export const recordDoc = (result: RecordResult): Doc => {
  const aside = factParts(result.facts ?? []);
  const fields = (result.fields ?? []).filter((field): field is Field => field !== undefined);
  return [
    {
      _tag: "headline",
      tone: result.tone,
      text: phrase(result.verdict),
      ...(aside.length === 0 ? {} : { aside }),
    },
    ...(fields.length === 0 ? [] : [{ _tag: "fields", fields } as const]),
    ...(result.notes ?? []).map((text): DocNode => ({ _tag: "paragraph", text })),
    ...(result.conditions ?? []),
    ...(result.sections ?? []).map((section): DocNode => ({
      _tag: "section",
      title: section.title,
      children: section.children,
    })),
    ...nextDoc(result.next),
  ];
};

/**
 * A condition that deserves attention: its mark and title, facts at the value
 * column, and the prose or fields that explain it.
 */
export const conditionDoc = (condition: {
  readonly tone: Extract<Tone, "warn" | "error" | "info">;
  readonly title: Text;
  readonly facts?: ReadonlyArray<Text | undefined>;
  readonly body?: ReadonlyArray<Text>;
  readonly children?: Doc;
}): CalloutNode => {
  const aside = factParts(condition.facts ?? []);
  const children: Doc = [
    ...(condition.body ?? []).map((text): DocNode => ({ _tag: "paragraph", text })),
    ...(condition.children ?? []),
  ];
  return {
    _tag: "callout",
    tone: condition.tone,
    title: condition.title,
    ...(aside.length === 0 ? {} : { aside }),
    ...(children.length === 0 ? {} : { children }),
  };
};
