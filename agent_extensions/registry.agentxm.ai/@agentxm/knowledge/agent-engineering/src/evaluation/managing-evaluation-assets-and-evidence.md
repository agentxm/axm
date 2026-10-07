---
type: How-to guide
title: How to manage evaluation assets and evidence
description: How to separate versioned evaluation source, generated trial evidence, and deliberately promoted decision evidence while preserving provenance, portability, and safe retention.
tags: [evaluation, artifacts, evidence, repositories, retention, provenance, ci, agent-skills]
status: stable
generated: { by: "claude-code/claude-opus-5", at: 2026-08-22T14:21:16Z }
stale_after: 2027-02-22
sources:
  - id: anthropic-agent-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
  - id: anthropic-skill-creator
    resource: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
    title: Anthropic — Skill Creator
  - id: openai-skill-creator
    resource: https://github.com/openai/skills/blob/main/skills/.system/skill-creator/SKILL.md
    title: OpenAI — Skill Creator
  - id: agent-skills-spec
    resource: https://agentskills.io/specification
    title: Agent Skills specification
  - id: github-workflow-artifacts
    resource: https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts
    title: GitHub — Workflow artifacts
---

# How to manage evaluation assets and evidence

Use this guide to give evaluation source, generated runs, and durable decision
evidence distinct owners and lifecycles. For the fields each evaluation must
bind, read [Evaluation contracts](evaluation-contracts.md). For ownership,
freshness, and retirement, read
[Evaluation lifecycle and governance](evaluation-lifecycle-and-governance.md).

The layouts below are provisional repository recommendations, not requirements
of the Agent Skills specification. Preserve their separation of responsibilities
when a host, package manager, or repository uses different paths.

## Goal

Produce a repository arrangement in which maintainers can reproduce the source
of an evaluation, inspect a trial without mistaking it for source, and identify
which evidence was deliberately retained for a named decision.

## Preconditions

- A named target and decision
- A repository or package boundary
- A known runtime or distribution boundary
- A retention location whose access, privacy, integrity, and expiry are known

## 1. Classify every artifact

Assign each artifact one lifecycle class before deciding where it belongs:

| Class | Examples | Normal authority | Normal storage |
| --- | --- | --- | --- |
| Evaluation source | Contract, cases, fixtures, graders, rubrics, harness code, schemas | Reviewed versioned source | Repository |
| Run evidence | Transcripts, traces, outputs, external state, timing, tool calls, grades | Generated observation | Ignored workspace or CI artifact |
| Aggregate analysis | Per-case statistics, slices, comparisons, cost and latency summaries | Reproducible derivation from trials | Run workspace or CI artifact |
| Promoted decision evidence | Release, admission, rollback, or published-benchmark manifest | Deliberate attributable record | Durable repository path or evidence archive |
| Governance decision | Approval, exception, rollout, rollback, or retirement decision | Named decision authority | Governance system |

Tracking a generated file does not promote it. Promotion requires an explicit
decision, complete identity, reviewable evidence, and a retention choice.

## 2. Separate runtime payload from evaluation material

When the repository has an explicit package boundary, keep evaluation source
beside but outside the installed payload:

```text
<package>/
├── <runtime-payload>/
├── evals/
│   ├── evaluation-contract.json
│   ├── evals.json
│   ├── fixtures/
│   ├── graders/
│   ├── harness/
│   └── releases/
└── ...
```

Create `releases/` only when promoted evidence exists. Do not create empty
directories or placeholder records.

When the skill directory itself is shipped wholesale, keep evaluation source
in a sibling repository tree so test procedures and historical evidence do not
silently become runtime skill content:

```text
skills/
└── <skill>/
    ├── SKILL.md
    ├── scripts/
    ├── references/
    └── assets/

evals/
└── <skill>/
    ├── evaluation-contract.json
    ├── evals.json
    ├── fixtures/
    ├── graders/
    ├── harness/
    └── releases/
```

The Agent Skills specification permits additional files but does not define an
evaluation directory or evidence lifecycle.[^agent-skills-spec] OpenAI's Skill
Creator keeps testing procedures out of the runtime skill contents, while
Anthropic's Skill Creator stores case definitions with the skill and writes run
outputs to a separate workspace.[^openai-skill-creator][^anthropic-skill-creator]

## 3. Version evaluation source

Track the smallest complete source needed to rerun and interpret the suite:

- the decision, target shape, scope, unit, and thresholds;
- natural cases and public-safe or appropriately protected fixtures;
- grader implementations, rubrics, calibration cases, and unknown behavior;
- harness adapters, environment setup, authority policy, and budgets;
- suite and schema versions; and
- comparison rules and expected baseline identity.

Keep expected answers away from the target during trials unless the task
contract makes them legitimate input. Treat changes to cases, fixtures,
graders, harnesses, and aggregation as evaluation changes rather than silently
comparing their scores with earlier runs.

## 4. Create one isolated run workspace

Use an ignored or external work area for generated evidence. A useful default
is:

```text
<repo-work-area>/evals/<target>/<run-id>/
├── run.json
├── trials/
│   └── <case-id>/<trial-number>/
│       ├── transcript-or-trace
│       ├── outputs/
│       ├── grade.json
│       └── timing.json
└── summary.json
```

