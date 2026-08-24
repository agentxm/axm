# Behavioral evaluation cases

Run each prompt in a fresh agent context with the skill and the
software-engineering knowledge bundle. Do not provide the expected output or
assertions to the test agent. `evals.json` is the machine-readable authority.

The cases cover defect evidence and hypotheses, feature-request need versus
solution, a changing incident record, a brief-only rewrite, refusal to turn
unaccepted intake directly into implementation tasks, faithful preservation of
supplied design and delivery context, absence of invented context, and linked
cross-cutting design. It also covers faithful transfer of an accepted delivery
item with exact code sketches, containment semantics, implementation surfaces,
non-goals, verification conditions, testing strategy, and an unresolved design
question.

The suite passes when the selected artifact matches its lifecycle, facts and
unknowns remain honest, supplied context is retained at its actual authority
state, the brief is derived from the body, and no product, design, priority, or
delivery decision is invented.
