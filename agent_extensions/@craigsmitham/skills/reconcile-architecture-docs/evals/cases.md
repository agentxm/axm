# Behavioral evaluation cases

Run each prompt in a fresh agent context with the skill and the
software-architecture knowledge bundle. Do not provide the expected output or
assertions to the test agent. `evals.json` is the machine-readable authority.

The cases cover review-only authority, mechanical repair, desired-state and
implementation disagreement, copied mechanics, duplicate canonical ownership,
strategic freshness, setup preconditions, and the authoring boundary.
They also cover recommendation-only semantic deletion, explicitly authorized
reduction, migration from plural catch-all documents to stable named concepts,
the mandatory lifecycle/ownership/decision-policy/assurance kernel, rejection
of C4 or overview substitution, and explicitly authorized migration to atomic
ADR and constraint collections. Profile cases require separate base and profile
results, reject local waivers, preserve unknown, and route initial adoption of
legacy Markdown to setup.

The suite passes when the skill reconciles an established documentation set
without silently deciding architecture, treating recency as authority, or
expanding into setup, new-subject authoring, implementation, or generic docs.
It may complete a bounded review with classified failures, but it never calls a
corpus conforming while required OKF or profile evidence fails or is unknown.
