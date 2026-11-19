# Skill discovery and execution trials

The [decision-review trials](review-decisions.md) compare the three review lenses on a skill and a hook and exercise **Apply selected**.

The [open and focused review trials](review-scope.md) compare scope selection on the same target, including a corrected release and an excerpt.

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
