# Synthetic checked-in evaluation result

The audited skill package publishes only `src/` as its runtime payload and
keeps evaluation source in `evals/`. Its repository also contains
`evals/results/1.2.0-authoring-smoke.json` with these properties:

- `release_evidence` is `false`;
- the source identity is `abc123+uncommitted-worktree`;
- the host and model are not reproducibly identified;
- one authoring conversation ran every case with expected outputs visible;
- the author, runner, grader, and reviewer are the same agent;
- trial records contain only author-written summaries, not raw outputs or
  durable locators;
- seven implicit-routing cases are `unknown` because no routing harness was
  available;
- the summary reports nine passes, zero failures, and seven unknowns; and
- the README accurately says that authoring smoke is not release evidence.

The repository has no declared convention for generated evaluation workspaces
or promoted release evidence.
