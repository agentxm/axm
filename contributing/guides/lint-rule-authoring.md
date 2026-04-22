---
status: active
last-reviewed: 2026-04-22
version: 0.1.0
description: Authoring lint rules for AgentXM skills, packs, and workspaces — context
  kinds, advisory vs autofixing, schema delegation, naming, message content,
  testing.
depends-on:
  - ./testing.md
  - ./effect.md
  - ./effect-errors.md
---

# Lint Rule Authoring

Conventions for adding or changing a lint rule in the shared `lint` module.
Covers the decisions a rule author makes at the keyboard: context kind,
advisory vs autofixing, severity, naming, `check` / `fix` shape, and testing.

This guide is the source of truth for rule-authoring concerns. The Lint Engine
design doc (`agentxm-internal/docs/design/lint-engine.md`) owns the architectural
design — shared-kernel placement, CLI surface, registry integration, severity
model, and the v1 rule catalog — and defers to this guide for how to author
rules.

## Key Resources

- `packages/core/src/unstable/lint/` — rule types, evaluator, helpers
- `packages/core/src/unstable/lint/catalog/` — `skill`, `pack`, `workspace`
  catalogs, plus the rule-id snapshot test
- `packages/core/src/unstable/lint/issues-to-findings.ts` — schema-delegation
  helper
- [Testing Guide](./testing.md) — fixture conventions, Effect test patterns
- [Effect Errors Guide](./effect-errors.md) — error channel conventions for
  `check` / `fix`

---

## When to Write a Rule

Lint rules enforce **invariants backed by a parser, schema, grammar, spec, or
programmatic check**. Heuristic style checks, framing advice, and quality
nudges are authoring guidance, not rules.

### When to Write a Rule Checklist

- [ ] **Mechanical invariant** — Violation is decidable by parser, schema,
      grammar, or spec — never "looks off" or "reads awkwardly"
- [ ] **Actionable in-scope fix** — Remediation is either an axm Operation or a
      single clear user action (not "restructure your skill")
- [ ] **Not covered by decoding** — Invariant isn't already enforced by
      `Schema.decodeUnknown` during context construction
- [ ] **Not a health check** — Registry reachability, auth, version currency
      belong in their native commands, not in lint

---

## Pick the Context Kind

A rule is generic over one of three context types. The context is constructed
by the caller (registry publish or `axm lint`) and passed into `check`; rules
never walk the workspace themselves.

| Context                | When to use                                       | Runs on              |
| ---------------------- | ------------------------------------------------- | -------------------- |
| `SkillRuleContext`     | Invariant over a single skill's manifest or files | Publish + `axm lint` |
| `PackRuleContext`      | Invariant over a single pack's manifest           | Publish + `axm lint` |
| `WorkspaceRuleContext` | Cross-cutting workspace hygiene or install drift  | `axm lint` only      |

Rules consume accessors as ordinary property access
(`context.files.exists(...)`). Accessors are intentionally narrow — extend a
context's accessor interface only when a concrete rule needs a new method, and
justify the addition in the PR.

### Context Checklist

- [ ] **Single context** — Rule is generic over exactly one context type
- [ ] **Accessor-only access** — Rule reads state through `context.files` /
      `context.workspace`, never the filesystem or a service directly
- [ ] **Early-return on inapplicable** — `check` returns `[]` (not throws, not
      skips) when the rule's preconditions aren't met
- [ ] **Scope-aware** — Workspace rules early-return `[]` when
      `context.subject.scope` doesn't match their applicable scope
- [ ] **No accessor widening without a rule** — New accessor methods land with
      the rule that needs them

---

## Choose Advisory vs Autofixing

Default to **advisory**. Ship as `AutofixingRule` only when **all five**
criteria hold — otherwise ship as `AdvisoryRule` whose `message` embeds a CLI
invocation. Advisory is the escape hatch, not a consolation prize.

### Autofix Eligibility Checklist

- [ ] **Operation-expressible** — Fix composes from the existing per-extension
      Operation vocabulary (`install-*`, `uninstall-*`, `enable-*`,
      `disable-*`); no `editFile` / `writeFile` / `deleteFile` / byte-range
      mutations
- [ ] **axm-owned target** — Fix touches only state axm manages (lockfile,
      `.axm/extensions/.../src/` trees, per-agent artifact dirs,
      axm-owned settings keys) — never `SKILL.md`, `skill.json`, hand-edited
      settings, `CLAUDE.md`, or `AGENTS.md`
- [ ] **Single mechanical resolution** — Exactly one correct action; two-or-more
      viable paths ⇒ `AdvisoryFinding` whose `message` enumerates each
      (mechanical XOR)
- [ ] **Idempotent and derivable** — `apply(fix) + re-run(rule)` from the same
      context produces zero findings from that rule; action is computed from the
      check's output, not guessed intent
- [ ] **Bounded blast radius** — Non-interactive; operations with meaningful
      reversal cost ride on `readiness: "warn"` with a message

If any item fails, make the rule advisory and embed a CLI command in the
message. Recurring commandless advisories signal a purpose-built verb is
worth adding (e.g. `axm workspace sync-agents-md`) — not that the Operation
vocabulary should grow.

