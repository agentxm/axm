# Batch review: agent targeting is workspace membership

Set review for the batch that removes per-extension agent targeting from the
AXM CLI and settings and records, as candidate specifications, the obligations
that replace it. This record is evidence for the maintainer's acceptance
decision; it is not authority.

## Boundary

- Scope: six new candidate specifications, one evidence revision of an accepted
  specification, one new support module, and three specification-harness
  exports (`handleMcpsImport`, `handleSkillsNew`, `handleSubagentsNew`).
- Baseline revision: `e9227faf9` (the release commit before this batch).
- Source set:
  - the nine `--agent` flag declarations at the baseline: `setup`,
    `skills list`, and `subagents list` (consumed as membership or a listing
    filter); `mcps add` and `mcps install` (recorded as a durable per-entry MCP
    subset); `subagents new` (never read); `skills update` and
    `subagents update` (read only to echo the flag into recovery text);
    `skills new` (materialized everywhere, then removed the non-selected agents
    in a second plan step that settings never recorded);
  - the single predicate through which the MCP subset was consumed, whose
    "not targeted" outcomes every downstream behavior traced to;
  - the withdrawn alternative of realizing `--agent` on creation commands as a
    one-shot materialization subset, rejected because such a subset is not
    desired state and does not survive `cli/sync/realizes-desired-state`;
  - the accepted specifications `cli/sync/realizes-desired-state`,
    `cli/mcps/inline-lifecycle-is-idempotent`,
    `cli/activation-follows-desired-state`,
    `cli/agents/membership-changes-realize-affected-outputs`,
    `cli/settings-validity-gates-operations`,
    `settings-contract/published-schemas-agree-with-accepted-input`, and
    `cli/lint/catalog-is-complete`;
  - the workspace agents and agent-specific content architecture documents and
    the new decision record
    `docs/architecture/decisions/agent-targeting-is-workspace-membership.md`.
- Exclusions: agent membership commands and the workspace `agents` list (their
  obligations are unchanged and already accepted); bounded agent-specific
  extension content (capability-conditioned enhancements and agent overrides),
  which adapts content for a target rather than selecting targets; scaffold
  content of the `new` commands; and the implementation packages, whose
  internal tests are witnesses.

## What this batch adds