`run.json` should bind the clean target revision or content identity, suite,
harness, host, model, configuration, active catalog, environment, authority
policy, budgets, runner, runner-selection source, grader, start time, and end
time. Give each independent trial fresh task-local state. Do not let previous
outputs, repository history, caches, or shared conversations leak answers into
later attempts.

Record complete transcripts or traces when policy permits. A prose summary is
analysis, not a replacement for the evidence it summarizes. Anthropic treats
the transcript, outcome, grader, trial, and harness as separate evaluation
objects and recommends inspecting transcripts to validate graders and
failures.[^anthropic-agent-evals]

Capture evidence that exists only at the moment it is produced — completion
notifications, process exit status, wall-clock timing, expiring URLs, and
interactive host state — into the trial record as it arrives. A value not
written when observed cannot be reconstructed afterwards, and its absence
belongs in the record as unknown rather than as a later estimate.

Write started-run evidence incrementally and atomically. Keep lifecycle state
separate from evaluation outcome, preserve infrastructure retries as distinct
attempts, and resume only after verifying that target, suite, runner, adapter,
and material environment identities still match. A preflight that creates no
run should return a reserved disposition rather than an empty run directory.

## 5. Grade and aggregate without erasing uncertainty

Preserve per-assertion evidence and distinguish:

- target failure;
- case or fixture defect;
- harness or environment failure;
- grader disagreement or failure; and
- unavailable or unobservable evidence.

Use `unknown` or an equivalent state when evidence cannot decide. Aggregate
only after per-trial outcomes, critical gates, unknowns, and failure classes
remain recoverable. Never let an overall pass count conceal an untested stage
or a critical failure.

## 6. Retain routine runs outside source control

Store ordinary development and continuous-integration runs in ignored
workspaces or workflow artifacts. GitHub identifies test results and logs as
workflow-artifact use cases.[^github-workflow-artifacts] Treat artifact expiry,
access, and deletion as part of the evidence contract; an expiring CI URL is
not a durable release locator by itself.

Apply the same security and public-suitability rules to untracked workspaces,
CI logs, and artifacts that apply to committed files. Redact or avoid
credentials, personal data, private paths, proprietary inputs, hidden system
instructions, and unrestricted model traces according to policy. Never assume
that “untracked” means private.

## 7. Promote evidence deliberately

Promote a compact immutable manifest only for a named release, admission,
rollback, or published benchmark decision. The manifest should contain or bind:

- the clean target, suite, harness, environment, and grader identities;
- trial counts, outcomes, uncertainty, thresholds, and critical gates;
- the baseline or an explicit `no-baseline` state;
- raw-evidence locations and content digests;
- runner, reviewer, and independence information;
- limitations, excluded claims, freshness, and expiry; and
- the decision the evidence supports without claiming approval it does not own.

Name promoted records immutably, for example
`releases/<target-version>-<run-id>.json`. Do not overwrite an earlier record or
use one mutable `latest.json` as the evidence of record. A later index may point
to the current accepted record while preserving every referenced identity.

## 8. Run evaluation in tiers

Use the least expensive tier that can answer the current decision:

1. **Authoring checks** — structure, deterministic helpers, and a small
   explicitly labeled smoke exercise.
2. **Pull-request regression** — deterministic checks and a bounded sample of
   isolated behavioral cases.
3. **Release evaluation** — the declared hosts, models, catalog, baselines,
   graders, repeated trials, and thresholds.
4. **Scheduled evaluation** — drift, saturation, or changing deployment
   conditions that a source change does not trigger.

Do not relabel evidence from a weaker tier when a later decision requires a
stronger one. Re-run under the required conditions.

## 9. Migrate an existing repository

1. Inventory tracked evaluation source, generated runs, and decision records.
2. Classify each item by authority rather than by its current directory.
3. Define the runtime payload, evaluation-source root, generated workspace, and
   promoted-evidence root.
4. Move or remove routine generated artifacts without rewriting history unless
   a separate security response requires it.
5. Add ignore rules and deterministic checks that prevent recurrence.
6. Preserve legitimate promoted evidence and repair missing identities or
   locators; downgrade its claim when repair is impossible.
7. Update repository instructions with the local path mapping and route to this
   guide for the full procedure.
8. Pilot one complete run before extracting a shared framework.

## Done when

- Evaluation source is versioned and sufficient to reproduce the intended run.
- Runtime payloads do not accidentally contain repository testing procedure.
- Generated evidence has an isolated, ignored, or external owner.
- Promoted evidence exists only for explicit decisions and binds durable raw
  evidence or integrity-protected locators.
- Unknowns, failures, provenance, expiry, and independence remain visible.
- Repository instructions state the local path mapping without duplicating this
  guide.

[^anthropic-agent-evals]: Anthropic — Demystifying evals for AI agents
[^anthropic-skill-creator]: Anthropic — Skill Creator
[^openai-skill-creator]: OpenAI — Skill Creator
[^agent-skills-spec]: Agent Skills specification
[^github-workflow-artifacts]: GitHub — Workflow artifacts
