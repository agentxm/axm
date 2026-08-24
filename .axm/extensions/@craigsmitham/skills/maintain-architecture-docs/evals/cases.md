# Behavioral evaluation cases

Run each prompt in a fresh agent context with the skill and the
software-architecture knowledge bundle. Do not provide the expected output or
assertions to the test agent. `evals.json` is the machine-readable authority.

The cases cover review-only authority, mechanical repair, desired-state and
implementation disagreement, copied mechanics, duplicate canonical ownership,
strategic freshness, setup preconditions, and the authoring boundary.
They also cover recommendation-only semantic deletion, explicitly authorized
reduction, and migration from plural catch-all documents to stable named
concepts.

The suite passes when the skill maintains an established documentation set
without silently deciding architecture, treating recency as authority, or
expanding into setup, new-subject authoring, implementation, or generic docs.