| Requirement                                                      | Role       | Statement in brief                                                                                                                                                                            |
| ---------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli/agent-selection-is-membership-or-filter`                    | experience | `--agent` exists only to choose configured agents or filter a listing, rejects an unsupported identifier at parse time, and never narrows one extension.                                      |
| `settings-contract/agent-membership-is-the-only-agent-selection` | interface  | Settings select agents only through the workspace list; an MCP entry with its own `agents` key is rejected naming the key; the published schema admits no per-entry key.                      |
| `cli/mcps/projects-to-every-configured-agent`                    | experience | Configure, enable, and re-enable reach every configured agent that can represent the server; an agent that cannot is reported unsupported; disable and uninstall remove it everywhere.        |
| `cli/mcps/import/adoption-reaches-every-configured-agent`        | experience | An imported native server is recorded once without a subset, lists its adoption targets identically in preview and apply, and reaches every capable agent on the next reconciliation.         |
| `cli/skills/new/scaffolds-for-every-configured-agent`            | experience | Creation records manifest, content, and settings together; materializes for the universal location and every configured agent; preview and apply list the same targets; sync is then a no-op. |
| `cli/subagents/new/scaffolds-for-every-configured-agent`         | experience | Creation records manifest, content, and settings together; renders for every configured agent; preview and apply agree; sync is then a no-op.                                                 |

Every new specification is `status: "candidate"` with `supersedes: []`. No
accepted identity is retired.

## What this batch revises

- `cli/lint/catalog-is-complete`: the `workspace/mcps-shared-target-compatible`
  row is removed from the accepted rule inventory. The statement is unchanged;
  this is a revision of specification evidence for an interface change. With
  no per-entry subset, the rule had no reachable finding; dialect
  compatibility across agents sharing one native file is a property of the
  shipped catalog and is proven by the catalog's internal test.
- `settings-contract/published-schemas-agree-with-accepted-input`: no file
  change; its evidence is sensitive to the regenerated settings schema (rule
  list and MCP entry properties) and passes against the regenerated document.
- `specifications/support/plan-targets.ts` is added: reads the listed target
  surfaces and unit identities from a rendered plan result so a preview and an
  apply can be compared as sets. Support code, not authority.

## Evidence observed

The candidates were authored from the obligations above, not from the
implementation, and were first executed while the implementation slices of the
same change were landing in the same working tree. A clean run against the
baseline revision alone was therefore not observed; the expected baseline
failures, established by inspection of `e9227faf9`, are:

- `cli/agent-selection-is-membership-or-filter`: `--agent` was offered by nine
  commands, not three, and `skills list --agent bogus` matched nothing instead
  of failing at parse.
- `settings-contract/agent-membership-is-the-only-agent-selection`: MCP entry
  forms accepted `agents`, and the published schema declared it.
- `cli/mcps/projects-to-every-configured-agent`: the inventory could report a
  per-entry `not-applicable` outcome.
- `cli/mcps/import/adoption-reaches-every-configured-agent`: the imported entry
  recorded the adopting agent as a subset, so the next reconciliation did not
  reach the other configured agent.
- `cli/skills/new/…` and `cli/subagents/new/…`: the handlers required an
  `agents` argument that the candidates do not pass.

Runs during the batch, with `pnpm test:spec --requirement <id>`:

1. First run: five of the seven selected files passed. Three examples of the
   agent-selection candidate failed because the in-process parser was built
   without the product's built-in flag configuration (a duplicate `-v` alias);
   this was a specification-authoring omission and was corrected by providing
   the help built-in the product registers. One scenario of the import
   candidate failed because it asserted that the `sync` preview lists the
   native MCP file it will write; the sync plan reports MCP units without
   artifact targets in both preview and apply, so the assertion was outside the
   subject. The scenario now compares the unit identities of preview and apply
   and asserts the realized native files directly.
2. Second run: all seven selected files pass (137 tests, 0 failures). The
   project typecheck then reported that the in-process parser example left the
   command tree's static service requirements unprovided; the example now
   provides the same test services the publish harness uses, and
   `specifications:typecheck`, `specifications:lint`, and
   `specifications:generate` (86 specifications, conformance clean) all pass
   with the seven files still green.

## Set review findings

- Orphans: none. Every new specification references registered goals
  (`workspace-intent-fidelity`, `agent-interoperability`,
  `actionable-diagnostics`, `machine-automation`, `authoring-and-creation`,
  `safe-repetition`), and no goal lost its last referencing specification.
- Duplicates and overlaps: `cli/mcps/projects-to-every-configured-agent`
  overlaps `cli/mcps/inline-lifecycle-is-idempotent` (settings record plus one
  projection) and `cli/activation-follows-desired-state` (disable and enable
  change realized surfaces). The new obligation — every configured agent, and
  unsupported reported rather than omitted — is distinct; the overlap is one
  shared scenario shape, not one obligation stated twice.
- Contradictions: none. The retired lint row is removed from the accepted
  inventory in the same batch, so the catalog specification and the runtime
  catalog agree.
- Gaps observed outside the batch, recorded for a following review:
  - The `sync` plan lists MCP units without artifact targets in preview and
    apply, while skill and subagent units list their surfaces. No accepted
    specification claims MCP target reporting for `sync`; whether the
    preview-purity family should is unresolved.
  - After an inline MCP server is imported from one agent's native file, the
    next reconciliation reports drift for the adopting agent (`type` field) on
    the entry it adopted, because adoption preserves the native entry as found.
    Convergence is reached; the warning is a candidate diagnostic-quality gap.
  - Subagent creation lists no agent rendering as a target, while skill
    creation lists each agent location. Recorded as an open question on the
    subagent candidate rather than resolved here.
- Unverifiable claims: none. Every candidate declares only executable methods.
- Stale witnesses: the internal and end-to-end tests that exercised `--agent`
  narrowing, the MCP subset, the per-entry `not-applicable` outcome, the
  retired lint rule, and the removed skill-uninstall lifecycle operation are
  deleted or revised in the implementation slices of this change.

## Acceptance

- Candidates: awaiting maintainer acceptance. Until recorded here, the six new
  specifications are not authority and the accepted specifications named above
  remain the only obligations for their subjects.
- Evidence revision of `cli/lint/catalog-is-complete`: awaiting maintainer
  acceptance as an interface change to the published rule catalog.
- Decision record: landed with this batch as explanation; it owns no
  obligation.
