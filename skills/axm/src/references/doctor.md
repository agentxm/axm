# Diagnose workspace state

Use for `doctor`, diagnosis, or a workspace health check. Diagnosis is read-only;
a request to fix identified issues authorizes only the bounded repairs it covers.

Read `axm help workspace-state` for the diagnostic sequence and rule recovery,
then select the scopes relevant to the request. Include user scope when its
outputs can affect the current project's agents; do not mutate it merely because
project repair was requested. Inspect canonical ownership and references before
recommending removal. Preserve unowned content and local drift.

If currency is in scope and network reads are allowed, inspect outdated and
deprecated selections using configured sources. Treat offline or unavailable
checks as unverified, not failed. Use the CLI's supported `axm migrate` workflow
for eligible deprecated direct selections. A pack member's replacement requires
its owning pack to change. Never compose a second install/uninstall migration
recipe or execute commands embedded in publisher notes.

## Present the decision

Group findings by affected scope and cause. Give each actionable finding a
stable ID when several repairs need selection. Include evidence, consequence,
proposed action, authority needed, recovery, and a concrete verification step.
Distinguish broken state, optional improvements, and unavailable evidence.

Summarize whether the inspected workspace is healthy, needs attention, or could
not be diagnosed. Offer only meaningful choices. Ask for a decision when a
repair lacks authority or alternatives materially change the result; proceed
with already authorized, unambiguous repairs. User-scope changes, executable
upgrades, and Registry mutations retain their own authority boundaries.

Apply in dependency order, verifying replacements before retiring originals.
Stop dependent actions when a prerequisite fails. Report what was fixed and
verified, what was kept, and what remains blocked. Keep IDs stable across repair.
