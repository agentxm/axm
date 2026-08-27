---
id: 2026-08-27T141238Z-k4m8
subject: axm-cli-interactions
key: inspect-help-falls-back-to-root-help
observed_at: "2026-08-27T14:12:38Z"
session: i9p4
kind: workaround
status: open
---

**Expected:** `axm inspect --help` would show command-specific help or reject the unknown command with a non-zero usage result, consistent with using `<command> --help` for exact syntax.
**Observed:** The command exited 0 and printed the AXM root help without identifying `inspect` as unknown.
**Impact:** Extension-path discovery required one additional help lookup and a replacement command; elapsed delay was not measured.
**Recovery:** Ran `axm list --help`, then used `axm list --type knowledge --json`; the original investigation continued.
**Detected by:** Process exit status and rendered help output.
**Observed factors:** Installed AXM CLI 0.28.1; project workspace; command surface `inspect --help`.
**Diagnostic evidence:** Process exit 0; stdout rendered root help; no structured error code or recovery was supplied.
**Hypothesis:** unknown

Evidence: An unrecognized command token followed by `--help` returned successful root help, so the caller could not distinguish an unsupported command from a valid help request without another lookup.