---

## Severity

Each rule ships with one of `error` | `warning` | `info`. Publish blocks on
`error` from per-extension rules (`skill/*`, `pack/*`); workspace overrides in
`.axm/settings.json` only affect local `axm lint`.

### Schema-Valid vs Keys-Recognized Split

A schema-backed rule ships as a pair:

- `<namespace>/<subject>-schema-valid` (error) — decodes via
  `Schema.decodeUnknown` with `onExcessProperty: "ignore"` and maps issues
  through `issuesToFindings`
- `<namespace>/<subject>-keys-recognized` (warning) — enumerates top-level keys
  and emits one finding per unknown key

Splitting keeps each rule single-severity and lets newer-schema manifests roll
out ahead of registry deploys without blocking publish. Don't inline excess-key
checks in the schema-valid rule.

### Severity Checklist

- [ ] **One severity per rule** — Never splits between `error` and `warning`
      findings within the same rule
- [ ] **Schema delegation** — A `-schema-valid` rule delegates to
      `Schema.decodeUnknown` + `issuesToFindings` rather than re-implementing
      schema checks
- [ ] **Paired keys rule** — Schema-valid rules ship alongside a
      `-keys-recognized` warning rule for unknown-key hygiene
- [ ] **New rules start soft** — A rule that would retroactively reject prior
      publishes ships at `warning` first and graduates to `error` later

---

## Naming and Description

Rule ids and descriptions are public API — they leak into `settings.json`, CI
logs, agent transcripts, and docs. Renames require deprecation aliases.

### Id Grammar

`<namespace>/<subject>-<predicate>`

- Subject first, predicate last. Positive framing.
- Predicates: `valid`, `present`, `clean`, `correct`, `aligned`, `resolved`,
  `recognized`, `retained`.
- Install rules are **type-sharded**: `workspace/skills-artifacts-correct`, not
  `workspace/install-artifacts-correct`. No third hierarchy level.
- Predicate alone when the namespace names the subject: `workspace/initialized`.
- Lowercase, hyphen-separated.

### Description

One sentence, ≤100 characters, stating the **invariant** the rule enforces.
Not the violation, not the check mechanism, not the remediation. Prefer
user-friendly functional terms over ontology precision.

### Naming Checklist

- [ ] **Namespace correct** — `skill/`, `pack/`, or `workspace/` matches the
      rule's context kind
- [ ] **Two segments** — Id is `<namespace>/<subject>-<predicate>`, never three
      hierarchy levels
- [ ] **Positive framing** — Id states the desired state
      (`manifest-present`, not `manifest-missing`)
- [ ] **Type-sharded install** — Install rules prefix the extension type
      (`skills-`, `packs-`) rather than switching on kind internally
- [ ] **Description ≤100 chars** — One-sentence invariant statement
- [ ] **Invariant, not mechanism** — Description states what must be true, not
      how the rule checks or what breaks
- [ ] **Snapshot test updated** — `rule-ids.snapshot.test.ts` is refreshed
      intentionally, with a migration note when ids move
- [ ] **Deprecation alias** — A renamed id ships an alias alongside the new id
      until one release cycle has passed

---

## Writing `check`

`check` returns `ReadonlyArray<LintFinding>`. It receives the context and
decides whether the rule applies.

### Check Checklist

- [ ] **Early-return `[]`** — Rule returns `[]` when preconditions aren't met;
      no separate `applies` predicate
- [ ] **Accessor-relative `location`** — Findings emit `location.file` relative
      to the accessor root; the renderer composes the display path via
      `composePath`
- [ ] **Message carries violation + remediation** — Message describes what's
      wrong and how to fix it in prose; source coordinates live in `location`,
      never in the string
- [ ] **Schema delegation** — Any `-schema-valid` rule delegates to
      `Schema.decodeUnknown` + `issuesToFindings(parseError, file)`
- [ ] **Cascade reports first failure** — When one rule has arms (e.g. parse
      then schema), report only the first arm that fails; don't flood with
      downstream noise

---

## Writing `fix`

`fix` takes the context and an `AutofixableFinding`, and returns
`ReadonlyArray<Operation>` composed from the per-extension vocabulary.
`resolvePlan` and `applyPlan` handle lowering and execution.

### Fix Checklist

- [ ] **Operation vocabulary only** — Returns `install-*`, `uninstall-*`,
      `enable-*`, `disable-*` Operations; never references `syncWorkspace()`
- [ ] **Readiness tagged** — Each Operation carries `readiness: "ready"` or
      `readiness: "warn"` with a one-line `warnMessage`
- [ ] **Destructive ops warn** — Lockfile rewrites, mass artifact prunes, and
      cross-agent cleanups ride on `readiness: "warn"`
- [ ] **No `force` override** — `applyPlan` runs non-interactively; a fix that
      needs `--force` belongs as advisory with a CLI command in `message`
- [ ] **Derived from the finding** — Fix computes its Operations from the
      finding's location and context, not from external state or heuristics
