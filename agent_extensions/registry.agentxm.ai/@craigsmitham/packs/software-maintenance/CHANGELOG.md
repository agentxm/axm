# Changelog

## 0.2.1

Clarifies migration after verifying installation and upgrade behavior with
AXM 0.51.0. The seven members and their versions are unchanged. A normal update
selects the new membership but can retain former members' native links as
unmanaged entries. The migration below removes the old pack while AXM still
owns those entries, then installs the new pack.

## 0.2.0

Reorganizes the pack around continuing maintenance: prioritization, dependable
behavior and feedback, support lifecycles, removal, simplification, independent
change, and selected quality improvements.

- Adds `assess`, `stabilize`, `refresh`, and `simplify` at 0.1.0.
- Retains `prune`, `modularize`, and `improve`, requiring their strengthened
  0.2.0 contracts.
- Removes `align`, `reconcile`, `reuse`, and `generalize` from pack membership.
  Those packages remain available independently; their 0.1.1 releases update
  companion documentation, recommendations, and opportunity-question handling
  without changing their purpose.
- Adds conditional sequencing, recurring-maintenance guidance, and examples
  distinguishing opportunity questions from implementation requests.
- Preserves standalone installation and explicit-only invocation for every member.

### Retaining former members

Decide which former members you still use. Before replacing the pack, install
each of those skills directly. For example, to keep `align`, run:

```bash
axm install @craigsmitham/skills/align
```

Use the same command with `reconcile`, `reuse`, or `generalize` for any
others you want to keep. If you need none of them, skip this step. For a
clean migration from 0.1.0, first preview removal:

```bash
axm uninstall @craigsmitham/packs/software-maintenance --preview
```

Compare the proposed removals with your selection. If the preview would
remove a former member you meant to keep independently, declare it directly
and repeat the preview. Preserve any local modifications before proceeding.
When the preview matches your intent,
replace the pack and inspect the result:

```bash
axm uninstall @craigsmitham/packs/software-maintenance
axm install @craigsmitham/packs/software-maintenance
axm list
```

Look for the seven members of the new pack and any companions you selected
directly. Former members that were only supplied by the old pack should be
gone. This sequence was exercised with AXM 0.51.0 and 0.53.1.

If you already used `axm update`, inspect `axm list` for unmanaged former
members. With AXM 0.51.0, successful lint and sync checks do not establish that
those entries were removed. Preserve local changes and confirm ownership before
removing any remaining native entries; do not assume that uninstalling the
updated pack will clean up entries it no longer owns.

## 0.1.0

Initial seven-member pack: `align`, `reconcile`, `modularize`, `generalize`,
`reuse`, `prune`, and `improve`.
