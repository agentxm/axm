import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { ABSENT, Screen } from "./index.js";
import { defineSpecification } from "@agentxm/specification-metadata";
import { humanScreenLayer, makeRecordingStreams } from "../test-support/screen-harness.js";

export const specification = defineSpecification({
  requirement: "cli/ascii-human-output-preserves-content",
  title: "ASCII output changes display symbols while preserving content",
  statement:
    "In human output, AXM shall use seven-bit ASCII display symbols without transliterating content when AXM_ASCII is non-empty, TERM is dumb, or the declared locale inputs consistently name non-UTF-8 locales, and shall otherwise use Unicode display symbols when locale inputs are absent or consistently name UTF-8 locales.",
  class: "human-factors",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "apps/cli/help/topics/environment.md",
    "apps/cli/src/screen/output-policy.test.ts",
    "apps/cli/src/screen/paint-text.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Which locale input controls glyph selection when LC_ALL, LC_CTYPE, and LANG disagree? Earlier environment prose described a non-UTF-8 input selecting ASCII, while the resolver and an internal example select Unicode if any input names UTF-8; this requirement does not decide mixed-locale precedence.",
  ],
  limitations: [
    {
      limitation:
        "Examples drive production policy, Screen, and painter over recording streams with supplied terminal facts. They cover status, change, live-progress, prompt, wait, answer, tree, separator, truncation, content, and absent-value examples, not an actual terminal font, locale installation, or every authored document.",
      retirementCondition:
        "Add platform, progress, prompt, or new document evidence when its distinct display-symbol obligation is allocated.",
    },
  ],
});

const content = "部署-café-🧭";
const document = [
  { _tag: "headline", tone: "ok", text: "ready" },
  { _tag: "headline", tone: "warn", text: "warning" },
  { _tag: "headline", tone: "error", text: "error" },
  { _tag: "headline", tone: "info", text: "information" },
  { _tag: "paragraph", text: content },
  {
    _tag: "ledger",
    columns: [
      { header: "Name", role: "name" },
      { header: "Detail", role: "elastic" },
    ],
    rows: [
      { mark: "create", cells: ["created", content] },
      { mark: "update", cells: ["updated"] },
      { mark: "remove", cells: ["removed"] },
      { mark: "unchanged", cells: ["unchanged"] },
      { mark: "blocked", cells: ["blocked"] },
      { mark: "failed", cells: ["failed"] },
      { mark: "rolled-back", cells: ["restored"] },
      { mark: "create", cells: ["grouped", content] },
      { mark: "working", cells: ["working"] },
      { mark: "waiting", cells: ["waiting"] },
    ],
    folds: [{ mark: "unchanged", count: 2, noun: "unchanged entries" }],
  },
  {
    _tag: "callout",
    tone: "warn",
    title: "attention",
    children: [{ _tag: "paragraph", text: content }],
  },
  // An absent value prints AXM's own marker, which must survive ASCII mode
  // unchanged: the inventory cell, the detail field, and the ledger version.
  {
    _tag: "table",
    columns: [{ header: "Name" }, { header: "Activation" }],
    rows: [{ cells: [content, ABSENT] }],
    caption: "inventory",
  },
  {
    _tag: "fields",
    fields: [
      { label: "Name", value: content },
      { label: "Latest", value: ABSENT },
    ],
  },
  {
    _tag: "prompt",
    question: "Continue?",
    chips: [{ key: "y", word: "yes", current: true }],
    filter: "needle",
    hint: { status: ["1 shown"], keys: [{ key: "arrows", word: "move" }] },
  },
  { _tag: "wait", status: "Waiting", chips: [{ key: "esc", word: "stop" }] },
  { _tag: "answer", label: "Continue?", value: "yes", mark: "ok" },
  {
    _tag: "tree",
    roots: [
      {
        text: "root",
        children: [{ text: content, children: [{ text: "leaf" }] }, { text: "sibling" }],
      },
    ],
  },
  { _tag: "next", actions: [{ description: "Inspect", cmd: `axm view ${content}` }] },
  { _tag: "summary", parts: [{ text: "finished" }, { text: content }] },
  { _tag: "section", title: "section", children: [{ _tag: "paragraph", text: content }] },
  { _tag: "markdown", content: `# ${content}` },
  { _tag: "raw", content },
  { _tag: "blank" },
] as const;

const cases = [
  { label: "AXM_ASCII numeric request", env: { AXM_ASCII: "1" }, ascii: true },
  { label: "AXM_ASCII other nonempty value", env: { AXM_ASCII: "0" }, ascii: true },
  { label: "dumb terminal", env: { TERM: "dumb" }, ascii: true },
  { label: "LC_ALL without UTF-8", env: { LC_ALL: "C" }, ascii: true },
  { label: "LC_CTYPE without UTF-8", env: { LC_CTYPE: "POSIX" }, ascii: true },
  { label: "LANG without UTF-8", env: { LANG: "C" }, ascii: true },
  {
    label: "consistent non-UTF-8 locales",
    env: { LC_ALL: "C", LC_CTYPE: "POSIX", LANG: "C" },
    ascii: true,
  },
  {
    label: "explicit ASCII wins over UTF-8",
    env: { AXM_ASCII: "1", LC_ALL: "en_US.UTF-8" },
    ascii: true,
  },
  {
    label: "dumb terminal wins over UTF-8",
    env: { TERM: "dumb", LANG: "en_US.UTF-8" },
    ascii: true,
  },
  { label: "no declared inputs", env: {}, ascii: false },
  { label: "empty ASCII request", env: { AXM_ASCII: "" }, ascii: false },
  { label: "UTF-8 LC_ALL", env: { LC_ALL: "en_US.UTF-8" }, ascii: false },
  { label: "UTF-8 LC_CTYPE", env: { LC_CTYPE: "en_US.utf8" }, ascii: false },
  { label: "UTF-8 LANG", env: { LANG: "en_US.UTF-8" }, ascii: false },
] satisfies ReadonlyArray<{
  readonly label: string;
  readonly env: NodeJS.ProcessEnv;
  readonly ascii: boolean;
}>;

describe("Human display symbols", () => {
  for (const row of cases) {
    it.effect(`${row.label} preserves content on both channels`, () => {
      const streams = makeRecordingStreams();
      return Effect.gen(function* () {
        const screen = yield* Screen;
        yield* screen.result(document);
        yield* screen.note(document);
        for (const channel of ["stdout", "stderr"] as const) {
          const output = streams.lines(channel).join("\n");
          for (const label of [
            "ready",
            "warning",
            "error",
            "information",
            "created",
            "updated",
            "removed",
            "unchanged",
            "blocked",
            "failed",
            "restored",
            "grouped",
            "attention",
            "inventory",
            "root",
            "leaf",
            "sibling",
            "Inspect",
            "finished",
            "section",
            "Latest",
            ABSENT,
          ]) {
            expect(output, `${channel}: ${label}`).toContain(label);
          }
          // All 12 independently supplied content occurrences must survive;
          // stripping them cannot make dropped or transliterated content pass.
          expect(output.split(content)).toHaveLength(13);
          const symbolsAndAsciiText = output.split(content).join("");
          expect(/^[\x20-\x7e\n]*$/u.test(symbolsAndAsciiText)).toBe(row.ascii);
        }
      }).pipe(Effect.provide(humanScreenLayer(streams, { env: row.env })), Effect.scoped);
    });
  }
});
