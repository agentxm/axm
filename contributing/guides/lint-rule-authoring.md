---
status: active
last-reviewed: 2026-04-22
version: 0.1.7
description: Authoring lint rules for AgentXM skills, packs, and workspaces — context
  kinds, advisory vs autofixing, schema delegation, naming, message content,
  testing.
depends-on:
  - ./guide-authoring.md
  - ./documentation-guidelines.md
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

## Classification Invariant Matrix

Workspace install rules enforce invariants on one or more **extension lifecycle
classes** produced by the workspace workspace record. The three classes are:

- **Configured** — explicitly declared in `settings.json`
- **Implicit** — present in the lockfile as a transitive pack dependency, not
  directly declared
- **Unmanaged** — detected on disk but not tracked by settings or lockfile

Each class implies a set of invariants. When adding install rules for a new
extension type, walk the matrix to verify every applicable invariant has a
covering rule. Content rules (`skill/*`, `pack/*`) and foundation rules
(`workspace/initialized`, etc.) are classification-independent and do not
appear in this matrix.

| Invariant             | Configured | Implicit | Unmanaged |
| --------------------- | ---------- | -------- | --------- |
| Declaration valid     | required   | —        | —         |
| Lockfile aligned      | required   | —        | —         |
| Integrity intact      | required   | required | —         |
| Artifacts correct     | required   | required | —         |
| Managed (class empty) | —          | —        | required  |
| Retained by pack      | —          | required | —         |
| Dependencies resolved | required   | —        | —         |

The barrel file (`workspace.ts`) groups install rules by invariant and
annotates each group with the class(es) it covers. When adding a new extension
type, walk the matrix and verify each applicable row has a covering
type-sharded rule.

### Classification Invariant Checklist

- [ ] **Matrix walked** — Every applicable invariant row has a covering rule
      for the new extension type
- [ ] **Barrel grouped** — New install rules appear under the correct
      invariant group in the workspace barrel

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

Use `warning`, not `warn`, for lint finding severity. `warn` is reserved for
Operation readiness (`readiness: "warn"`) and renderer diagnostics
(`renderer.warn(...)`), not rule findings.

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
- [ ] **No `warn` alias** — Lint findings use `warning`; `warn` is not a
      severity literal
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
      `enable-*`, `disable-*` Operations; never calls a top-level
      reconciliation function directly
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

Severity changes the message's urgency, not its structure. `error`,
`warning`, and `info` findings should all still say what is wrong and what to
do next; severity decides whether the condition blocks, not whether the
message gets remediation text.

### Write by Severity

| Severity  | Message stance                                                      | Typical phrasing                                              |
| --------- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `error`   | Blocking invariant. Direct. Assume the user needs to act now.       | "X is invalid. Fix Y." / "X is missing. Run `axm ...`."       |
| `warning` | Non-blocking but likely actionable. Explain the expected next step. | "X is not declared. Add Y, or disable this rule if intended." |
| `info`    | Non-blocking guidance or visibility. Action may be optional.        | "X differs from the usual shape. No action needed unless..."  |

Severity-specific notes:

- `error` messages may use stronger language like "must" or "required" when
  the invariant is actually mandatory
- `warning` messages should avoid sounding fatal; they still need a clear
  action or explicit "intentional; no action needed" escape hatch
- `info` messages should be calm and specific; if the finding is informational
  only, say that directly instead of implying hidden breakage

### Message Shape

Prefer this order:

1. Broken invariant
2. Helpful detail, if needed
3. Remediation or explicit "no action needed"

When parser or schema detail matters, keep it subordinate to the high-level
statement: lead with the invariant failure, then append the raw detail, then
end with the fix sentence. Do not emit raw decoder text alone.

### Source Of Truth First

The right fix depends on who owns the broken surface.

| Surface kind                  | Examples                                                              | Message guidance                                                                            |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| User-authored source of truth | `.axm/settings.json`, `skill.json`, `extension-pack.json`, `SKILL.md` | If a supported CLI exists, point to that command. Name the file/key only when no CLI exists |
| Derived or axm-managed state  | `.axm/axm-lock.yaml`, `.axm/extensions/...`, agent artifact dirs      | Point to the command or source-of-truth action that regenerates it                          |

