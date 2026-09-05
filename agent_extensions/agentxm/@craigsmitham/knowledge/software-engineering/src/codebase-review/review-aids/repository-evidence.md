---
type: Guide
title: Repository evidence
description: Use when locating and interpreting evidence across source, configuration, history, generated artifacts, and dependency relationships without treating proxies as findings.
tags: [codebase-review, review-aid, repository, evidence, history, dependencies]
status: draft
sources:
  - id: google-review
    resource: https://google.github.io/eng-practices/review/reviewer/looking-for.html
    title: What to look for in a code review
  - id: reflexion
    resource: https://www.cs.ubc.ca/~murphy/papers/rm/fse95.html
    title: Software Reflexion Models
  - id: nist-ssdf
    resource: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf
    title: NIST SP 800-218 Secure Software Development Framework
  - id: pstack-review
    resource: https://github.com/cursor/plugins/blob/main/pstack/skills/interrogate/references/code-quality-review.md
    title: pstack Code Quality Review
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Repository evidence

Use this optional aid after a [product-quality
criterion](../criteria/) identifies the outcome being judged. It helps locate
static and historical evidence without making file presence, pattern matches,
tool output, metrics, or reviewer intuition the finding.

## Establish the evidence boundary

Record the repository revision, paths, generated state, submodules or vendored
content, available history, build configuration, and artifacts in scope. Note
which operative inputs live elsewhere. A repository view that excludes runtime
configuration, generated code, dependency resolution, or deployment state may
be incomplete for the claim.[^nist-ssdf]

## Search from the claim

1. Translate the criterion into the behavior, state, relationship, or change
   consequence that would satisfy or contradict it.
2. Locate declared authorities: requirements, public contracts, schemas,
   invariants, package surfaces, configuration precedence, task definitions,
   and generated-source ownership.
3. Trace the relevant causal path through callers, callees, data, state,
   effects, failure paths, dependency edges, and configuration.
4. Compare the declared structure with actual imports, runtime registration,
   build edges, data relationships, and representative history. Reflexion
   models use exactly this comparison to expose agreement and divergence
   without assuming that every graph difference is a defect.[^reflexion]
5. Seek disconfirming paths, alternate entry points, exceptions, platform
   variants, and evidence that the apparent condition is intentional or
   unreachable.
6. Record the smallest reproducible observation and its relationship to the
   criterion before drafting a finding.

Repository search should widen only as the claim requires. A keyword, file
size, dependency count, missing test, age, clone, TODO, cast, or tool warning is
a navigation cue. It becomes evidence only when connected to operative behavior
or a material consequence. Google's code-review guidance likewise asks whether
code is understandable and correct in context rather than treating one metric
as the verdict.[^google-review]

## Use history carefully

History can show repeated fixes, co-change, regressions, ownership, deprecated
paths, migration decisions, and rationale. It cannot prove future change cost
or present reachability by frequency alone. Bind every historical observation
to revisions and explain why the sampled changes represent the claim.

## Preserve an evidence note

```text
Claim and criterion:
Repository snapshot:
Located authority:
Observed path or relationship:
Supporting evidence:
Counterevidence:
Unavailable evidence:
Inference and uncertainty:
Possible consequence:
Next corroboration, if warranted:
```

Stop when the observation cannot be connected to a declared outcome, when the
operative evidence lies outside authorized access, or when execution or domain
authority is needed. Route execution-dependent claims to [Runtime
investigation](runtime-investigation.md) and evidence-method selection to
[Verification evidence](verification-evidence.md). Contemporary practitioner
review systems such as pstack are useful sources of search prompts, but their
thresholds and forceful heuristics remain hypotheses until tied to the reviewed
claim.[^pstack-review]

[^google-review]: Google, [What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html).
[^reflexion]: Murphy, Notkin, and Sullivan, [Software Reflexion Models](https://www.cs.ubc.ca/~murphy/papers/rm/fse95.html).
[^nist-ssdf]: NIST, [SP 800-218 Secure Software Development Framework](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf).
[^pstack-review]: Cursor, [pstack Code Quality Review](https://github.com/cursor/plugins/blob/main/pstack/skills/interrogate/references/code-quality-review.md).
