import type { Doc } from "../../screen/doc.js";
import { galleryModule } from "./fixture.js";

/**
 * The painter's whole vocabulary, split into screens a person could meet so
 * each reads as one result rather than an inventory of nodes. Together the
 * `vocabulary--` fixtures carry every node kind and non-text painter fact,
 * which the renderer conformance suite requires. `markdown` and `raw` content
 * is verbatim by contract and kept short.
 */

/** A settled operation: title, ledger, the conditions it reports, verdict, then `Next`. */
const result: Doc = [
  {
    _tag: "headline",
    tone: "neutral",
    text: "Installing 3 extensions",
    aside: [{ text: "this project" }, { text: "claude-code, codex" }],
  },
  {
    _tag: "ledger",
    columns: [
      { header: "Extension", role: "name" },
      { header: "Version", role: "fixed", priority: "preferred", align: "right" },
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
        cells: ["@acme/skills/triage", "2.0.1", "failed", ""],
        reason: "the registry refused the request",
      },
    ],
    folds: [{ mark: "unchanged", count: 3, noun: "unchanged", hint: "--verbose to list" }],
  },
  {
    _tag: "callout",
    tone: "warn",
    title: "Release age held 1 update",
    aside: [{ text: "not blocking" }],
    children: [{ _tag: "paragraph", text: "@acme/skills/lint 3.0.0 is newer than 7 days." }],
  },
  { _tag: "callout", tone: "info", title: "Codex reads AGENTS.md" },
  { _tag: "headline", tone: "warn", text: "Installed 2 of 3 extensions", verdict: true },
  {
    _tag: "next",
    actions: [
      { description: "Retry the extension that failed", cmd: "axm install @acme/skills/triage" },
      { description: "Read about registry refusals", url: "https://axm.sh/docs/registry" },
    ],
  },
];

/** A read of one item: its outcome, prose about it, its fields, members, and details. */
const read: Doc = [
  {
    _tag: "headline",
    tone: "ok",
    text: "@acme/packs/review-kit is ready",
    aside: [{ text: "2.1.0" }],
  },
  {
    _tag: "paragraph",
    text: [
      { text: "部署", tint: "magenta" },
      { text: " bundles " },
      { text: "code review", bold: true },
      { text: " and triage for " },
      { text: "@acme", tone: "info", link: "https://axm.sh/@acme" },
      { text: " teams. Install it with " },
      { text: "axm install @acme/packs/review-kit", copyable: true },
    ],
  },
  { _tag: "blank" },
  { _tag: "paragraph", text: "Members install together and update as one pack." },
  {
    _tag: "fields",
    fields: [
      { label: "Owner", value: [{ text: "@acme", link: "https://axm.sh/@acme" }] },
      {
        label: "Page",
        value: [{ text: "https://agentxm.ai/@acme/packs/review-kit", kind: "url" }],
      },
      {
        label: "Location",
        value: [{ text: "~/code/storefront/agent_extensions/review-kit", kind: "path" }],
      },
      { label: "Update", value: [{ text: "axm update @acme/packs/review-kit", kind: "command" }] },
      { label: "Request", value: [{ text: "req_01J8ZQ4M7T", kind: "identifier" }] },
      {
        label: "Description",
        value: "A field whose value is long enough to need wrapping at narrow widths",
      },
    ],
  },
  {
    _tag: "table",
    caption: "Members",
    columns: [
      { header: "Name", priority: "required", width: 16, minWidth: 8 },
      { header: "State" },
      { header: "Files", align: "right" },
    ],
    rows: [
      { cells: ["code-review", "ready", "42"] },
      { mark: "warn", cells: ["triage", [{ text: "blocked", tone: "warn" }], "3"] },
    ],
  },
  { _tag: "summary", parts: [{ text: "2 members" }, { text: "1 blocked" }] },
  {
    _tag: "section",
    title: "Details",
    children: [
      { _tag: "paragraph", text: "Published 12 Sep" },
      {
        _tag: "section",
        children: [{ _tag: "paragraph", tone: "dim", text: "Signed with the registry key" }],
      },
    ],
  },
];

/** Text the painter passes through untouched. */
const passthrough: Doc = [
  { _tag: "markdown", content: "## 2.1.0\n\n- Adds the triage skill" },
  {
    _tag: "section",
    title: "Response",
    children: [{ _tag: "raw", content: '{\n  "error": "refused"\n}' }],
  },
];

/** One open multi-pick question beneath the answers already given. */
const choose: Doc = [
  { _tag: "answer", mark: "ok", label: "Instructions source", value: "AGENTS.md" },
  { _tag: "answer", mark: "dim", label: "Scope", value: "this project" },
  {
    _tag: "prompt",
    question: "Agents to set up",
    chips: [],
    options: [
      { title: "Claude Code", details: ["detected"], picked: "all", before: 2 },
      { title: "Project agents", details: ["recommended"], picked: "some", current: true },
      { title: "Codex", details: ["detected", "existing"], picked: "all", depth: 1 },
      { title: "Cursor", picked: "none", depth: 1 },
    ],
    more: 1,
  },
];

const confirm: Doc = [
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
];

const entry: Doc = [
  { _tag: "prompt", question: "Instructions file name", chips: [], entry: "docs/AGENTS.md" },
];

const wait: Doc = [
  {
    _tag: "wait",
    status: "Waiting for you to sign in",
    remaining: "4:32 left",
    chips: [
      { key: "o", word: "open" },
      { key: "c", word: "copy" },
      { key: "esc", word: "stop" },
    ],
  },
];

export default galleryModule(
  { _tag: "document", name: "vocabulary--result", doc: result },
  { _tag: "document", name: "vocabulary--read", doc: read },
  { _tag: "document", name: "vocabulary--passthrough", doc: passthrough },
  { _tag: "document", name: "vocabulary--choose", doc: choose },
  { _tag: "document", name: "vocabulary--confirm", doc: confirm },
  { _tag: "document", name: "vocabulary--entry", doc: entry },
  { _tag: "document", name: "vocabulary--wait", doc: wait },
);
