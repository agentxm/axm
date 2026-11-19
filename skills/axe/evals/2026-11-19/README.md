# Does the question select the right subject?

Fieldwork contains two authored skills, one disabled, and a release pack. The
project also declares an external ledger hook. The same case supplies release
archives, two consumer observations, and a synthetic Codex event receipt. The
engineering tools live outside Fieldwork's inventory.

Each row ran twice in fresh read-only Codex CLI 0.170.0 sessions, once with
the ordinary request shown and once with the same request prefixed by `$axe`.
All five ordinary sessions opened the project Axe skill. The two focused
individual reviews opened neither the workspace guide nor the set guide.

| Request                                                                                                                                              | Evidence used and conclusion in both runs                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review fieldwork/skills/note. Focus only on whether the written instructions let someone ask for a draft without appending to the ledger.            | The skill keeps a draft in chat and requires an explicit append request. The verdict addressed the written instructions.                                                   |
| Review everything we author as extensions in Fieldwork. Where would we have to edit in more than one place if the correction classification changed? | The authored collection includes the pack and both skills. Both skills own a copy of the rule, including disabled `legacy-note`.                                           |
| Review what installing Fieldwork’s release pack delivers to a new consumer. Can they draft the promised note with just that installation?            | The archives supply the skill. Its required policy is absent from the pack. The clean consumer's first concept lookup failed.                                              |
| Review the extensions involved when Codex appended two entries for N18 in Fieldwork. Which ones wrote them?                                          | Event E17 records the authored skill writing L84 and the vendor hook writing L85.                                                                                          |
| Review Fieldwork’s AXM setup for new contributors. Can they carry out the documented first task in their host the way the maintainer can?            | Both consulted the workspace guide, identified Codex and the first draft, and compared the maintainer's separate policy declaration with the failed clean-consumer lookup. |

The initial workspace reviews also reported issues on the later append path.
Bounding the workflow to the contributor's first draft improved the ordinary
review. The named review still raised the append as a separate finding. The
set-guide link now applies when the user's own request produces a duplicate.
Both final workspace rechecks identified the missing dependency and left
live draft behavior open. Neither attributed the later writes to the draft.
The ordinary review also suggested improving the skill README for direct
installers, an entry point outside the contributor's documented pack path.

## Nearby requests

A request naming just the two note skills returned one shared policy owner
and two consumers. With the event receipt withheld, a request to attribute
the N18 entries identified possible writers and left actual attribution open.
A workspace _design_ request produced a project-scoped pack proposal and a
first-use check for a contributor in Codex.

## Reproduce

From the checkout root, prepare a fresh directory for each request. Keep this
report outside the trial workspace.

```sh
trial=$(mktemp -d)/case
python3 skills/axe/evals/2026-11-19/prepare-subjects.py "$trial"
codex exec --ignore-user-config --ephemeral -s read-only -C "$trial" \
  'Review everything we author as extensions in Fieldwork. Where would we have to edit in more than one place if the correction classification changed?'
```

The fixture assembles the consumer workspaces from local ZIPs and records
actual offline AXM lookups. The maintainer lookup succeeded and the clean
consumer returned exit 3. The host receipt is supplied evidence for the
attribution exercise. The trial used one host and exercised neither a live
hook nor installation from a Registry.

## Workspace setup, management policy, and application

Three ordinary requests ran in fresh Codex CLI 0.170.0 sessions with AXM
0.53.0 and the project copies of Axe and AXM available. The first two
sessions had read-only access. The third used a writable disposable checkout.

| Request                                                         | Observed route and result                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Can a new contributor use our release workflow in Fieldwork?    | Opened the setup guide and traced the missing release-policy dependency to the failed clean-consumer lookup. The answer also covered the later explicit append in the supplied evidence.                                                                                                                           |
| How should we keep shared rules current across branch switches? | Opened the management guide and Git-hook help. Identified the stale instruction using a preview, recommended an advisory check, explained when automatic writes would be appropriate, and kept upstream upgrades separate. Proposed drafting a note in fresh sessions on both branches. The checkout stayed clean. |
| Apply this branch’s configuration to this checkout.             | Opened the AXM skill and ran project sync. Only the managed instructions and projection record changed. A second preview found the workspace current.                                                                                                                                                              |

The first request used the Fieldwork fixture above. For the branch cases,
the baseline rule required a release date. Sync had materialized that rule.
A second branch added rollback instructions to the authored rule while its
managed output still contained only the baseline requirement. The policy and
apply sessions started in separate copies of this state.

An initial apply trial stopped when the host sandbox denied AXM access to its
transaction lock. The successful trial granted write access to AXM's physical
boundary lock directory alongside the disposable checkout. After sync, a
fresh read-only session was asked to draft a release note for a sorting fix,
given its release date and the availability of the prior version. The draft
included the date and an instruction to reinstall the prior version.
