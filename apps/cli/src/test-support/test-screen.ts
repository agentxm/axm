/**
 * The one test double for `Screen`.
 *
 * It records what the Screen contract carries — each `Doc` with its channel
 * and persistence, each machine document with its schema and completion, the
 * suggestions a reader is offered, lifecycle events, log records, and
 * credentials — and answers questions and waits from scripts replayed through
 * the production reducers. Tests read Doc content through the small queries
 * below rather than through buckets reconstructed from a retired API.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Schema from "effect/Schema";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { subscribeLossless, type OperationEvent } from "@agentxm/workspace-kernel/operations";

import { promptAvailability } from "../cli-flags/interactivity.js";
import { plain, type Doc, type DocNode, type LedgerRow, type Tone } from "../screen/doc.js";
import { paintText, type PaintStyle } from "../screen/paint-text.js";
import { Screen, type ResultOptions, type ScreenLogRecord } from "../screen/screen.js";
import { emptyAskScript, scriptedAsk, type AskScript } from "./scripted-ask.js";
import { emptyWaitScript, scriptedWait, type WaitScript } from "./scripted-wait.js";

export interface TestScreenState {
  /** Every settled document, in order, with the stream it reached. */
  readonly docs: Array<{
    readonly channel: "stdout" | "stderr";
    readonly doc: Doc;
    /** Whether the document is required guidance that outlives its moment. */
    readonly persistent: boolean;
  }>;
  /** Every machine document, with its schema and, when it completed, its outcome. */
  readonly results: Array<{
    readonly data: unknown;
    readonly schema: Option.Option<Schema.Top>;
    readonly ok?: boolean;
    readonly completion?: ResultOptions["completion"];
  }>;
  /** Suggestions a reader is offered: machine envelope suggestions and `next` actions. */
  readonly suggestions: Array<SuggestedAction>;
  /** Every lifecycle event observed, in order, across observed operations. */
  readonly events: Array<OperationEvent>;
  readonly logs: Array<ScreenLogRecord>;
  /** Every raw credential delivered to stdout, in order. */
  readonly credentials: Array<string>;
  /** Questions this screen was given, and the keys it answers the next ones with. */
  readonly script: AskScript;
  readonly waitScript: WaitScript;
}

type NodeOf<K extends DocNode["_tag"]> = Extract<DocNode, { readonly _tag: K }>;

/** Nodes a node contains, in reading order. */
const childrenOf = (node: DocNode): Doc => {
  switch (node._tag) {
    case "section":
      return node.children;
    case "callout":
      return node.children ?? [];
    case "ledger":
      return node.rows.flatMap((row) => row.children ?? []);
    default:
      return [];
  }
};

const descend = (doc: Doc): ReadonlyArray<DocNode> =>
  doc.flatMap((node) => [node, ...descend(childrenOf(node))]);

const isNodeOf =
  <K extends DocNode["_tag"]>(tag: K) =>
  (node: DocNode): node is NodeOf<K> =>
    node._tag === tag;

/** Every node of one kind across the recorded documents, nested ones included, in order. */
const nodesOf = <K extends DocNode["_tag"]>(
  state: TestScreenState,
  tag: K,
): ReadonlyArray<NodeOf<K>> =>
  state.docs.flatMap((entry) => descend(entry.doc)).filter(isNodeOf(tag));

/**
 * One row as a reader takes it in: its cells, and the reason beneath it where
 * it did not settle as planned. The reason is part of the row, so a test that
 * reads this text sees what the painter would put on the terminal.
 */
const rowText = (row: LedgerRow): string =>
  [...row.cells.map(plain), ...(row.reason === undefined ? [] : [plain(row.reason)])].join("   ");

/** Every ledger row, as a reader takes it in, across the recorded documents. */
export const ledgerRows = (state: TestScreenState): ReadonlyArray<string> =>
  nodesOf(state, "ledger").flatMap((node) => node.rows.map(rowText));

/** Every table: its caption and its rows keyed by plain column header. */
export const tables = (
  state: TestScreenState,
): ReadonlyArray<{
  readonly caption: string | undefined;
  readonly rows: ReadonlyArray<Readonly<Record<string, string>>>;
}> =>
  nodesOf(state, "table").map((node) => ({
    caption: node.caption === undefined ? undefined : plain(node.caption),
    rows: node.rows.map((row) =>
      Object.fromEntries(
        node.columns.map((column, index) => [plain(column.header), plain(row.cells[index] ?? "")]),
      ),
    ),
  }));

/** Every fields block, as plain values keyed by plain label. */
export const fieldSets = (
  state: TestScreenState,
): ReadonlyArray<Readonly<Record<string, string>>> =>
  nodesOf(state, "fields").map((node) =>
    Object.fromEntries(node.fields.map((field) => [plain(field.label), plain(field.value)])),
  );

