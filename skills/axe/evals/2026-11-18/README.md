# Skill discovery and execution trials

The [decision-review trials](review-decisions.md) compare the three review lenses on a skill and a hook and exercise **Apply selected**.

The [open and focused review trials](review-scope.md) compare scope selection on the same target, including a corrected release and an excerpt.

The [pack-member README trials](review-member-readmes.md) compare open reviews
from the pack, skill, and knowledge package entry points.

The [review follow-up trials](review-follow-up.md) cover finding selection,
prompt replies, and the resulting edits. The discovery trials below ask
whether an ordinary authoring request reaches the applicable
guidance and whether the resulting answer uses it. The [observations](observations.json)
retain each final answer, concept lookups, command count, and input router hash.
Local filesystem paths in answers are shown relative to the fixture.

Each row represents a fresh read-only Codex CLI 0.170.0 session using
`gpt-6.2-astra` at low reasoning effort and AXM 0.53.0. Each fixture was a
separate Git workspace with the same engineering pack available through AXM
and its skill visible to Codex. The runs used the same host, auth environment,
and command permissions. Skill selection is evidenced by an observed read of
the installed skill. A named concept lookup is observable independently of
other reads in the same shell command.

## Draft a version-specific README

The synthetic brief identifies Beacon as a read-only skill for suggesting the
next owner of a stalled support ticket from a supplied handoff note. It gives
the install command `axm install @example/skills/beacon`, selects Beacon
catalog convention v2, and says the skill takes no external actions.

The ordinary prompt was “Draft the package README for Beacon from its product
brief. Return the Markdown as your answer, ready to ship.” The existing router
and README guide came from `d45fce56cbe94626cee5f376bcacbaea85bd0307`. In
each isolated copy the guide had one synthetic paragraph saying that v2 uses
“Try it locally” immediately above the first-use example and v1 used “Quick
start”. Only the guide disclosed that distinction.

| Variant        | Change to the input                                                                                        | Observed result                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Router         | The project instructions pointed only to the brief.                                                        | Read the skill and retrieved the README guide.                                                    |
| Scoped pointer | The project instructions also named the installed README concept as the source for the catalog convention. | Read the skill and retrieved the same guide.                                                      |
| Supplied guide | The prompt included the guide body.                                                                        | Read the skill and retrieved the guide again, even though the answer was available in the prompt. |

All three drafts gave the install command, used the v2 cue above a worked
example, and described a read-only suggestion. All three accessed the router.
This case gives no reason to add an always-loaded README pointer to the pack.

## Review a migration-guide reference

The prompt was “Review the supplied release-note skill material. Can a consumer
follow its migration-guide reference when drafting a breaking-change note?
Return a short finding and its evidence.” For explicit invocation, the prompt
was prefixed with “Use $agent-extension-engineering.” Each workspace identified
the supplied archive or excerpt in its project instructions.

| Fixture | Evidence supplied                                                                                          | Expected conclusion                                             |
| ------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Missing | A ZIP with a skill linking to `references/migration.md` and a guide shipped as `references/migrations.md`. | Identify the mismatch and the blocked breaking-change workflow. |
| Present | A ZIP with the same link and the guide at that exact path.                                                 | Confirm the guide resolves in the archive.                      |
| Excerpt | Only the sentence containing the same link.                                                                | Leave availability in the published package unresolved.         |

In both invocation conditions all three conclusions matched the evidence.
The explicit excerpt response led with the locally missing file and qualified
package availability later. Every run opened the review guide and the
progressive-disclosure pattern. Archive contents alone settled the path
question after the review guide established which evidence to inspect.

The review row in the router originally directed the reader on to a relevant
guide or pattern. The revised row names the review guide alone, with a stopping
condition when that guide and the artifact settle the claim. The three
rechecks use the ordinary prompt and the same fixture contents in fresh
sessions. Each recheck retrieved only the review guide and reached the expected
conclusion. The ordinary runs went from two concept lookups per case to one.

## Limits

The package, version convention, and archive cases are synthetic. The archive
cases resemble a published worked example. The README trial exercised the
existing router and the review trial exercised the working candidate. These
are single observations per condition on one host. Command counts describe
the recorded trajectories and include commands that combine multiple reads.
They cannot establish a typical cost, activation rate, or cross-host result.

