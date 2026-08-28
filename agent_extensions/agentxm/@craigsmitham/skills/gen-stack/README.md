# Gen Stack

Explains the Gen Stack method, creates reader-oriented briefs, adopts or
maintains an established `./gen-stack/` corpus under explicit human authority,
and routes bounded software changes to the pack's focused stages.

Version `3.2.0` routes exact landed Pitch, Change coordination, Change
Specification, Change Design, and Plan persistence to the host-neutral
`sync-change` sibling instead of re-authoring or summarizing those artifacts.
Explicit plan projection remains separate from Plan and from lifecycle stages.

Version `3.1.0` routes implementation plans through proportional focused
Architecture, Requirements, Evaluations, and Implementation review checkpoints
and uses the pack's fresh read-only Reviewer for checkpoint or integrated final
assessment.

Version `3.0.0` routes durable coordination through Change, treats Change
Specification and Change Design as sibling artifacts, treats Bugfix as a Change
classification, and includes the explicit combined `/quick-change` route.
Version `2.1.0` adds routing to Shape for raw or mixed change intent. Version
`2.0.0` made this skill the method, corpus, and orientation surface.
It no longer tries to be the single executor for an entire change. Requests
whose desired outcome is a Pitch, Research, diagnosis, Change Specification, Change Design,
planning, implementation, review, or shipping use the corresponding pack sibling:

- `shape`
- `research`
- `investigate`
- `spec`
- `design`
- `quick-change`
- `plan`
- `sync-change`
- `implement`
- `review`
- `ship`

`plan` schedules material focused reviews, `implement` dispositions their
actions, and a fresh integrated `review` assesses the exact final candidate.
Focused review feedback and Evaluation Results remain separate evidence.

`sync-change` is a cross-cutting host-neutral persistence capability rather
than another lifecycle stage. It preserves exact landed artifacts in one
canonical work-item home, verifies persisted readback, and projects an exact
plan into host-native implementation records only when explicitly requested.

Shape turns raw context into a provisional Pitch; it does not create another
work-item role or accept desired state. The canonical relationship among the
stages, including specification-first and design-first convergence, lives in
the Gen Stack Process `processes/deciding-and-realizing-software-changes.md`.
Shape and Spec remain agnostic about implementation-level Evaluations and
tests. Spec owns the canonical why-and-what artifact; Design owns the canonical
how artifact and optional
Implementation-conformance Evaluations.

This skill remains deliberately human-governed. It can gather evidence,
develop candidates, compare options, recommend, draft, encode explicitly
ratified meaning, and execute authorized corpus mutations. It cannot ratify
Intent, Requirements, durable Architecture, or release decisions on behalf of
their authorities.

Install it through:

```bash
axm install @craigsmitham/packs/gen-stack
```

## License

MIT
