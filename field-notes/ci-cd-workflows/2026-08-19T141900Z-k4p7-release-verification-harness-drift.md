---
id: 2026-08-19T141900Z-k4p7
subject: ci-cd-workflows
key: release-verification-harness-drift
observed_at: "2026-08-19T14:19:00Z"
session: s8k2m4
kind: failure
status: open
---

**Expected:** The release workflow would verify the published CLI and bundled AXM skill across supported install paths with failures that expose the rejected output.
**Observed:** The `cli-v0.27.10` release and failed-job rerun both reached successful publication, Homebrew installation, and skill publication, but all installer matrix legs stopped at an opaque JSON parser error and the clean-workspace skill check omitted the newly required explicit setup scope.
**Impact:** Published artifacts required direct verification while the release workflow remained red, and the installer failures did not preserve the malformed stderr line needed to identify their source.
**Recovery:** Add explicit project scope to the skill check, report the rejected NDJSON line in the installer verifier, then run the release workflow idempotently for the existing tag.
**Detected by:** GitHub Actions release run `32261923584`, its failed-job rerun, and direct production install checks.
**Observed factors:** Asset publication, npm publication, Homebrew verification, and skill publication succeeded; direct Linux installer and explicit-scope skill checks succeeded; the four matrix legs failed at the same `expectProgressMessages` parser location.
**Hypothesis:** Release-time verification assumptions drifted from the CLI interaction contract, while the installer parser discarded the evidence needed to distinguish product output from runner-specific noise.
**Suggests:** Keep release verification inputs explicit and make channel-contract assertions include a safely encoded copy of any rejected line.

Evidence: release run `32261923584`; exact release tag `cli-v0.27.10`; repeated parser error at `install-verification.e2e.test.ts:267`; setup recovery guidance required `--scope project`.
