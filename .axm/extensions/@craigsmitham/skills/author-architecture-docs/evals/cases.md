# Behavioral evaluation cases

Run each prompt in a fresh agent context with the skill and the
software-engineering knowledge bundle. Do not provide the expected output or
assertions to the test agent. `evals.json` is the machine-readable authority.

The cases cover successful authoring from accepted functional, quality, and
structural meaning; refusal to turn an unresolved design option into accepted
architecture; explicit reconciliation when desired and implemented state
disagree; and rejection of an exhaustive prose mirror of the repository.

The suite passes when the skill produces the smallest useful architecture
artifact, preserves authority boundaries, routes exact mechanics to their
owners, and exposes rather than resolves missing architecture decisions.
