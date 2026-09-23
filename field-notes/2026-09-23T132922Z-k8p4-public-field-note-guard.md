---
observed_at: "2026-09-23T13:29:22Z"
session: "k8p4"
area: "public-artifact guard and field-note delivery"
---

# A public field note included private tracker context

## Context

A field note accompanied an unpublished public repository commit for scoped coordination changes.

## Friction

The affected verification failed `public-artifacts-protect-private-context.spec.ts` because the note used a private issue identifier. That blocked the public verification gate.

## Cost / impact

The unpublished commit had to be amended, and the affected workflow needed to run again. The first affected run took 2m 9s.

## Outcome

The private reference was removed from the field note and the unpublished commit was amended. Verification of the corrected commit was pending when this note was written.

## Evidence

The affected workflow output reported one `public-artifacts-protect-private-context.spec.ts` failure naming the field note. The amended public commit is `1ac50239f`.
