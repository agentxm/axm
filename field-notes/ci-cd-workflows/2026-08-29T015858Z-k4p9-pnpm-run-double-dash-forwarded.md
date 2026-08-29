---
id: 2026-08-29T015858Z-k4p9
subject: ci-cd-workflows
key: pnpm-run-double-dash-forwarded
observed_at: "2026-08-29T01:58:58Z"
session: codex-j8w3
kind: workaround
status: open
---

**Expected:** `pnpm run container:ci -- actionlint ...` would use `--` only as
the pnpm argument separator and pass `actionlint ...` to the repository script.
**Observed:** pnpm forwarded `--` to `scripts/container-environment.sh`, which
then asked mise to execute `--`; mise reported `"--" couldn't exec process: No
such file or directory` and the command exited 1.
**Impact:** Workflow validation required one failed attempt and one retry.
**Recovery:** Retrying as `pnpm run container:ci actionlint ...` omitted the
separator and completed successfully with exit 0.
**Detected by:** The pinned CI container command output and process exit status.
**Observed factors:** pnpm 11.20.0; the `container:ci` package script already
supplies the `ci` subcommand to `scripts/container-environment.sh`.
**Diagnostic evidence:** Failed command output began with `$ bash
scripts/container-environment.sh ci -- actionlint ...`; mise 2026.7.7
linux-arm64 emitted the process error above. The recovery output began with `$
bash scripts/container-environment.sh ci actionlint ...`.
**Hypothesis:** pnpm 11 preserves the explicit separator in script arguments for
this invocation shape.
**Suggests:** Show the no-separator argument-forwarding form in the repository
command guidance or have the wrapper ignore one leading `--`.

Evidence: One validation attempt exited 1 before actionlint ran; the same
arguments without `--` reached actionlint and exited 0.
