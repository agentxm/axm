# Sync Change

Performs a user-requested manual checkpoint or repair for one exact current
Pitch, Change Specification, Change Design, or plan. It updates the canonical
artifact in place, protects concurrent work, reads back persisted state, and
reports `VERIFIED-EXACT`, `VERIFIED-FAITHFUL`, `DRIFT`, or `UNVERIFIED`
fidelity.

Focused stages own initial Draft and lifecycle-event persistence. Sync Change
does not reconstruct lost chat-only edits, change artifact state, accept an
artifact, or project a plan into derived host-native tasks.

Install it through `@craigsmitham/packs/gen-stack`; it is not standalone.

## License

MIT