## Choose the review target

A short-name review in a workspace with three packages named `docs` originally
listed their identities and asked for one type. The reader wanted a selectable
scope that could include all three. The [scope selector](../../../../knowledge/agent-extension-engineering/src/patterns/scope-selector.md)
now illustrates that decision.

Five fresh read-only Codex CLI 0.170.0 app-server sessions used AXM 0.53.0 and
a disposable workspace containing the candidate skills, engineering knowledge,
and a synthetic skill, knowledge bundle, and pack named `docs`. Each package
README contained a distinct release inventory code. The review prompt was
“$axe review docs. We are preparing the docs release. Focus only on whether
the package README states its release inventory code. Quote the code for each
target you actually review.” The client stated whether it supported a picker
or text replies.

| Request                                                     | Observed choice and result                                                                                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release review, native picker                               | The structured control offered all three first with a recommendation, followed by each qualified identity. Submitting its first option produced the codes from all three READMEs. |
| Same review, text only                                      | The first lettered option was **All 3 matches (Recommended)**. Replying `all` produced the same three codes.                                                                      |
| Same review, qualified as “the docs skill”                  | Axe opened the skill README directly and reported its code without a scope question.                                                                                              |
| AXM inspection of `docs` to investigate invocation behavior | The text menu recommended the skill first and offered all three as another choice.                                                                                                |
| AXM planning for a single package to own a file             | The native control offered only the three individual owners, each with its qualified identity.                                                                                    |

In the final release-review trials, both clients put **All 3 matches
(Recommended)** first, followed by knowledge, pack, and skill in that order.
The native trial captured the control and submitted its displayed label at
the app-server protocol boundary. Visual rendering was outside the trial.

## Advice and action on the same target

Two fresh Codex CLI 0.170.0 sessions used the axe skill and engineering
knowledge from `028fe83b8`, AXM 0.53.0, low reasoning effort, and identical
writable Git workspaces. Each workspace had a `./sample/SKILL.md` linking
to `references/river.md` and `references/lakes.md`. The supplied field notes
were `rivers.md` (flow direction) and `lakes.md` (shoreline type).

| Prompt                                                                            | Observed result                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `$axe How would you revise ./sample so readers can follow both field-note links?` | Proposed changing the river destination to `references/rivers.md` and identified the working lake link. The trace contained only reads. The workspace matched its initial Git state. |
| `$axe Revise ./sample so readers can follow both field-note links.`               | Changed only the river destination. The session opened both linked files after editing and reported the instruction from each. The Git diff contained that one substitution.         |

Both runs explicitly invoked axe. These observations cover one run per prompt
on one host. They exercise interpretation and file effects after selection.

## Discover a set-design question while authoring

Two fresh, read-only Codex CLI 0.170.0 sessions received the same brief:

> $axe design a reviewer for submitted field notes. On request, list the observations that need a coordinate correction. Use the extensions in this workspace where useful. Return a design I can act on.

Both workspaces contained the project Axe skill and engineering knowledge.
One also had an `intake-review` skill that already reported missing latitude
or longitude by observation ID. The other had an empty `skills/` directory.

| Workspace | Concepts opened and design returned |
| --- | --- |
| Existing reviewer | Read the existing skill, then the boundary guide and the set guide. Kept the advisory coordinate policy and its report in `intake-review`. |
| Empty directory | Read the boundary and skill-authoring guides. Proposed one on-request skill. The command trace showed no read of the set guide. |

With the shorter review instructions alone, both designs chose an appropriate
owner, but both sessions opened the set guide. Narrowing the route-table
labels produced the same extra lookup. The final router asks the agent to
identify a relationship before opening the set guide. Each variant used one
session per case. These traces show the paths taken on this host.

Two more sessions replayed the [pack-member review cases](review-member-readmes.md)
with the same final router and the original three release archives. The open
review credited the pack README, reported both missing member READMEs with
archive evidence, and ended with numbered findings and selectable actions.
The dependency-only review traced both declared dependencies through the
shipped readiness-checklist route and returned a clean verdict within scope.
It also opened the set guide. These runs exercised text reports through
explicit invocation. They did not exercise picker interaction or repair.
