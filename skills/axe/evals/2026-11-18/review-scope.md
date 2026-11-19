# Can an open review find the consequential question?

The baseline Axe reviewer found a broken consumer example and an unwanted
maintainer file when given the open request `$axe review ./sample`. It also
recognized the intentional fixture once the package was corrected. These
observations support keeping file selection in the publishing and review
guides. They give no reason to require an archive inspection on every review.

## Reproduce a case

The [fixture data](review-scope-fixtures.json) contains the authored files and
evidence available to the reviewer. The skill cases include exact synthetic
candidate ZIPs, built from the listed entries. The pack has two published
member indexes. The remaining snapshots supply only the material described
in each case. Keep the answer key and this report outside the trial workspace.

From the checkout root, prepare a new workspace for each request. For example:

```sh
trial=$(mktemp -d)/workspace
python3 skills/axe/evals/2026-11-18/prepare-review-scope.py defect "$trial"
mkdir -p "$trial/.agents/skills" "$trial/knowledge"
cp -R skills/axe/src "$trial/.agents/skills/axe"
cp -R knowledge/agent-extension-engineering "$trial/knowledge/"
echo '{"owner":"@agentxm","agents":["codex"],"knowledge":{"agent-extension-engineering":"workspace"}}' > "$trial/axm.json"
git -C "$trial" init -q
codex exec --ignore-user-config --ephemeral -s read-only -C "$trial" \
  -m gpt-6.2-astra -c 'model_reasoning_effort="low"' '$axe review ./sample'
```

Use the same open request on each case. For the focused skill and pack runs,
append `. Focus only on README wording.` For the focused hook run, append
`. Review only the clarity of the README title.` Assess the consequence,
evidence, and proposed remedy within the requested scope. Any inspection
path that supports the conclusion is admissible.

## Cases and observed outcomes

| Case                          | What the final reviewer established                                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skill candidate (`defect`)    | Two findings. The skill requires a zone table present in the checkout and missing from the ZIP. The ZIP contains a handoff expressly limited to maintainers. The sample label serves the README example. |
| Same skill, wording only      | Suggested a checkable expected result and disclosed the missing lookup table in the proposed copy. Its recommendation concerned the README. It did not open a separate finding on the handoff.           |
| Corrected skill (`corrected`) | Clean within the archive review. The sample, instructions, and table resolve to the east zone. The handoff stays outside the archive.                                                                    |
| Excerpt only (`excerpt`)      | Inconclusive. Identified the exact entry a candidate inventory would need to show.                                                                                                                       |
| Pack (`pack`)                 | All supplied paths exist. The allowed 1.0.0 knowledge release lacks the classifier's required concept. The 2.0.0 index contains it. The supplied indexes alone cannot establish the geographic result.   |
| Same pack, wording only       | Qualified the README example using the supplied release records. Kept the recommendation on the wording.                                                                                                 |
| Hook (`hook`)                 | Found both the extra ticket body sent to the service and the duplicate notification possible after redelivery. Used the implementation and host contract.                                                |
| Same hook, title only         | Suggested naming the event in the title. Both behavioral concerns stayed outside the report.                                                                                                             |
| Rule (`scope`)                | Located loading in the neighboring payroll scope against the invoices-only promise. The supplied host observations establish loading.                                                                    |
| Replacement (`upgrade`)       | Found both writers active on the direct-install upgrade. Recognized that which writer would be selected remains open.                                                                                    |

The hook, rule, and upgrade snapshots exercise other review questions without
adding those subjects to the open prompt or a standing checklist. Future
comparisons should include fresh material that does not appear in published
examples.

## Comparison and limits

The [observations](review-scope-observations.json) retain the final answers,
guide digests, whether command output exposed the guide body, and shell-command
counts. Paths in answers are relative to each fixture. Runs used Codex CLI
0.170.0, AXM 0.53.0, and separate read-only sessions. The baseline used the guide
at `ff0f7380d`. The Axe routing skill stayed fixed throughout.

The baseline and final guide both found the two archive issues and the pack
version mismatch. Both closed the corrected case, bounded the excerpt verdict,
and kept the hook title review on the title. Both sometimes consulted release
evidence in a wording review and proposed qualifying the README's promise.
That evidence bears on the accuracy of the words. Documenting a broken release
can still be a poorer remedy than repairing the release itself.

An intermediate guide added a standing instruction distinguishing confusing
wording from a clear promise broken by the implementation. With that wording,
the reviewer kept the skill response entirely editorial but still qualified
the pack's promise. The extra instruction showed no consistent advantage on
the two cases and was removed. The final guide gives examples of how a concern
can arise and leaves the choice to the reviewer.

These are single synthetic observations per prompt and variant on one model
and host. The host records, release indexes, and candidate ZIPs are fixture
inputs. The trials assess the reviewer's judgments about them. No hook ran,
no package was published, and no live-host activation or selection was measured.
