# QRSPI

Provides one entry point for independent research while retaining a visible
two-stage contract. It turns an unframed subject into a small set of high-value,
evidence-seeking questions, then delegates the resulting Research Brief to a
fresh, read-only worker and returns a consistent question-by-question evidence
report. A supplied Research Brief skips framing and goes directly to execution.

## Included extensions

| Extension | Role |
| --- | --- |
| `@craigsmitham/skills/question` | Select relevant concerns and produce a Research Brief with prioritized, stable question IDs, including hypothesis-neutral blind checks |
| `@craigsmitham/skills/research` | Orchestrate missing-brief framing, bounded delegation, acceptance checks, and final presentation |
| `@craigsmitham/subagents/researcher` | Perform one isolated framing or research phase using read-only authority and no subdelegation |

## Install

```bash
axm packs install @craigsmitham/packs/qrspi
```

## Usage

```text
/research Investigate whether this proposal merits a pilot. Treat our prior
analysis as originating material, generate a procedurally blind Research Brief,
then execute it in standard mode using current public evidence.
```

To stop after framing, invoke Question directly:

```text
/question Frame the five research questions most likely to change our decision
about this proposal. Do not conduct the research yet.
```

The generated Research Brief remains visible before its report. The pack blocks
rather than silently using a same-context fallback when a fresh researcher
context is unavailable. It does not make the resulting decision unless the
caller explicitly requests and authorizes that outcome.

## License

The pack's own metadata and README are licensed under MIT. Its members retain
the licenses declared in their manifests.
