# Extension enablement evaluation, 2026-10-30

[Baseline](baseline.json) and [candidate](candidate.json) retain six cases each:
conceptual orientation, basic skill authoring without the pack, authoring with
it, read-only description review, an acquired-skill customization plan, and an
adjacent MCP server software request. Each pair used a fresh delegated evaluator
without the assessment or intended answers. Two cases shared each evaluator's
context. Instructions and runtime help were supplied explicitly; this does not
measure automatic host discovery.

The baseline is public revision `5a0283d6216a5cf28cfbf33af3c690be15eddce3` with CLI
0.51.0. Candidate input hashes identify the pre-format sources used for the
exercise. The model inherited the session's configuration; its exact backend
identifier was not exposed. Local machine paths are replaced with placeholders.

## Observed outcomes

| Case                | Baseline                                           | Candidate                                                                     |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| Explanation only    | Answered without workspace inspection              | Answered without workspace inspection                                         |
| Author without pack | Produced a complete package                        | Produced a complete package using core guidance                               |
| Author with pack    | Used focused knowledge and produced a package      | Used authoring, verification, and trust guidance and produced a package       |
| Read-only review    | Identified overly broad activation                 | Identified overly broad activation                                            |
| Acquired-skill plan | Preserved publisher and selected a separate fork   | Preserved publisher and selected a separate fork with explicit core authoring |
| MCP server code     | Kept work with software and requested missing code | Kept work with software and requested missing code                            |

Reviewers inspected the package bodies for coherent purpose, useful selection
conditions, factual-claim preservation, unsupported additions, and publication
boundaries. Both variants produced usable synthetic candidates in this sample;
no quality improvement rate is claimed. The no-pack and pack prompts differ
slightly, so they do not isolate the pack's causal contribution.

The baseline review evaluator attempted unsupported `axm inspect --help` and
recovered through live help. Both review evaluators unnecessarily ran `pwd`;
the disclosed output is path-sanitized. Candidate knowledge directly illustrates
the description-review case, so it is not held-out evidence. These observations
remain visible rather than being counted as clean trajectories.

## Evidence boundary

These are independent agent authoring and planning exercises, plus evaluator
self-checks, not independent execution of the resulting skills in a native host.
No project mutation, Registry action, secret use, or installation was permitted.
Schemas, archive integrity, clean-consumer installation, projection state, and
concept lookup are checked separately during release. A future claim about
activation rates, latency, portability, or quality improvement needs repeated,
held-out host runs. Keep these dimensions separate rather than one pass score.
