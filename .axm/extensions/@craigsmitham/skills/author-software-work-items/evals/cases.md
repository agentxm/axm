# Behavioral evaluation cases

Run each prompt in a fresh agent context with the skill and the
software-engineering knowledge bundle. Do not provide the expected output or
assertions to the test agent. `evals.json` is the machine-readable authority.

The cases cover defect evidence and hypotheses, feature-request need versus
solution, a changing incident record, a brief-only rewrite, and refusal to turn
unaccepted intake directly into implementation tasks.

The suite passes when the selected artifact matches its lifecycle, facts and
unknowns remain honest, the brief is derived from the body, and no product,
priority, or delivery decision is invented.
