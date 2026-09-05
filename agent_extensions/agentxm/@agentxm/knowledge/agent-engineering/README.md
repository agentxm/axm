# Agent engineering knowledge

Portable knowledge for people designing and operating goal-directed AI agents.
It covers when agency is warranted, how agent behavior should be structured,
and how prompts, context, harness, skills, evaluation, trust, and lifecycle
concerns fit together as one system rather than as separate disciplines.

It does not attempt to cover robotics, autonomous vehicles, or reinforcement
learning as complete fields, and it does not supply a framework, runtime, or
executable agent.

## Install

```bash
axm install @agentxm/knowledge/agent-engineering
```

## Usage

Browse from `src/index.md`, or retrieve an exact concept with AXM:

```bash
axm knowledge concepts get '@agentxm/knowledge/agent-engineering#foundations/system-elements-and-boundaries'
axm knowledge concepts get '@agentxm/knowledge/agent-engineering#agents/agent-loop-feedback-and-termination'
axm knowledge concepts search "instruction files"
```

Sections are `foundations`, `agents`, `multi-agent`, `prompts`, `context`,
`harness`, `skills`, `evaluation`, `trust`, `operations`, and `domains`.

## Trust and freshness

Concept frontmatter distinguishes lifecycle status from provenance. `stable`
means the concept is intended for current use; it does not claim independent
review. `generated` records the producing actor. A `verified` event applies to
the current generated content only when its timestamp is at or after
`generated.at`. A `codex/*` or `claude/*` verification is machine confirmation,
not human review. Unless a `human:*` verifier is recorded, confirm consequential
claims against cited sources and current product documentation.

## License

CC-BY-4.0.
