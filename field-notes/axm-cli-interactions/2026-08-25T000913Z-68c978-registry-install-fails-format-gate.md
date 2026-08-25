---
id: 2026-08-25T000913Z-68c978
subject: axm-cli-interactions
key: registry-install-fails-format-gate
observed_at: "2026-08-25T00:09:13Z"
session: a29d2849
kind: workaround
status: open
---

**Expected:** Public packages installed by AXM and accepted by `axm lint --view git-index --strict` would pass the repository's documented pre-commit gate without changing their Registry archive content.
**Observed:** The hook's AXM lint passed, then `axm:verify-affected` failed in `pnpm exec nx format:check` on files under `.axm/extensions/@craigsmitham/`. A prior `git diff --cached --check` also identified four trailing-space lines in the installed `author-okf` specification.
**Impact:** The requested commit was rejected once after the full staged update, and the Registry materialization required a repository-formatting recovery step. Elapsed delay was not measured.
**Recovery:** The failed hook left the staged update intact. The repository's documented `pnpm format` command was selected before retrying the complete commit gate; the broader task remained in progress.
**Detected by:** The Husky pre-commit hook invoked by `git commit`.
**Observed factors:** Local AXM strict lint reported no findings; lint-staged intentionally selected only two non-`.axm` files; `nx format:check` named installed Knowledge, Skill, Pack, and evaluation files; the commit exited `1` and no commit was created.
**Diagnostic evidence:** Failed target `axm:verify-affected`; failed command `pnpm exec nx format:check`; lifecycle exit code `1`; repository remained at commit `c8108b966269114ffa0fd0dad29284eab6680ab9`.
**Hypothesis:** The consumer repository's formatting boundary includes Registry canonical packages while its staged formatter excludes `.axm`, so newly installed archives can reach the check without first receiving repository formatting.

Evidence: The complete pre-commit output was retained, including the AXM lint success, the formatter's affected paths, failed target, and process exit status.
