---
type: Pattern
title: "Workflow handoff artifact"
description: "When work continues in another workflow or session, record the decisions and evidence the next participant needs to resume."
tags: ["skills", "handoff", "artifact", "resume", "freshness"]
status: draft
sources:
  - id: critique
    resource: https://impeccable.style/docs/critique/
    title: Impeccable critique
  - id: quality
    resource: https://github.com/qualitymd/quality.md/blob/6291df0e3173bf281f10a2a446a50eed041b7d21/skills/quality/guides/recommendation-follow-up.md
    title: Quality recommendation follow-up
---

# Workflow handoff artifact

A later workflow may start with an artifact and no conversation history. Impeccable saves critiques that a polish pass can pick up and recommends refreshing them after substantial changes. Quality has a separate workflow for acting on or handing off an evaluation recommendation.[^critique][^quality]

Record the target and revision, selected findings or decisions, evidence locators, open questions, and the next authorized step. Use an existing report or brief when it can carry that information. A second copy introduces another place a decision can go stale.

For example, a release archive review might hand off “Archive 1.4, finding F2. The packaged skill links to `migration.md`; the listing contains `migrations.md`. The maintainer selected F2 for repair. Rebuild the archive and exercise the original request.” A handoff for review alone would instead record the proposed fix as awaiting a decision.

Have the consumer check the target against the recorded evidence before reusing the finding. If the file changed, inspect the affected reference again. If the guide now resolves, close or update F2 with the new evidence. A task completed in one conversation with no downstream consumer seldom warrants a separate handoff.

Try resuming from the artifact alone, then repeat with a revised archive where F2 has been fixed. The consumer should know what to do in both cases. A [display template](display-template.md) can help a person read the handoff. Its usefulness across sessions depends on identity, evidence, and freshness.

[^critique]: Impeccable, saved reviews and when to refresh them.

[^quality]: Quality, recommendation selection and follow-up.
