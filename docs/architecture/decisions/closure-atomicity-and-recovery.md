---
type: Decision
status: stable
description: A failed workspace change restores only the semantic closure that failed, independently settled closures remain committed, interruption leaves authoritative files whole with recovery evidence, and remote Registry effects are never rolled back.
depends-on:
  - ../workspace/execution.md
  - ../principles.md
  - ./executable-specifications-authority.md
---

# Closure atomicity and recovery

## Decision

A workspace change is atomic per **semantic closure**, not per command.

- A request refused before application, or whose prepared candidate is found
  stale under the workspace transition lock, writes nothing.
- A closure that fails after it has begun writing is restored: the settings,
  lockfile, canonical content, and owned projections it changed go back as
  they were.
- Closures that had already settled stay committed. A later failure never
  undoes an earlier commit, and a failed closure never undoes a sibling.
- A dependent closure whose predecessor failed is reported as blocked and
  writes nothing.
- When an interruption arrives, every authoritative file is left either wholly
  as it was or wholly as committed. Closures that had settled stay committed,
  closures in flight are restored when restoration is possible, and the result
  names each unit's disposition and a recovery route — without promising to
  finish, resume, or roll back the interrupted request.
- Every closure outcome and any retained state is reported as a failed
  operation outcome (`partial`, `failed`, or `interrupted`) that automation can
  distinguish, and the CLI maps that outcome to a non-zero exit.
- Remote Registry effects are never rolled back. A publication that reached the
  Registry stays published; the result reports what is unresolved instead.

## Context

`docs/architecture/principles.md`, `docs/architecture/workspace/execution.md`,
the exit-code reference, and the `plan-result-v3` machine contract already
describe per-closure settlement: the contract carries `partial`, `rolled-back`,
`restored`, `retained`, and `unknown` precisely because commits and failures
coexist in one invocation. The accepted specification
`cli/mutations-are-closure-atomic` nevertheless read as a whole-command
guarantee — "leave settings, lockfile, canonical content, projections, and
temporary directories exactly as they were" — and carried two open questions
asking whether independent groups may remain committed and whether a failure
after writes may report a result document at all.

No example ever witnessed the whole-command reading. Its examples were all
preflight refusals, which both models satisfy. Meanwhile the implementation
settles each closure independently, restores only the failed one, and reports
`partial` — behaviour a whole-command guarantee would have to abandon.

## Alternatives considered

**Whole-command rollback.** Reject. It forbids the `partial` outcome that
reconciliation depends on: `axm sync` realizing ten extensions would have to
undo nine successful closures because the tenth could not be materialized, and
it would require cross-closure undo of state a person can already see and use.
It also cannot be honoured for remote Registry writes at all.

**Converge-only, with no rollback.** Reject. It abandons a promise the CLI
already keeps: a closure that fails halfway through leaves the workspace
readable and consistent today, and giving that up would make every partial
failure a repair task.

**Per-closure atomicity with independent settlement.** Accepted. It is what the
architecture, the machine contract, the exit-code reference, and the
implementation already say, and it is the only model that stays honest about
remote effects.

## Consequences

- `cli/mutations-are-closure-atomic` keeps its identity and is revised to the
  per-closure statement, with decisive examples for a stale candidate, failure
  after writes inside one closure, independent settlement, a blocked dependent,
  and a restoration that cannot complete. Its open questions close.
- A `limitations` entry on that specification records that remote Registry
  effects are not restored, retiring if the Registry gains a transactional
  publish contract; `cli/publish/outcomes-distinguish-unresolved-uploads` owns
  their reporting.
- `cli/interruption-preserves-authority-and-reports-recovery` is added at the
  process boundary, because signal delivery, atomic replacement, and lock
  reclamation are process and filesystem facts an in-memory port cannot
  establish.
- Evidence boundaries follow the fact under observation: closure rollback and
  settlement are proven over in-memory ports with injected write faults;
  the transition lock, atomic canonical replacement, interruption after a
  write, and abrupt death are proven against the real filesystem and the
  built binary.
- The atomicity a result reports is declared by the operation's owner. A
  workspace-wide update declares `non-rollbackable` because it advances each
  configured entry independently and undoes none.
- `docs/architecture/workspace/execution.md` and
  `docs/architecture/principles.md` depend on this record.

Accepting authority: maintainer approval through the repository pull-request
workflow.

## Reconsideration

Revisit if the Registry offers transactional publication, if a whole-command
rollback becomes a stakeholder requirement, or if the closure model itself
changes so that closures are no longer independently settleable.