/** Every markdown body, verbatim. */
export const markdown = (state: TestScreenState): ReadonlyArray<string> =>
  nodesOf(state, "markdown").map((node) => node.content);

const nodeText = (node: DocNode): string => {
  switch (node._tag) {
    case "headline":
    case "paragraph":
      return plain(node.text);
    case "ledger":
      return node.rows.map(rowText).join("\n");
    case "prompt":
      return plain(node.question);
    case "wait":
      return plain(node.status);
    case "answer":
      return `${plain(node.label)}: ${plain(node.value)}`;
    case "callout":
      return node.aside === undefined
        ? plain(node.title)
        : `${plain(node.title)} ${plain(node.aside)}`;
    case "summary":
      return node.parts.map((part) => plain(part.text)).join(", ");
    case "section":
      return node.title === undefined ? "" : plain(node.title);
    case "markdown":
    case "raw":
      return node.content;
    case "fields":
      return node.fields.map((field) => `${plain(field.label)}: ${plain(field.value)}`).join("\n");
    case "table":
      return node.rows.map((row) => row.cells.map(plain).join("   ")).join("\n");
    case "next":
    case "blank":
      return "";
  }
};

/** Every callout: its tone, its plain title, and the plain text of its body lines. */
export const callouts = (
  state: TestScreenState,
): ReadonlyArray<{ readonly tone: Tone; readonly title: string; readonly body: string }> =>
  nodesOf(state, "callout").map((node) => ({
    tone: node.tone,
    title: plain(node.title),
    body: (node.children ?? []).map(nodeText).filter(Boolean).join("\n"),
  }));

/** One line a reader is told, by the voice it is told in. */
export interface TestScreenMessage {
  readonly _tag: "message" | "info" | "success" | "warn" | "error";
  readonly message: string;
}

const toneTag = (tone: Tone | undefined): TestScreenMessage["_tag"] =>
  tone === "ok" ? "success" : tone === "warn" ? "warn" : tone === "error" ? "error" : "info";

/**
 * The prose lines of one document, tagged by tone. Structured content — tables,
 * fields, markdown, informational callouts, suggestions, and ledger rows that
 * settled as planned — is read through its own query instead, and a stdout
 * paragraph belongs to the result rather than to what the reader is told.
 */
const docMessages = (
  doc: Doc,
  channel: "stdout" | "stderr",
  persistent: boolean,
): ReadonlyArray<TestScreenMessage> =>
  doc.flatMap((node): ReadonlyArray<TestScreenMessage> => {
    switch (node._tag) {
      case "ledger":
        return [
          ...node.rows.flatMap((row) => [
            ...(row.mark === "failed" ? [{ _tag: "error" as const, message: rowText(row) }] : []),
            ...(row.children === undefined ? [] : docMessages(row.children, channel, persistent)),
          ]),
          ...(node.folds ?? []).map((fold) => ({
            _tag: "message" as const,
            message: `${String(fold.count)} ${fold.noun}`,
          })),
        ];
      case "section":
        if (node.children.length === 1 && node.children[0]?._tag === "raw") return [];
        return [
          ...(node.title === undefined
            ? []
            : [{ _tag: "message" as const, message: plain(node.title) }]),
          ...docMessages(node.children, channel, persistent),
        ];
      case "next":
      case "blank":
      case "table":
      case "fields":
      case "markdown":
        return [];
      case "raw":
        return [{ _tag: "message", message: node.content }];
      case "callout": {
        if (node.tone === "info") return [];
        if (node.tone === "warn" && node.children !== undefined) {
          return [
            { _tag: "warn", message: plain(node.title) },
            ...node.children
              .map(nodeText)
              .filter((message) => message.length > 0)
              .map((message) => ({ _tag: "info" as const, message })),
          ];
        }
        const message = nodeText(node);
        if (message.length === 0) return [];
        return [
          {
            _tag: node.tone === "error" ? "error" : node.tone === "warn" ? "warn" : "info",
            message,
          },
          ...(node.children === undefined ? [] : docMessages(node.children, channel, persistent)),
        ];
      }
      case "paragraph": {
        if (channel === "stdout") return [];
        const message = nodeText(node);
        return message.length === 0 ? [] : [{ _tag: persistent ? "info" : "message", message }];
      }
      case "headline": {
        const message = nodeText(node);
        return message.length === 0 ? [] : [{ _tag: toneTag(node.tone), message }];
      }
      default: {
        const message = nodeText(node);
        return message.length === 0 ? [] : [{ _tag: "message", message }];
      }
    }
  });

/** The prose lines of every recorded document, in order, tagged by tone. */
export const messages = (state: TestScreenState): ReadonlyArray<TestScreenMessage> =>
  state.docs.flatMap((entry) => docMessages(entry.doc, entry.channel, entry.persistent));

