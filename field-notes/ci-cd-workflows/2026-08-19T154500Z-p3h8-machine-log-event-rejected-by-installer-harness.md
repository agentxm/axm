---
id: 2026-08-19T154500Z-p3h8
subject: ci-cd-workflows
key: machine-log-event-rejected-by-installer-harness
observed_at: "2026-08-19T15:45:00Z"
session: s8k2m4
kind: failure
status: open
---

**Expected:** Release installer verification would accept every documented machine-mode stderr event while still requiring upgrade progress diagnostics.
**Observed:** The `cli-v0.27.11` binaries emitted valid `type: "log"` NDJSON for the keychain warning, but all four installer lanes required every parsed stderr event to have `type: "progress"` and failed.
**Impact:** npm packages, release assets, Homebrew, and the AXM skill published successfully while the release workflow remained red on a verifier-only contract mismatch.
**Recovery:** Validate the complete stderr stream as allowed `progress` or shaped `log` events, then select progress events when asserting the required upgrade messages.
**Detected by:** GitHub Actions release run `32271277213` and local Linux reproduction against the published `cli-v0.27.11` assets.
**Observed factors:** Homebrew and AXM skill verification passed; every installer platform failed at the same `expectProgressMessages` event-type assertion; the adjusted assertion passed the released Linux installer lane locally.
**Hypothesis:** The release harness encoded the formerly observed event set instead of the full machine-output contract.
**Suggests:** Keep release assertions aligned with the documented discriminated union of machine diagnostic events.

Evidence: release run `32271277213`; exact release tag `cli-v0.27.11`; assertion at `packages/cli-e2e/src/install-verification.e2e.test.ts:284`.
