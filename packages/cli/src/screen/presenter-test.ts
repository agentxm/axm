import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Schema from "effect/Schema";

import { type BoxOptions, type LogMessage, type ResultOptions } from "./output.js";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { Screen, plain, type Doc, type DocNode, type TaskHandle } from "./index.js";

// ---------------------------------------------------------------------------
// TestRendererState — mutable state object capturing all ScreenPresenter calls
// ---------------------------------------------------------------------------

export interface TestRendererState {
  readonly logs: Array<LogMessage>;
  readonly diagnostics: Array<string>;
  readonly tables: Array<{
    items: ReadonlyArray<unknown>;
    view: unknown;
    caption?: string;
  }>;
  readonly details: Array<{
    item: unknown;
    view: unknown;
    title?: string;
  }>;
  readonly trees: Array<{
    roots: ReadonlyArray<unknown>;
    def: unknown;
    title?: string;
  }>;
  readonly results: Array<{
    data: unknown;
    schema: Option.Option<Schema.Top>;
    ok?: boolean;
  }>;
  readonly markdown: Array<string>;
  readonly spinnerMessages: Array<string>;
  readonly notes: Array<{ message: string; title?: string }>;
  readonly boxes: Array<{ message: string; title?: string; opts?: BoxOptions }>;
  readonly cancelMessages: Array<string>;
  readonly introTitles: Array<string>;
  readonly outroMessages: Array<string>;
  readonly suggestions: Array<SuggestedAction>;
  readonly summaries: Array<string>;
  readonly docs: Array<{ readonly channel: "stdout" | "stderr"; readonly doc: Doc }>;
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

const makeEmptyState = (): TestRendererState => ({
  logs: [],
  diagnostics: [],
  tables: [],
  details: [],
  trees: [],
  results: [],
  markdown: [],
  spinnerMessages: [],
  notes: [],
  boxes: [],
  cancelMessages: [],
  introTitles: [],
  outroMessages: [],
  suggestions: [],
  summaries: [],
  docs: [],
});

const nodeText = (node: DocNode): string => {
  switch (node._tag) {
    case "headline":
    case "paragraph":
      return plain(node.text);
    case "row":
      return node.cells.map(plain).join("   ");
    case "collapsed":
      return `${String(node.count)} ${node.noun}`;
    case "callout":
      return plain(node.title);
    case "summary":
      return node.parts.map((part) => plain(part.text)).join(", ");
    case "section":
      return node.title === undefined ? "" : plain(node.title);
    case "markdown":
      return node.content;
    case "raw":
      return node.content;
    case "fields":
      return node.fields.map((field) => `${plain(field.label)}: ${plain(field.value)}`).join("\n");
    case "table":
      return node.rows.map((row) => row.map(plain).join("   ")).join("\n");
    case "tree":
      return node.roots.map((root) => plain(root.text)).join("\n");
    case "rows":
    case "next":
    case "blank":
      return "";
  }
};

const keyFromHeader = (header: string): string => {
  if (header === "Capability") return "capabilityKey";
  if (header === "AXM") return "axm";
  if (header === "Last used") return "lastUsedAt";
  if (header === "Expires") return "expiresAt";
  const words = header.trim().split(/[^A-Za-z0-9]+/u);
  const first = words[0]?.toLowerCase() ?? "column";
  return `${first}${words
    .slice(1)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join("")}`;
};

const captureDoc = (
  state: TestRendererState,
  doc: Doc,
  channel: "stdout" | "stderr",
  persistent = false,
): void => {
  const capture = (node: DocNode): void => {
    if (node._tag === "rows") {
      for (const row of node.rows) {
        state.summaries.push(nodeText(row));
        if (row.change === "failed") {
          state.logs.push({ _tag: "error", message: nodeText(row) });
        }
        if (row.children !== undefined) captureDoc(state, row.children, channel, persistent);
      }
      return;
    }
    if (node._tag === "section") {
      if (node.children.length === 1 && node.children[0]?._tag === "raw") {
        state.summaries.push(node.children[0].content);
        return;
      }
      if (node.title !== undefined)
        state.logs.push({ _tag: "message", message: plain(node.title) });
      captureDoc(state, node.children, channel, persistent);
      return;
    }
    if (node._tag === "next") {
      state.suggestions.push(...node.actions);
      return;
    }
    if (node._tag === "blank") return;
    if (node._tag === "table") {
      const keys = node.columns.map((column) => keyFromHeader(plain(column.header)));
      state.tables.push({
        items: node.rows.map((row) =>
          Object.fromEntries(
            row.map((cell, index) => [keys[index] ?? `column${String(index)}`, plain(cell)]),
          ),
        ),
        view: node.columns,
        ...(node.caption === undefined ? {} : { caption: plain(node.caption) }),
      });
      return;
    }
    if (node._tag === "fields") {
      state.details.push({
        item: Object.fromEntries(
          node.fields.map((field) => [keyFromHeader(plain(field.label)), plain(field.value)]),
        ),
        view: node.fields,
      });
      return;
    }
    if (node._tag === "markdown") {
      state.markdown.push(node.content);
      return;
    }
    if (node._tag === "raw") {
      state.logs.push({ _tag: "message", message: node.content });
      return;
    }
    if (node._tag === "callout") {
      const message =
        node.children === undefined ? "" : node.children.map(nodeText).filter(Boolean).join("\n");
      if (node.tone === "info") {
        state.notes.push({ message, title: plain(node.title) });
        return;
      }
      if (node.tone === "warn" && node.children !== undefined) {
        state.logs.push({ _tag: "warn", message: plain(node.title) });
        for (const child of node.children) {
          const childMessage = nodeText(child);
          if (childMessage.length > 0) state.logs.push({ _tag: "info", message: childMessage });
        }
        return;
      }
    }
    if (node._tag === "paragraph" && channel === "stdout") return;
    const message = nodeText(node);
    if (message.length === 0) return;
    const tag =
      node._tag === "headline"
        ? node.tone === "ok"
          ? "success"
          : node.tone === "warn"
            ? "warn"
            : node.tone === "error"
              ? "error"
              : "info"
        : node._tag === "callout"
          ? node.tone === "error"
            ? "error"
            : node.tone === "warn"
              ? "warn"
              : "info"
          : node._tag === "paragraph" && persistent
            ? "info"
            : "message";
    state.logs.push({ _tag: tag, message });
    if (node._tag === "callout" && node.children !== undefined) {
      captureDoc(state, node.children, channel, persistent);
    }
  };
  for (const node of doc) capture(node);
};

const makeTestScreenService = (
  state: TestRendererState,
  resultReturnValue: boolean,
): typeof Screen.Service => ({
  result: (doc) =>
    Effect.sync(() => {
      state.docs.push({ channel: "stdout", doc });
      captureDoc(state, doc, "stdout");
    }),
  note: (doc, options) =>
    Effect.sync(() => {
      state.docs.push({ channel: "stderr", doc });
      captureDoc(state, doc, "stderr", options?.persistent === true);
    }),
  document: <S extends Schema.Top>(
    data: Schema.Schema.Type<S>,
    schema: S,
    options?: ResultOptions,
  ) =>
    Effect.sync(() => {
      state.results.push({
        data,
        schema: Option.some(schema),
        ...(options?.ok === undefined ? {} : { ok: options.ok }),
      });
      if (
        resultReturnValue &&
        options?.withoutSuggestions !== true &&
        options?.suggestions !== undefined
      ) {
        state.suggestions.push(...options.suggestions);
      }
      return resultReturnValue;
    }),
  task: <A, E, R>(
    label: string,
    body: (handle: TaskHandle) => Effect.Effect<A, E, R>,
    options?: {
      readonly successMessage?: string | ((value: A) => string);
      readonly failureMessage?: string;
    },
  ) => {
    state.spinnerMessages.push(label);
    const handle: TaskHandle = {
      update: (message) =>
        Effect.sync(() => {
          state.spinnerMessages.push(message);
        }),
      progress: (done, total) =>
        Effect.sync(() => {
          state.spinnerMessages.push(`${done}/${total}`);
        }),
      child: (message) => Effect.succeed(handle).pipe(Effect.tap(() => handle.update(message))),
    };
    return Effect.interruptible(body(handle)).pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) => {
          if (Cause.hasInterruptsOnly(cause)) {
            state.cancelMessages.push("Cancelled");
          } else {
            state.spinnerMessages.push(options?.failureMessage ?? "Failed");
            state.logs.push({ _tag: "error", message: options?.failureMessage ?? label });
          }
          return Effect.failCause(cause);
        },
        onSuccess: (value) =>
          Effect.sync(() => {
            const message =
              typeof options?.successMessage === "function"
                ? options.successMessage(value)
                : options?.successMessage;
            if (message !== undefined) state.spinnerMessages.push(message);
            return value;
          }),
      }),
      Effect.uninterruptible,
    );
  },
  log: (record) =>
    Effect.sync(() => {
      state.logs.push({
        _tag:
          record.level === "warn"
            ? "warn"
            : record.level === "error" || record.level === "fatal"
              ? "error"
              : "info",
        message: record.message,
      });
    }),
  prompt: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  facts: Effect.succeed({ columns: 80, colors: false, animate: false }),
  settle: Effect.void,
});

