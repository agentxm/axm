---
observed_at: "2026-09-30T18:05:00Z"
session: "nx-workflow-20260930"
area: "Nx distribution smoke prerequisites"
---

# Host smoke checks built four unused platform binaries

## Context

Investigating the successful distribution job in CI run 36751006761.

## Friction

The host binary smoke target depended on the all-platform compile aggregate.
Its tests selected only the current host binary; installation checks already
selected the host stage. The five native jobs separately compiled and executed
their platform binaries, which also supplied the release artifact family.

## Cost / impact

Distribution compiled five binaries while consuming one. Its observed
13m21s post-compilation gap remained unexplained. A same-source local diagnostic
took 56.461s with remote caching bypassed and 80.843s with a read-only remote;
both executed all tasks and produced identical binaries. Local archive
preparation took 2.604–4.781s per binary and did not reproduce the hosted gap.
These measurements do not establish the hosted delay's cause or net savings.

## Outcome

The smoke target now consumes the existing host-stage producer, and the focused
graph check and real smoke/install suites passed. Native platform verification,
explicit artifact identity and the all-platform compile command are retained.
