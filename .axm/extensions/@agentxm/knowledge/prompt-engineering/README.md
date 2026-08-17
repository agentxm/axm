# Prompt engineering knowledge

Portable knowledge for designing, templating, evaluating, securing, versioning,
and adapting model-facing instructions across prompts, tools, graders,
handoffs, skills, and multimodal interactions.

Use it when prompt content or a response contract is the artifact under design.
It does not own context retrieval and memory, runtime permissions and tool
enforcement, agency choice and control policy, or the lifecycle of a larger
workflow package.

## Install

```sh
axm install @agentxm/knowledge/prompt-engineering
```

## Example

Ask an agent to turn a repeatedly used prompt into a bounded template with
explicit variables, a response contract, representative evaluations, and a
versioned compatibility record.

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
