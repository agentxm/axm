# Synthetic AXM revision request

- Target: `@example/skills/review-release@0.4.0`
- Canonical package: `skills/review-release/`
- Runtime source: `skills/review-release/src/SKILL.md`
- Evaluation source: `skills/review-release/evals/`
- Ownership: workspace-authored through AXM; agent-facing copies are projections
- Confirmed failure: “deploy this release” falsely selects this review-only skill

Revise only the model-facing routing description needed to exclude deployment,
preserve the current review workflow, add the confirmed failure as a routing
regression, validate every available responsible surface, and report any
mechanical evaluation validation that remains unavailable. Do not edit an
agent-facing projection, install, enable, deploy, or publish anything.
