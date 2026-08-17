# Harness engineering knowledge

Portable knowledge for designing, evaluating, and maintaining the system
around an agent: runtime, interfaces, state, feedback, authority, containment,
and operating environment. It implements and enforces an agent's behavioral
contract; it does not own agency choice, goals, planning, capability policy,
memory influence, delegation, recovery choice, or stopping behavior. Context
is one harness input, but its detailed selection, routing, memory, and lifecycle
practices belong to context engineering.

Begin with harness engineering, agent-system composition, and classification,
then inspect agent legibility and the concrete system responsibilities under
harness elements. Domain and environment profiles apply those foundations to
recognizable work and ownership boundaries, including coding harnesses and
repository harnesses.

For agent behavior, context surfaces, prompts, and Agent Skills, this bundle
owns only the implementation boundary within the whole system. Their detailed
design and lifecycle belong to their respective engineering disciplines. The
knowledge bundle is independently installable.

## Install

```bash
axm install @agentxm/knowledge/harness-engineering
```

## Usage

Browse from the bundle index or open a concept directly:

```bash
axm knowledge concepts get '@agentxm/knowledge/harness-engineering#foundations/harness-engineering'
axm knowledge concepts get '@agentxm/knowledge/harness-engineering#foundations/agent-system-composition'
axm knowledge concepts get '@agentxm/knowledge/harness-engineering#foundations/harness-classification'
axm knowledge concepts get '@agentxm/knowledge/harness-engineering#foundations/agent-legibility'
axm knowledge concepts get '@agentxm/knowledge/harness-engineering#elements/action-and-observation-interfaces'
axm knowledge concepts get '@agentxm/knowledge/harness-engineering#elements/runtime-and-environments'
axm knowledge concepts get '@agentxm/knowledge/harness-engineering#elements/feedback-and-verification'
axm knowledge concepts get '@agentxm/knowledge/harness-engineering#elements/authority-and-containment'
axm knowledge concepts get '@agentxm/knowledge/harness-engineering#domains/software-engineering/harnesses'
axm knowledge concepts get '@agentxm/knowledge/harness-engineering#domains/software-engineering/repository-harnesses'
axm knowledge concepts get '@agentxm/knowledge/harness-engineering#operations/evaluating-and-improving-harnesses'
```

The bundle was migrated from the original `@agentxm` package while preserving
its content provenance.

## Trust and freshness

Concept frontmatter distinguishes lifecycle status from provenance. `stable`
means the concept is intended for current use; it does not claim independent
review. `generated` records the producing actor. A `verified` event applies to
the current generated content only when its timestamp is at or after
`generated.at`. A `codex/*` verification is machine confirmation, not human
review. Unless a `human:*` verifier is recorded, confirm consequential claims
against cited sources and current product documentation.

## License

MIT.
