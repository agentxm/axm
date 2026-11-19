# Can a reader start at any member of a pack?

An open review traced a working pack workflow and missed two absent member
READMEs. A fresh baseline review repeated the omission. With the per-package
check, the reviewer identified both affected members and credited the pack.

## Trial setup

Fresh read-only Codex CLI 0.170.0 sessions used the default
`gpt-6.2-sol` model at low reasoning effort and AXM 0.53.0. Each disposable
Git workspace contained the project axe skill, its authored engineering
knowledge, and the same three public source packages extracted from their
Registry archives. The ZIPs were available alongside the sources. Project
instructions recorded the user's prior selection of all three identities.
The reviewer saw the prompt `$axe review docs` and had no access to the
drafting conversation through its session history.

Use `@craigsmitham/packs/docs@0.9.0`, `@craigsmitham/skills/docs@0.6.0`,
and `@craigsmitham/knowledge/docs@0.15.0` to reproduce the release case.
The baseline router and guidance came from `73d56d029`. For the second
case, give both members a root README and include them in corresponding
candidate ZIPs. The knowledge README gives the pack command and a concept
lookup. The skill README tells readers to install the skill alone. Both
member manifests retain `standalone: false`. Keep this assessment outside
the reviewer's workspace.

| Case                                                                     | Baseline                                                                                                                  | Revised guidance                                                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Three released packages, open review                                     | Found a missing single-document review route and suggested a pack first-use example. Omitted both missing member READMEs. | Confirmed the pack README, located both absent member READMEs in the checkout and ZIPs, and suggested a pack first-use example.          |
| All three READMEs present, unsupported install route in the skill README | Located the skill's standalone install instruction and recommended the pack.                                              | Located the same instruction, identified the missing knowledge companion, and retained the skill-specific example in its recommendation. |
| Released packages, dependency-only review                                | Outside the paired comparison.                                                                                            | Confirmed both dependencies and the readiness concept in the supplied archives. Kept README findings outside the requested scope.        |

The focused prompt added “Focus only on whether the published pack includes
both dependencies needed for a readiness checklist.” These runs establish a
change in detection on the missing-file case. The baseline already detected
the misleading command. Each result reflects one session per condition.

A final direct-discovery review used candidate ZIPs built from the repaired
pack, skill, and knowledge sources. The reviewer confirmed the pack install
route and the first-use example from all three entry points and closed the
review with no README findings. It checked the supplied contents. First
installation in a running host was outside that result.
