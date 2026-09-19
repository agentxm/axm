# Author Agent Skill

Create a new portable Agent Skill or revise an existing one from defined or
changed requirements, concrete workflow evidence, accepted audit findings, or
observed failures. The skill is a thin execution layer over the authoritative
authoring and interaction guidance in the coupled `agent-engineering` knowledge
bundle.

Use it for requests to create, fix, update, adapt, restructure, or remediate an
Agent Skill. Use `audit-agent-skill` to assess conformity or verify closure;
use `evaluate-agent-skill` to execute controlled behavioral suites. Authoring
does not independently certify its own changes.

When authoring changes behavior, the workflow keeps versioned evaluation source
separate from generated runs, preserves confirmed failures as regressions, and
labels same-agent exercises as authoring smoke rather than release evidence.

Before executing target-controlled helpers, package commands, interpreters, or
dependencies, the workflow resolves their identity and provenance, inspects the
execution path, and requires an explicit trust decision and bounded execution
authority. Source edits do not silently authorize code execution.

When the target owns a meaningful user-facing sequence, the workflow applies
the agent-engineering guidance for openings, progress, questions, interaction
surfaces, gates, and closeouts. It leaves one-step and non-interactive skills
free of unnecessary interaction ceremony.

For AXM-managed packages, the workflow applies AXM extension-management
guidance independently of the runtime host profiles the skill claims. This
preserves the portable core while using AXM's canonical package, projection,
composition, validation, and lifecycle capabilities.

## Install

```sh
axm install @agentxm/packs/agent-engineering
```

## Example

> Revise this Agent Skill to address findings A-01 and A-03. Preserve its
> supported routing behavior, preserve the motivating cases, validate the
> package, and record any remaining evidence needed for closure.

## Revision 0.11.0

- Previous version: `0.10.0`
- Contract delta: authoring now treats generated-file containment, consumer
  worktree ignore rules, and release filtering as separate controls and checks
  them when bundled helpers can create disposable files
- Suite delta: suite `0.6.0` adds a Python-helper case requiring a focused
  extension-root `.gitignore` and independent archive-preview evidence
- Compatibility: existing skills without applicable generated files need no
  new metadata; no install, enable, publish, or authority boundary changed
- Evidence: package lint, suite validation, and the knowledge bundle's OKF
  validation pass; behavioral execution and independent approval are not
  claimed

## Revision 0.10.0

- Previous version: `0.9.0`
- Contract delta: target-controlled helpers, package commands, interpreters,
  executables, and dependencies now require identity, provenance, static
  inspection, explicit trust, and bounded execution authority before use;
  unavailable dynamic checks remain visible rather than being improvised;
  combined proof requests now require explicit owner-bound handoffs to
  `evaluate-agent-skill` for behavioral evidence and `audit-agent-skill` for
  conformity, trust, and closure rather than relabeling authoring checks
- Suite delta: suite `0.5.0` separates behavioral evaluation from audit,
  introduces the active `skill-creator` collision, and adds missing-knowledge,
  unavailable-validator, and untrusted-helper cases with deterministic
  non-execution gates
- Compatibility and cohort: the model-facing description is unchanged pending
  held-out routing evidence; portable AXM-managed authoring remains the target
  job, while explicitly Codex-local skill creation is assigned to its host
  neighbor
- Risk delta: executable validation is narrower and may now leave a dynamic
  check unavailable when trust or execution authority is incomplete; the local
  write envelope, install, enable, publish, certification, credential, network,
  and external-effect boundaries are otherwise unchanged
- Migration: callers that expect a target helper or package command to run must
  provide or establish its exact trust and authority binding; treat all suite
  `0.4.0` and older runs as stale for this revision
- Rollback: restore skill `0.9.0`, suite `0.4.0`, the prior handoff template,
  fixtures, and critical-gate mappings together
- Evidence: AXM version preview and application, evaluator `0.2.2` structural
  validation, and same-author selected-case smoke. A pre-final candidate
  (`sha256:ca308d16ee0a9ea3ff1fe406c9bddd7868c04ffbf3355e63634c414805005e6e`)
  passed cases 10, 11, 18, 20, 21, 22, and 23 in run
  `2026-08-22-authoring-smoke-0.10.0-affected-v1`; its initially inconclusive
  case 4 exposed the remaining handoff gap. The exact final package identity
  below passed remediated case 4 in
  `2026-08-22-authoring-smoke-0.10.0-case4-retry-v3`. Exact-final affected
  regression, baseline evidence, and independent audit closure remain separate
  work; no approval is claimed
- Bound identities: package
  `sha256:7c7e424e9b51d90b1f28de42846001fad249e2b4b51f0d5fd6051fceb4b57fae`
  and suite `sha256:c27a8e80fea4a0ecafb203b41c2833f2603c72acb62ca8ad04838754938dcbec`
