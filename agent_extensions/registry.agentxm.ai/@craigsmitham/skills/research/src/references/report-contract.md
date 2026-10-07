# Research report contract

Return human-readable Markdown in this order. Preserve every input question ID
and full wording.

```markdown
# Research report

## Context

- **Intended use:** supplied value or `Not supplied`
- **Subject and boundary:**
- **Research limits:** supplied caps or `None supplied`
- **Evidence current as of:**
- **Material assumptions:** consequential assumptions or `None identified`
- **Independence status:** `ordinary`, `procedurally blind`, or `Not supplied`

## Summary

- **Bottom line:** overall evidence-backed synthesis
- **Most important uncertainty:** the gap most likely to change the synthesis
- **Decision implication:** what the evidence changes for the intended use,
  without making the decision

## Question dashboard

| ID | Short question | Status | Answer |
| --- | --- | --- | --- |

## Findings

### Q1 — Full original question

- **Answer:** direct answer or an explicit statement that evidence does not
  support one
- **Evidence and counterevidence:** synthesis with citations beside material
  claims and comparable treatment of credible conflict
- **Limitations:** evidence strength, applicability, assumptions, and unresolved
  conflict
- **Implication and next evidence:** consequence for the intended use and the
  cheapest evidence that could materially change the answer
```

After `Findings`, include `## Cross-question synthesis` only when material
relationships, dependencies, tensions, or tradeoffs appear across findings.
Otherwise omit it. Then finish with:

```markdown

## Unresolved gaps and next research

Order unresolved, blocked, and not-reached gaps by their potential to change the
synthesis. State `None material within scope` when complete.

## Method and limitations

State the source classes and search boundaries used, unavailable evidence, and
material method limitations.
```

Give every dashboard row exactly one matching finding. Use only the statuses in
`evidence-practice.md`. Keep dashboard answers to one sentence. For
`Unresolved`, `Blocked`, and `Not reached`, state explicitly that no substantive
answer is supported.

Do not create a separate source register; citations remain adjacent to the
claims they support.
