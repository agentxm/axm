---
id: 2026-08-17T145200Z-k3p9
subject: axm-cli-interactions
key: update-preview-hides-range-ceiling
observed_at: "2026-08-17T14:52:00Z"
session: 4c6c4d1b-5bf3-4bd0-9217-16710b86b5a9
kind: gap
status: open
---

**Expected:** Diagnosing "why isn't the latest `@craigsmitham/knowledge/effect-v4` installed", `axm update --preview` would indicate that a newer published version existed but was withheld by a configured version range.
**Observed:** `--preview` reported `Would update 9 extensions` and listed `@craigsmitham/packs/effect-v4` as an update with `updated: .axm/extensions/@craigsmitham/knowledge/effect-v4`, with no resolved version numbers and no mention of a range ceiling. It did emit three `minimumReleaseAge` bypass lines naming exact versions (`knowledge/effect-v4 0.1.1`, `packs/effect-v4 0.2.2`, `skills/craft-effect-v4 0.0.3`), so version-level detail is available in that output path but not for range-capped selections. Registry latest was `knowledge/effect-v4 0.2.0` and `packs/effect-v4 0.3.0`.
**Impact:** Cause was not visible from `update` output. Required 8 additional commands to establish: `axm view` on the knowledge bundle and the pack, reading the installed `pack.json`, reading `.axm/settings.json`, a `semver` check in `packages/core`, and a scratch-workspace copy with a relaxed pin to confirm the ceiling. Elapsed time not measured.
**Recovery:** Reading `.axm/settings.json` revealed pin `"effect-v4": "@craigsmitham/packs/effect-v4@^0.2.0"`, and installed `pack.json` 0.2.2 declares `"@craigsmitham/knowledge/effect-v4": "^0.1.1"`. Copying `.axm` to a scratch workspace with the pin relaxed to `^0.3.0` and re-running `--preview` selected knowledge 0.2.0 / pack 0.3.0 / skill 0.0.4, confirming the chain. Diagnosis completed; no fix applied to the workspace.
**Detected by:** Comparing `axm view ... --json` latest versions against the `resolvedVersion` values in the `.axm/axm-lock.yaml` working-tree diff.
**Observed factors:** Pin is on the pack, not on the transitively-managed knowledge bundle the user named. Two range hops separate the request from the constraint. `minimumReleaseAgeExclude` had `@craigsmitham/*` added in the uncommitted working tree, so release age was not the limiter. `axm view @craigsmitham/packs/effect-v4@0.3.0` failed with `not_found` and the suggestion "Check the name, pass --type, or use a fully-qualified name", so a specific version's dependency ranges could not be inspected directly.
**Hypothesis:** `update` reports per-extension actions and release-age bypasses, but does not diagnose the case where the newest published version is excluded by a declared range, so a satisfied-but-not-latest resolution is indistinguishable from an up-to-date one.
**Suggests:** Have `update`/`--preview` note when a newer published version was skipped because of a range, naming the version, the range, and the manifest or settings key that declared it.

Evidence:

- `.axm/settings.json` (uncommitted): `"effect-v4": "@craigsmitham/packs/effect-v4@^0.2.0"`
- `.axm/extensions/@craigsmitham/packs/effect-v4/pack.json` v0.2.2: `"@craigsmitham/knowledge/effect-v4": "^0.1.1"`
- `axm view @craigsmitham/knowledge/effect-v4 --json` → latest `0.2.0`; versions `0.2.0`, `0.1.1`, `0.1.0`
- `axm view @craigsmitham/packs/effect-v4 --json` → latest `0.3.0`; `0.2.2` also present
- `semver.maxSatisfying(["0.2.0","0.2.1","0.2.2","0.3.0"], "^0.2.0")` → `0.2.2`; `semver.maxSatisfying(["0.1.0","0.1.1","0.2.0"], "^0.1.1")` → `0.1.1`
- Scratch workspace with pin `^0.3.0`: `--preview` selected knowledge `0.2.0`, pack `0.3.0`, skill `0.0.4`
