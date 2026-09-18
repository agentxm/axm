import type { Doc } from "../../screen/doc.js";

/**
 * Every node kind once, with nesting, so a painter proves its whole vocabulary.
 * `markdown` and `raw` content is verbatim by contract and kept short.
 */
export const everyNode: Doc = [
  { _tag: "headline", tone: "ok", text: "Ready", aside: "every node" },
  { _tag: "paragraph", text: "部署 package is ready for review after the wide-character check" },
  { _tag: "row", change: "create", cells: ["alpha", "created"] },
  {
    _tag: "rows",
    rows: [
      {
        _tag: "row",
        change: "update",
        cells: ["beta", "updated"],
        children: [
          { _tag: "paragraph", tone: "dim", text: "codex: projected at .codex/skills/beta" },
        ],
      },
      { _tag: "row", change: "remove", cells: ["gamma", "removed"] },
      { _tag: "row", change: "blocked", cells: ["delta", "blocked", "a precondition is not met"] },
      { _tag: "row", change: "failed", cells: ["epsilon", "failed"] },
      { _tag: "row", change: "rolled-back", cells: ["zeta", "rolled back"] },
    ],
  },
  {
    _tag: "ledger",
    columns: [
      { header: "Extension", role: "name" },
      { header: "Version", role: "fixed", priority: "preferred" },
      { header: "Status", role: "fixed", priority: "required" },
      { header: "Detail", role: "elastic", priority: "optional" },
    ],
    rows: [
      {
        id: "@acme/packs/review-kit",
        mark: "ok",
        cells: ["@acme/packs/review-kit", "2.1.0", "installed", "2 members"],
        children: [{ _tag: "paragraph", tone: "dim", text: "claude-code: projected" }],
      },
      {
        id: "@acme/skills/code-review",
        mark: "create",
        depth: 1,
        cells: ["@acme/skills/code-review", "1.4.0", "installed", "42 files"],
      },
      {
        id: "@acme/skills/triage",
        mark: "failed",
        cells: ["@acme/skills/triage", "2.0.1", "failed", "the registry refused the request"],
      },
    ],
    folded: { mark: "unchanged", count: 3, noun: "unchanged", hint: "--verbose to list" },
  },
  {
    _tag: "prompt",
    question: "Apply 4 changes?",
    note: "Nothing has been written yet.",
    chips: [
      { key: "N", word: "no", current: true },
      { key: "y", word: "yes" },
      { key: "d", word: "details" },
    ],
  },
  {
    _tag: "prompt",
    question: "Instructions source",
    chips: [],
    options: [
      { title: "AGENTS.md", details: ["recommended", "existing"], current: true },
      { title: "CLAUDE.md", details: ["existing"] },
    ],
    more: 1,
  },
  { _tag: "prompt", question: "Instructions file name", chips: [], entry: "docs/AGENTS.md" },
  {
    _tag: "wait",
    status: "Waiting for approval on registry.agentxm.ai",
    clock: "4m 32s left",
    chips: [
      { key: "o", word: "open" },
      { key: "c", word: "copy" },
      { key: "esc", word: "stop" },
    ],
  },
  { _tag: "answer", mark: "ok", label: "Instructions source", value: "AGENTS.md" },
  { _tag: "answer", mark: "dim", label: "Agents", value: "claude-code, codex" },
  {
    _tag: "collapsed",
    change: "unchanged",
    count: 2,
    noun: "unchanged",
    hint: "--verbose to list",
  },
  {
    _tag: "callout",
    tone: "warn",
    title: "Warning",
    aside: "not blocking",
    children: [{ _tag: "paragraph", text: "Check permissions" }],
  },
  {
    _tag: "callout",
    tone: "info",
    title: "Note without children",
  },
  {
    _tag: "table",
    caption: "Inventory",
    columns: [
      { header: "Name", priority: "required" },
      { header: "State" },
      { header: "Count", align: "right" },
    ],
    rows: [
      { cells: ["alpha", "ready", "12"] },
      { mark: "warn", cells: ["beta", [{ text: "blocked", tone: "warn" }], "3"] },
    ],
  },
  {
    _tag: "fields",
    fields: [
      { label: "Owner", value: [{ text: "@acme", link: "https://axm.sh/@acme" }] },
      {
        label: "Description",
        value: "A field whose value is long enough to need wrapping at narrow widths",
      },
    ],
  },
  {
    _tag: "tree",
    roots: [
      {
        text: "root",
        detail: "managed",
        children: [
          { text: "child", children: [{ text: "grandchild", detail: "leaf" }] },
          { text: "sibling" },
        ],
      },
    ],
  },
  {
    _tag: "next",
    actions: [
      { description: "Inspect", cmd: "axm list" },
      { description: "Read the guide", url: "https://axm.sh/docs" },
    ],
  },
  {
    _tag: "summary",
    tone: "ok",
    parts: [{ text: "1 changed" }, { text: "2 unchanged" }],
    elapsedMs: 1200,
  },
  {
    _tag: "section",
    title: "Details",
    children: [
      { _tag: "paragraph", text: "Section body" },
      {
        _tag: "section",
        children: [{ _tag: "paragraph", tone: "dim", text: "Untitled subsection" }],
      },
    ],
  },
  { _tag: "markdown", content: "# Heading" },
  { _tag: "raw", content: "pre-sanitized" },
  { _tag: "blank" },
];
