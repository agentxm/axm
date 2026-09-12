# Doctor report

Emit as plain text in one message. The terminal shows the end first, so detail
comes first and the verdict and choice come last. Keep sections in this order,
omit empty ones, and never renumber IDs.

- Finding IDs are `D1`, `D2`, … in section order; option IDs append a letter
  (`D1a`, `D1b`). All stay fixed through repair.
- Status is exactly one of `Healthy`, `Needs attention`, `Broken`, or
  `Could not diagnose`.
- Authority is one of `local write`, `local deletion`, `network read`,
  `registry`, `credential`, or `executable upgrade`.
- Evidence quotes the command and the exact field, rule ID, or unit.

## Findings and options

A finding with one viable fix shows `Fix` (its implicit option `a`). A finding
with several lists `Options`, marks exactly one `(recommended)`, and includes
`Keep as is` when that is viable.

- **Recoverability:** recommend a removal only when AXM owns the target or it
  is Git-tracked with no uncommitted changes; name
  `git restore --staged --worktree <path>` as recovery.
  Otherwise offer the removal but recommend keeping or adopting.
- **Outward effects:** a registry or credential option may be recommended but
  is marked `not in full cleanup: affects all consumers`.
- **Currency:** a newer CLI is fixed by `axm upgrade` (executable upgrade); an
  outdated extension by `axm update <fqn>` (local write). An incompatible AXM
  skill stays `Needs action` with lint's recovery.
- **Deprecation:** with `deprecation.replacement.status` `available`, offer
  migrate (preview and install `replacement.fqn`, verify, then preview and
  uninstall) and keep. Recommend migrate for the same owner; for a different
  owner, recommend keep and label migrate a publisher change. Without an
  available structured replacement, quote the note, recommend keep, and never
  derive a target from its text.
- **Leftover installed package** (`workspace/installed-but-not-configured`):
  fix with `axm sync` (local deletion; AXM-installed content); verify with
  `axm sync --preview --fail-on-change --json` → `no-op` and no such lint
  finding. Never `git rm` it.
- **Undeclared authored package** (`workspace/authored-package-declared`):
  offer adopt in place (`axm adopt <fqn> --preview`, then apply; local write;
  recommended), adopt then `axm <type> disable <name>` to keep a draft (local
  write), remove (`git rm -r <path>`, local deletion, applying
  recoverability), and keep.
- **Unowned artifact** (`workspace/managed-file-unowned`) or **unrecognized
  install-root entry** (`workspace/install-root-entries-recognized`): offer
  remove (`git rm -r <path>`, local deletion) and keep, applying
  recoverability. AXM never removes it.

```markdown
### Needs action

**D1 · <problem>**

- Evidence: `<command>` → <field, rule ID, or unit>
- Impact: <effect on the user's agents or workspace>
- Fix: `<exact command>` (<authority>)
- Verify: `<exact readback>`

### Recommended

**D2 · <problem>**

- Evidence: …
- Impact: …
- Options:
  - **a · <action> (recommended)** — `<command>` (<authority>; <recovery>)
  - b · <action> — `<command>` (<authority>)
  - c · Keep as is
- Verify: `<exact readback>`

### Informational

- D3 · <fact; no fix>

### Checked

- Passed: <checks>
- Skipped: <check> (<reason, such as offline request or unreachable source>)

---

**AXM doctor: <status>**
<scope> · <workspace path>
Versions: CLI <version> (<latest | newer available: version | unchecked>) · skill <compatibility> · <n> outdated · <n> deprecated
<one sentence: the most important thing>

A · Full cleanup: <option IDs with short labels, naming each removal, upgrade, and replacement>
B · Repair: <option IDs with short labels>
C · Choose: option IDs, e.g. `D1b D2a`; a bare finding ID means its recommended option
D · Custom: describe what you want
E · None

Not in full cleanup: <option IDs with reason>

Recommended: <A or B>. <why, in one sentence>
Reply A, B, C…, D…, or E; `A D2b` runs full cleanup with that override.
```

## Choice

Labels are fixed; omit an option that is empty, changes nothing, or equals a
broader one, but never reletter the rest.

- **A · Full cleanup** comes first whenever any recommended option changes
  something. It applies every recommended option except those marked not in
  full cleanup. Selecting A authorizes exactly the listed option IDs.
- **B · Repair:** the recommended options that are local writes without
  removal, replacement, or upgrade.
- **C · Choose:** exactly the named options, including any not in full cleanup.
- **`A <option IDs>`:** full cleanup with each named option replacing that
  finding's recommendation.
- **D · Custom:** free text, including “fix everything”, becomes a bounded plan
  naming option IDs and authority; render it as a review gate and apply nothing
  until approved.
- **E · None:** change nothing.
- Recommend A when present, otherwise B. With neither, omit the recommendation
  and offer C, D, and E.

When the host has a structured-question affordance, use it for the same
choice: A marked recommended first, then B and E, with its free-text option
carrying C, D, or an override. Keep the labels in option text so both paths map
identically.

Apply in dependency order: upgrade; updates, installs, and adoptions; sync;
then uninstalls and removals of authored or unowned content. When a step fails, skip steps that depend on it — never remove
an extension whose replacement did not verify — and continue independent ones.

## Variants

- **Healthy:** `Checked`, then the summary with `No action needed.` No choice.
- **Could not diagnose:** the summary only, naming the blocking prerequisite
  and its next command. No partial findings.
- **Post-repair:** replace finding sections with one line per applied or
  offered option — `D1a · fixed · verified by <readback>`,
  `D2 · not selected`, `D3a · failed: <result>`, or
  `D4a · skipped: depends on D3a` — then `Checked` and the re-run summary. A fix
  is fixed only after its readback passes. Offer the choice again only for
  remaining findings, keeping their IDs.
