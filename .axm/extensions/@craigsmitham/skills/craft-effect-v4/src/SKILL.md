---
name: craft-effect-v4
description: >
  Routes Effect v4 TypeScript architecture, implementation, and review to
  opinionated guides on modeling, services, errors, schemas, resources,
  concurrency, streams, DateTime, Duration, Clock, platforms, testing, and
  observability. Use in Effect v4 codebases, or for authorized adoption
  assessment, when work involves service boundaries, raw `process.env`,
  unvalidated JSON, thrown or `unknown` errors, `Promise.all`, detached work,
  `try/finally` cleanup, caches, client maps, `fetch`, `node:fs`, or console
  telemetry. Not for Effect v3, introducing Effect where another runtime is
  authoritative, local work that forbids dependency or architecture changes,
  or unresolved adoption authority. A scoped Temporal or native Date
  instruction governs that representation without excluding Effect guidance
  for other concerns.
compatibility: Effect v4; guides target 4.0.0-rc.111, with installed APIs controlling when a consequential claim conflicts
---

# Craft Effect v4

Route Effect v4 work to the smallest relevant part of
`@craigsmitham/knowledge/effect-v4`.

## Runtime and version gate

Apply this gate before opening the v4 knowledge bundle or proposing a runtime
change. Inspect repository metadata only as needed to establish these facts.

1. Resolve runtime authority.
   - If the codebase deliberately uses Effect v3 and migration is not
     authorized, do not apply or offer v4 APIs. Name the v3/v4 boundary, keep
     migration out of scope, and stop.
   - If the codebase deliberately uses another runtime model, or the task
     forbids runtime or dependency changes, do not introduce Effect. Keep any
     useful review local to the existing model or abstain.
   - If an Effect codebase or module selects Temporal, native `Date`, or another
     date representation for a bounded concern, do not treat the whole module
     as a different runtime model. Preserve that representation and apply
     Effect guidance only to the remaining Effect concerns.
   - If authority to consider Effect or change the runtime architecture is
     unresolved, ask for that decision or abstain before applying the guides.
   - If Effect is absent but adoption is allowed, use the guides to assess it
     as an option. Do not add the dependency or choose the runtime for the
     developer without authority.
2. When the codebase uses Effect, confirm that it targets major version 4 and
   inspect the installed version to learn the available API surface. The bundle
   targets `4.0.0-rc.111`; another v4 release candidate is compatible territory
   and does not by itself require upstream source research.
3. Read
   `.axm/extensions/@craigsmitham/knowledge/effect-v4/src/index.md` and open
   only the guides its symptom map routes to. The index is the canonical route;
   do not recreate that map in this skill or load the whole bundle.
4. Follow the selected guides and repository-local requirements. Open the
   guides they cross-link only when the requested scope needs them.

For date and time, resolve representation, current-time access, and effectful
timing separately. A scoped representation instruction controls domain values.
Inside an Effect computation, keep current-time access in `Clock`/`TestClock`
and keep `Duration`, `Schedule`, timeouts, and caches responsible for effectful
timing unless effective instructions explicitly change those concerns. Convert
at their boundary instead of replacing a scoped Temporal or native `Date`
model with `DateTime` merely because the file uses Effect.

During a design or architecture workflow, use the guides to establish
version-matched capability semantics, constraints, and feasibility evidence for
the options under consideration. Supply that evidence to the active workflow;
do not choose consequential alternatives for the developer. Do not infer that
Effect availability alone makes its use a binding architectural rule.

When installed types or source conflict with a guide's consequential API claim,
or the claim remains consequentially uncertain, inspect the installed Effect v4
public source and tests before modifying code. Installed v4 evidence controls
the implementation: never apply a conflicting guide shape merely because the
request asks you to. Report the verified guide/API drift and any uncertainty
that remains before acting. Do not launch that investigation merely because the
installed v4 release number differs from the guide baseline.