/** The recorded prose lines, one getter per tone tag. */
export const logsByTag = (state: TestScreenState) => {
  const tagged = (tag: TestScreenMessage["_tag"]) =>
    messages(state)
      .filter((entry) => entry._tag === tag)
      .map((entry) => entry.message);
  return {
    get message() {
      return tagged("message");
    },
    get info() {
      return tagged("info");
    },
    get warn() {
      return tagged("warn");
    },
    get error() {
      return tagged("error");
    },
    get success() {
      return tagged("success");
    },
  };
};

/** Every recorded document painted as plain text, in order. */
export const rendered = (
  state: TestScreenState,
  style: PaintStyle = { width: 80, colors: false },
): string => state.docs.flatMap((entry) => paintText(entry.doc, style)).join("\n");

/** Labels of the units observed operations started, in order. */
export const startedUnits = (state: TestScreenState): ReadonlyArray<string> =>
  state.events.flatMap((event) => (event._tag === "UnitStarted" ? [event.label] : []));

/** Terminal states of the units observed operations resolved, keyed by label, in order. */
export const resolvedUnits = (
  state: TestScreenState,
): ReadonlyArray<{ readonly label: string; readonly state: string }> =>
  state.events.flatMap((event) =>
    event._tag === "UnitResolved" ? [{ label: event.label, state: event.state }] : [],
  );

export interface TestScreenOptions {
  /**
   * Machine output: `document` writes the result and answers `true`, its
   * suggestions are offered, no question can open, and stdout is not a
   * terminal.
   */
  readonly machine?: boolean;
  /**
   * Whether a question can open on the human screen. Omitted, the flags
   * decide `canAsk` and scripted questions are answered.
   */
  readonly interactive?: boolean;
  readonly onEvent?: (event: OperationEvent) => Effect.Effect<void>;
}

export const makeTestScreen = (
  options: TestScreenOptions = {},
): {
  readonly layer: Layer.Layer<Screen>;
  readonly state: TestScreenState;
} => {
  const machine = options.machine === true;
  const state: TestScreenState = {
    docs: [],
    results: [],
    suggestions: [],
    events: [],
    logs: [],
    credentials: [],
    script: emptyAskScript(),
    waitScript: emptyWaitScript(),
  };
  const record = (channel: "stdout" | "stderr", doc: Doc, persistent = false): void => {
    state.docs.push({ channel, doc, persistent });
    state.suggestions.push(
      ...descend(doc).flatMap((node) => (node._tag === "next" ? node.actions : [])),
    );
  };
  const layer = Layer.succeed(Screen, {
    result: (doc) => Effect.sync(() => record("stdout", doc)),
    credential: (content) => Effect.sync(() => void state.credentials.push(content)),
    note: (doc) => Effect.sync(() => record("stderr", doc)),
    instruction: (doc) => Effect.sync(() => record("stderr", doc, true)),
    document: <S extends Schema.Top>(
      data: Schema.Schema.Type<S>,
      schema: S,
      resultOptions?: ResultOptions,
    ) =>
      Effect.sync(() => {
        state.results.push({
          data,
          schema: Option.some(schema),
          ...(resultOptions?.completion === undefined
            ? {}
            : {
                ok: resultOptions.completion.exitCode === 0,
                completion: resultOptions.completion,
              }),
        });
        // Only the machine envelope carries a document's suggestions; a human
        // reader is offered them through the `next` actions of a Doc.
        if (machine && resultOptions?.withoutSuggestions !== true) {
          state.suggestions.push(...(resultOptions?.suggestions ?? []));
        }
        return machine;
      }),
    observe: (lifecycle) =>
      subscribeLossless(lifecycle, (event) =>
        Effect.sync(() => void state.events.push(event)).pipe(
          Effect.andThen(() => options.onEvent?.(event) ?? Effect.void),
        ),
      ),
    log: (logRecord) => Effect.sync(() => void state.logs.push(logRecord)),
    // Machine output never prompts, whatever the script holds: asking is the
    // usage error by construction, as it is on the real machine screen.
    canAsk: machine
      ? Effect.succeed(false)
      : options.interactive === undefined
        ? promptAvailability
        : Effect.succeed(options.interactive),
    ask: scriptedAsk(
      state.script,
      (doc) => record("stderr", doc),
      !machine && options.interactive !== false,
    ),
    wait: scriptedWait(state.waitScript, (doc, persistent) => record("stderr", doc, persistent)),
    facts: Effect.succeed({
      columns: 80,
      stdoutIsTTY: !machine,
      colors: false,
      animate: false,
    }),
    settle: Effect.void,
  });
  return { layer, state };
};