When the broken surface is user-authored, prefer the supported CLI when one
exists. Do not add a manual file-edit fallback to lint messages for the same
outcome. When the broken file is derived, do not normalize hand-editing it just
because the rule reports that file in `location`. Name the supported command or
the user-owned declaration that controls it instead.

Examples:

- Avoid: "Edit `.axm/axm-lock.yaml` and add the missing fields."
- Prefer: "Run `axm lint --fix` to reinstall the declared extensions and
  regenerate the lockfile."

### Write For Grouped Diagnostics

The default `axm lint` output may render the path and rule id outside the main
sentence:

```text
✖  ./.axm/settings.json
  rule: workspace/skills-artifacts-correct
  2 skills are inconsistent across the declared agents.
```

Write messages that still read cleanly in that shape. The diagnosis should
stand on its own even when the renderer moves the path and `rule:` line
outside the sentence.

### Prefer List- and Fix-Friendly Detail

When a finding naturally produces follow-up bullets or short remediation lines,
prefer prose that can be split cleanly by the renderer.

| Avoid                               | Prefer                                      |
| ----------------------------------- | ------------------------------------------- |
| Dense parenthetical detail          | `Missing fields include: ...`               |
| One long sentence with two paths    | `To keep them: ...` / `To remove them: ...` |
| Title sentence with embedded totals | One local fact; let the renderer count      |

### Name The Mechanism

Do not stop at the desired end state. Tell the user how to get there.

Examples:

- Weak: "Add it to `settings.skills`."
- Better: "Run `axm skills install <source>` to install and declare it."
- Better: "Run `axm lint --fix` to declare it automatically."
- Better when no supported CLI exists: "Add an entry for it under
  `settings.skills` in `.axm/settings.json`."
- Better: "If you do not want axm to manage it, delete it from that directory."

Lead with the CLI command (`axm skills install`, `axm lint --fix`) as the
preferred path. If a supported CLI can make the change, lint messages should
name that CLI path only and omit manual file-edit instructions for the same
outcome. Name the config surface directly only when no supported CLI exists.

### Prefer User-Observable Language

Describe facts the workspace author can verify, not internal lint-engine
bookkeeping.

| Avoid                                        | Prefer                                           |
| -------------------------------------------- | ------------------------------------------------ |
| "stale artifact with no backing declaration" | "is present but not listed in `settings.skills`" |
| "missing per-agent artifacts"                | "is missing from some declared agents"           |
| "canonical source is missing"                | "installed source directory is missing"          |

When path context helps explain the fix, refer to the path by role rather than
by render position:

- Good: "the agent skills directory", "the manifest file", "the lockfile"
- Avoid: "shown below", "reported above", "see path below", "on the left"

Keep the literal path in `location` unless the path string itself is part of
the invariant.

### Message Content Checklist

- [ ] **Violation first** — First clause names the invariant that was broken
- [ ] **Remediation included** — Second clause states the fix in imperative
      voice ("Strip…", "Reinstall…", "Remove…")
- [ ] **Severity shapes urgency only** — `error` / `warning` / `info` changes
      tone, not whether remediation appears
- [ ] **CLI invocation verbatim** — When a user-facing verb exists, embed it as
      a runnable command (`axm workspace sync-agents-md --from=claude`)
- [ ] **Concrete mechanism named** — Message tells the user how to apply the
      change, not only what the final state should be
- [ ] **Source-of-truth mechanism named** — Messages point to the
      user-authored config or supported command that actually controls the
      outcome
- [ ] **Preferred path first** — Recommended or automatic resolution appears
      before secondary manual or opt-out paths
- [ ] **No manual-edit fallback beside CLI** — If a supported command can make
      the change, the message omits hand-edit instructions for the same outcome
- [ ] **User-owned edit surface named** — If no CLI exists, message names the
      user-authored file and config key to edit
- [ ] **No generated-file edits** — Derived state like the lockfile or
      installed artifact trees is repaired through commands or source-of-truth
      edits, not by telling users to hand-edit generated files
- [ ] **Alternatives explicit** — When more than one supported resolution
      exists, each path is stated separately rather than implied
- [ ] **No rendered paths** — Path context comes from `location` and the
      renderer; the message describes the action, not file positions
- [ ] **Path by role, not layout** — When path context matters, refer to "the
      agent skills directory" or "the manifest file", not "shown below"
- [ ] **No severity label in text** — Don't prefix with "Error:" / "Warning:"
      / "Info:"; the renderer already carries severity
