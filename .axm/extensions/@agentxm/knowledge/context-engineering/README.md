# Context engineering knowledge

Portable knowledge for selecting, structuring, routing, refreshing, and
retiring the information available to agents. It covers persistent
instructions, retrieved knowledge, observed state, feedback, memory,
progressive disclosure, compaction, and context gardening.

Use it when the problem is what information reaches an agent, when, from which
authority, and for how long. It does not own prompt wording, runtime permission
enforcement, tool implementation, behavioral choices about planning or memory
influence, or the lifecycle of a packaged workflow.

## Install

```sh
axm install @agentxm/knowledge/context-engineering
```

## Example

Ask an agent to trace representative tasks from their initial instructions to
the knowledge, tools, state, and evidence they discover, then identify missing,
stale, overbroad, or unowned context.

## Trust and freshness

Concept frontmatter distinguishes lifecycle status from provenance. `stable`
means the concept is intended for current use; it does not claim independent
review. `generated` records the producing actor. A `verified` event applies to
the current generated content only when its timestamp is at or after
`generated.at`. A `codex/*` verification is machine confirmation, not human
review. Unless a `human:*` verifier is recorded, confirm consequential claims
against cited sources and current product documentation.

## License

CC-BY-4.0.
