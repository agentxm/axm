# Evaluation Engineering

Portable knowledge for designing and maintaining evaluations of variable AI
systems. It covers evaluation contracts, representative cases, trials,
graders, baselines, uncertainty, validity, evidence, and lifecycle governance.

Use it when an evaluation must support a real decision about a prompt, context
system, agent, harness, skill, model, or complete application. It supplies the
shared measurement discipline; target-specific bundles still define what good
behavior means for their own artifacts.

It is not a provider API guide, benchmark catalog, replacement for software
testing, or domain-specific safety standard.

```sh
axm install @agentxm/knowledge/eval-engineering
```

Open the bundle index, then follow the route for evaluation design, validity,
or operation that matches the decision you need to support.

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
