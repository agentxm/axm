---
id: 2026-08-26T001944Z-h5q2
subject: ci-cd-workflows
key: release-skill-verification-uses-pre-source-path
observed_at: "2026-08-26T00:19:44Z"
session: unknown
kind: gap
status: open
---

**Expected:** Release run `32914256046` should verify the freshly published
`@agentxm/skills/axm@0.28.0` at its canonical source-qualified install path.
**Observed:** The setup command installed the skill at
`agent_extensions/agentxm/@agentxm/skills/axm`, but the verification step
grepped the removed path `agent_extensions/@agentxm/skills/axm/src/SKILL.md`
on all five attempts.
**Impact:** The release artifacts, npm packages, Homebrew formula, and Registry
skill published successfully, but the tag workflow concluded `failure` and
required a patch release workflow correction.
**Recovery:** In progress; update the CI and publish-workflow path assertions to
the source-qualified canonical path, then issue a patch release without
rewriting the published `cli-v0.28.0` tag.
**Detected by:** Inspecting the complete failed-job log after the release
workflow concluded `failure`.
**Observed factors:** The setup output named the new canonical path and
`skills show axm --json` ran successfully before the stale filesystem check.
**Diagnostic evidence:** Workflow `32914256046`; job `98014979534`; expected
version `0.28.0`; five attempts; final process exit code `1`; failing step
`Verify clean-workspace skill resolution`.
**Hypothesis:** The source-qualified vendoring change updated installation but
missed two literal path assertions in GitHub workflows; tentative.
**Suggests:** Keep release verification paths derived from the install result or
from one shared canonical-path contract.

Evidence: The same failed log records both
`Skill: @agentxm/skills/axm -> agent_extensions/agentxm/@agentxm/skills/axm`
and `grep: agent_extensions/@agentxm/skills/axm/src/SKILL.md: No such file or
directory`.
