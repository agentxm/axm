# Diagnose workspace state

Enter when invoked as `doctor` or asked to check, diagnose, or health-check AXM
workspace state. Diagnosis is a local read and authorizes no repair.

1. Preflight `axm`. When it is missing, report `Could not diagnose` with the
   install route only.
2. Agents read the user scope and the invoked folder together; diagnose both,
   user first. Run `axm lint --scope user --json`. Unless the working
   directory is `$HOME`, run `axm lint --json`; when the directory lacks
   `axm.json` and `git rev-parse --show-toplevel` has one, add `-C <toplevel>`.
   A `workspace/initialized` finding means that scope is not set up.
3. For each set-up scope, run `axm sync --preview --fail-on-change --json` and
   `axm list --json` with its `--scope`; classify findings by lint rule ID and
   inventory by `management`. Read `git status` for recoverability and
   `git grep -n` for references to each removal candidate. Add read-only checks
   live help offers.
4. Unless asked to stay offline, check currency against configured sources
   only: `axm upgrade --preview --json`, then `axm list --outdated --json` and
   `axm list --deprecated --json` for each set-up scope, and
   `axm view <fqn> --json` for a replacement named only in a deprecation note.
   Never authenticate for these. Report an offline request, unreachable source,
   or timeout as skipped, not failed.
   For a directly installed deprecated extension, report its reason and any
   disclosed replacement. Suggest `axm migrate <fqn> --preview` for `obsolete`
   or `superseded` with an available replacement; apply `axm migrate <fqn>`
   only when repair was selected. For `superseded` with an unavailable or
   concealed replacement, explain why migration cannot proceed. For
   `unmaintained` or `other`, explain that the user must choose a successor.
   A Pack member requires its publisher to update the dependency.
5. Render [the doctor report](doctor-report.md) exactly, then stop
   at its choice. Only a selected option or named IDs authorize repair;
   free text becomes a plan to approve.
6. Apply exactly the selected IDs in the report's dependency order, re-run the
   checks, and render the post-repair report with the same IDs.

Never hand-delete installed or projected content; converge it with `axm sync`.
Never delete authored content without an explicitly selected option.