- [ ] **Determinism verified** — A determinism test asserts
      `apply(fix) + re-run(rule) == []` for every fixture case

---

## Message Content

The `message` field carries both the violation statement and the remediation
prose. It is best-effort stable public contract — surfaces include the
`axm lint` renderer, the registry 422 publish response, and `--json` output.
A structured `suggestions` field may return later when an IDE or agent
integration demands it; for v1, prose in `message` is the only remediation
surface.

### Message Content Checklist

- [ ] **Violation first** — First clause names the invariant that was broken
- [ ] **Remediation included** — Second clause states the fix in imperative
      voice ("Strip…", "Reinstall…", "Remove…")
- [ ] **CLI invocation verbatim** — When a user-facing verb exists, embed it as
      a runnable command (`axm workspace sync-agents-md --from=claude`)
- [ ] **No rendered paths** — Path context comes from `location` and the
      renderer; the message describes the action, not file positions
- [ ] **Mechanical XOR as prose** — When an `AdvisoryFinding` has two viable
      paths, the message enumerates them ("Either strip the leading bytes
      before `---`, or fix the YAML syntax at the referenced location")
- [ ] **Autofix stays terse** — `AutofixableFinding` messages state the
      violation; the remediation prose can be brief since `--fix` applies the
      action

---

## Register and Test

New rules land in the matching catalog (`skill.ts`, `pack.ts`, `workspace.ts`)
and ship with fixtures under `packages/core/src/unstable/lint/__fixtures__/`.

### Fixture Layout

```text
__fixtures__/
  skills/<case>/            # input tree
    expected-findings.json  # snapshot
    expected-after-fix/     # autofixing rules only
  packs/<case>/
  workspaces/<case>/
```

### Registration and Testing Checklist

- [ ] **Catalog updated** — Rule exported from the right catalog and appears in
      `rule-ids.snapshot.test.ts`
- [ ] **Fixture case added** — At least one `__fixtures__/<kind>/<case>/` tree
      with `expected-findings.json` for each new rule
- [ ] **Autofix after-tree** — Autofixing rules ship `expected-after-fix/`
      alongside the input fixture
- [ ] **Determinism test** — Autofixing rules assert
      `apply(fix) + re-run == []` via the determinism harness
- [ ] **Effect + `@effect/vitest`** — Tests use `it.effect` / `it.scoped` per
      [Testing Guide](./testing.md); no global mocks, no filesystem stubs

---

## Common Pitfalls

| Pitfall                                   | Problem                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Rule walks the workspace itself           | Duplicates `WorkspaceIndex`; makes the rule hard to test                    |
| `check` throws on inapplicable input      | Use `[]` — no separate `applies` predicate                                  |
| Schema-valid rule implements schema logic | Delegate to `Schema.decodeUnknown` + `issuesToFindings`                     |
| Unknown keys inlined in `-schema-valid`   | Splits severity; ship a paired `-keys-recognized` warning rule              |
| Autofix arbitrarily picks between paths   | Use `AdvisoryFinding` whose `message` enumerates each path (mechanical XOR) |
| Fix edits `SKILL.md` or user settings     | User-authored content is out of scope; ship advisory                        |
| Message omits remediation                 | `message` carries both violation and fix; surfaces depend on it             |
| Message embeds a rendered path            | Path goes in `location`; renderer composes via `composePath`                |
| Rule touches `syncWorkspace()`            | Compose from per-extension Operations only                                  |
| Third-level id (`workspace/install/foo`)  | Type-shard instead: `workspace/<type>-<subject>-<predicate>`                |
| Description restates the mechanism        | State the invariant; mechanism lives in `check`                             |

### Pitfalls Checklist

- [ ] **No workspace walking** — Rule consumes caller-built context
- [ ] **No inline schema** — Schema rules delegate to Effect Schema
- [ ] **No multi-severity rule** — One severity; split into paired rules if
      needed
- [ ] **No arbitrary autofix** — Multi-path fixes are advisory
- [ ] **No user-content edits** — User-authored files ship advisory findings
- [ ] **No rendered paths in messages** — Use `location` plus the renderer
- [ ] **No `syncWorkspace()` calls** — Per-extension Operations only

---

## Rule Authoring Quality Checklist

Use this when adding or reviewing a lint rule.

- [ ] **When to Write a Rule Checklist** — All items pass
- [ ] **Context Checklist** — All items pass
- [ ] **Autofix Eligibility Checklist** — All items pass (or rule is advisory)
- [ ] **Severity Checklist** — All items pass
- [ ] **Naming Checklist** — All items pass
- [ ] **Check Checklist** — All items pass
- [ ] **Fix Checklist** — All items pass (autofixing rules only)
- [ ] **Message Content Checklist** — All items pass
- [ ] **Registration and Testing Checklist** — All items pass
- [ ] **Pitfalls Checklist** — All items pass

---

## See Also

- [Testing Guide](./testing.md) — Effect testing, fixtures, determinism
- [Effect Errors Guide](./effect-errors.md) — error channel conventions
- [TypeScript Style Guide](./typescript-style.md) — narrowing and `satisfies`
  patterns used across rule bodies