- [ ] **User-observable wording** — Prefer facts the user can see in the
      workspace over internal lifecycle terms like "artifact", "backing
      declaration", or "canonical source"
- [ ] **Mechanical XOR as prose** — When an `AdvisoryFinding` has two viable
      paths, the message enumerates them ("Either strip the leading bytes
      before `---`, or fix the YAML syntax at the referenced location")
- [ ] **Schema detail is subordinate** — Decoder / parser detail supports the
      message; it does not replace the violation + remediation sentence
- [ ] **Grouped-renderer friendly** — The diagnosis still reads cleanly when
      the path and `rule:` line render separately from the message
- [ ] **List-friendly detail** — Extra examples or field names can be rendered
      as bullets without the message turning into a sentence fragment
- [ ] **Fix lines read naturally** — Remediation phrasing can stand alone as
      short follow-up lines (`Fix: ...`, `To keep them: ...`)
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

| Pitfall                                                       | Problem                                                                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Rule walks the workspace itself                               | Duplicates `WorkspaceIndex`; makes the rule hard to test                                                   |
| `check` throws on inapplicable input                          | Use `[]` — no separate `applies` predicate                                                                 |
| Schema-valid rule implements schema logic                     | Delegate to `Schema.decodeUnknown` + `issuesToFindings`                                                    |
| Unknown keys inlined in `-schema-valid`                       | Splits severity; ship a paired `-keys-recognized` warning rule                                             |
| Autofix arbitrarily picks between paths                       | Use `AdvisoryFinding` whose `message` enumerates each path (mechanical XOR)                                |
| Fix edits `SKILL.md` or user settings                         | User-authored content is out of scope; ship advisory                                                       |
| Message omits remediation                                     | `message` carries both violation and fix; surfaces depend on it                                            |
| Message starts with "Error:" / "Warning:"                     | Severity already lives on the finding and in the renderer                                                  |
| Warning/info message omits next step                          | Severity changes urgency, not whether the message is actionable                                            |
| Message uses internal lint jargon                             | Prefer facts the user can verify over "artifact", "backing declaration", "canonical source"                |
| Message assumes a renderer layout                             | Say "the manifest file" or "that directory", not "shown below"                                             |
| Message embeds a rendered path                                | Path goes in `location`; renderer composes via `composePath`                                               |
| Message only works as a flat log line                         | Default `axm lint` may render path and rule separately; keep the diagnosis standalone                      |
| Detail is buried in parentheses                               | Prefer bullet-friendly lead-ins like `Missing fields include: ...`                                         |
| Message describes only the target state                       | Saying "add it to `settings.skills`" is not enough; name the command or, if none exists, the file edit too |
| Message suggests editing user-owned config despite a CLI path | Lint should normalize the supported command; mention file edits only when no automated CLI path exists     |
| Message tells users to edit derived state                     | Generated files like `.axm/axm-lock.yaml` should point to regeneration commands or source-of-truth edits   |
| Supported alternatives are implicit                           | If users can auto-fix or remove the item, enumerate those supported paths explicitly                       |
| Message assumes config-edit know-how                          | Naming `settings.skills` alone is not enough; say where and how to change it                               |
| Rule calls a top-level reconciliation function                | Compose from per-extension Operations only                                                                 |
| Third-level id (`workspace/install/foo`)                      | Type-shard instead: `workspace/<type>-<subject>-<predicate>`                                               |
| Description restates the mechanism                            | State the invariant; mechanism lives in `check`                                                            |

### Pitfalls Checklist

- [ ] **No workspace walking** — Rule consumes caller-built context
- [ ] **No inline schema** — Schema rules delegate to Effect Schema
- [ ] **No multi-severity rule** — One severity; split into paired rules if
      needed
- [ ] **No arbitrary autofix** — Multi-path fixes are advisory
- [ ] **No user-content edits** — User-authored files ship advisory findings
- [ ] **No derived-state edits** — Generated files are repaired through
      commands or source-of-truth edits
- [ ] **No rendered paths in messages** — Use `location` plus the renderer
- [ ] **No top-level reconciliation calls** — Per-extension Operations only

---

## Rule Authoring Quality Checklist

Use this when adding or reviewing a lint rule.

- [ ] **When to Write a Rule Checklist** — All items pass
- [ ] **Classification Invariant Checklist** — All items pass (install rules only)
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