// ---------------------------------------------------------------------------
// logsByTag — convenience getter object for filtering logs by tag
// ---------------------------------------------------------------------------

export const logsByTag = (state: TestRendererState) => ({
  get message() {
    return state.logs.filter((l) => l._tag === "message").map((l) => l.message);
  },
  get info() {
    return state.logs.filter((l) => l._tag === "info").map((l) => l.message);
  },
  get warn() {
    return state.logs.filter((l) => l._tag === "warn").map((l) => l.message);
  },
  get error() {
    return state.logs.filter((l) => l._tag === "error").map((l) => l.message);
  },
  get success() {
    return state.logs.filter((l) => l._tag === "success").map((l) => l.message);
  },
  get step() {
    return state.logs.filter((l) => l._tag === "step").map((l) => l.message);
  },
});

// ---------------------------------------------------------------------------
// TestRenderer — result() returns false (simulates interactive mode)
// ---------------------------------------------------------------------------

export const TestRenderer = {
  make: (): {
    readonly layer: Layer.Layer<Screen>;
    readonly state: TestRendererState;
  } => {
    const state = makeEmptyState();
    const layer = Layer.succeed(Screen, makeTestScreenService(state, false));
    return { layer, state };
  },
};

// ---------------------------------------------------------------------------
// TestMachineRenderer — result() returns true (simulates machine mode)
// ---------------------------------------------------------------------------

export const TestMachineRenderer = {
  make: (): {
    readonly layer: Layer.Layer<Screen>;
    readonly state: TestRendererState;
  } => {
    const state = makeEmptyState();
    const layer = Layer.succeed(Screen, makeTestScreenService(state, true));
    return { layer, state };
  },
};
