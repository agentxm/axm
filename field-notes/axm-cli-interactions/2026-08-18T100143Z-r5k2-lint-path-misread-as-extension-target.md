---
id: 2026-08-18T100143Z-r5k2
subject: axm-cli-interactions
key: lint-path-misread-as-extension-target
observed_at: "2026-08-18T10:01:43Z"
session: unknown
kind: gap
status: open
---

**Expected:** Passing an extension directory to `axm lint --strict` would validate that extension while checking the bundled AXM skill.
**Observed:** AXM treated the positional path as a workspace root and failed because that extension directory has no nested `.axm/settings.json`.
**Impact:** One validation command produced unusable output and required consulting `axm help lint` before retrying at workspace scope.
**Recovery:** Run strict lint from the repository workspace root; task completion remained in progress when captured.
**Detected by:** The command reported `Workspace settings not found` under the supplied extension directory.
**Observed factors:** The lint help defines its optional positional argument as a workspace directory; no extension-target option is documented.
**Hypothesis:** The command surface makes workspace validation clear in help, but does not offer a package-scoped validation affordance.

Evidence: `./scripts/axm-local lint --strict .axm/extensions/@agentxm/skills/axm` resolved the extension directory as the workspace and exited 10; `./scripts/axm-local help lint` documented `[<path>]` as a workspace directory.
