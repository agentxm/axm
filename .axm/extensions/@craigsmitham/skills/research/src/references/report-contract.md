# Research report contract

Return human-readable Markdown in this exact section order. Keep the skeleton
stable across `rapid`, `standard`, and `deep` modes; compress prose rather than
removing required fields.

# Research report

## Research context

State in compact bullets:

- **Intended decision or use:** supplied value, or `Not supplied`.
- **Subject and boundary:** what was and was not investigated.
- **Research mode:** `rapid`, `standard`, or `deep`, including a supplied cap.
- **Evidence current as of:** the latest date through which changeable evidence
  was checked.
- **Material assumptions:** consequential assumptions, or `None identified`.
- **Independence status:** whether the supplied brief was represented as blind
  or neutral; do not claim procedural blindness from wording alone.

## Executive synthesis

Use exactly these four compact labels:

- **Bottom line:** the overall evidence-backed synthesis, not a slogan.
- **Most consequential finding:** the result with greatest effect on the
  intended use.
- **Most important remaining uncertainty:** the gap most likely to change the
  synthesis.
- **Decision implication:** what the evidence changes for the intended use;
  this is not a recommendation unless requested.

## Question dashboard

Give one row for every supplied `Q` question and every investigated emergent
`E` question:

| ID | Short question | Status | Bottom line | Confidence |
| --- | --- | --- | --- | --- |

Use only the statuses and confidence labels in `evidence-practice.md`. Keep each
bottom line to one sentence. Preserve input order within priority; place
emergent questions afterward.

## Findings

Give every dashboard row exactly one matching subsection, headed with the ID
and full original question:

### Q1 — Full research question

- **Answer:** Direct answer in one or two sentences, or an explicit statement
  that the evidence does not support one.
- **Evidence:** Synthesis with citations adjacent to material claims.
- **Counterevidence and alternatives:** Credible conflict, competing
  explanations, or `No material counterevidence found within scope`.
- **Confidence and limitations:** One allowed confidence label followed by its
  concrete basis and limitations.
- **Decision implication:** Consequence for the intended use, or `No intended
  decision was supplied`.
- **What could change this answer:** Specific missing, future, or
  decision-relevant evidence.

For an emergent question, add one first field:

- **Trigger:** The evidence that made the question material.

Do not merge several questions into one subsection even when their answers
overlap. Cross-reference the other ID instead of duplicating evidence.

## Cross-question synthesis

Explain relationships, dependencies, tensions, and tradeoffs visible only when
the findings are considered together. Separate direct evidence from inference.
State `No material cross-question synthesis` when the questions are independent.

## Emergent findings

List each investigated `E` question and its trigger, or state `None`. Do not use
this section as a place for interesting but immaterial facts.

## Unresolved gaps and next research

Order unresolved, blocked, and not-reached gaps by their potential to change the
intended decision or synthesis. For each, state why it remains open and the
cheapest useful next evidence. State `None material within scope` when complete.

## Sources and method

Briefly state which source classes and search boundaries were used, what was
unavailable, and any material method limitation. Then provide a compact source
register containing only cited sources:

| Source | Type and date | Questions supported | Material use or limitation |
| --- | --- | --- | --- |

Use descriptive linked source titles. Keep citations adjacent to claims in the
findings even though the sources also appear in this register.
