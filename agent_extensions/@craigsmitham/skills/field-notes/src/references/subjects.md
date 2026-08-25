# Subjects: declare, graduate, retire

Read
`.axm/extensions/@craigsmitham/knowledge/field-notes/src/subject-explainer.md`
first.

## Table format

Lives in the workspace instruction file, outside any `axm:` managed region:

```markdown
## Field note subjects

| Subject        | Mode   | Scope                                          | Target condition                                                           | Retire when                      |
| -------------- | ------ | ---------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------- |
| cli-onboarding | target | any session running `mytool`                   | a first-time user completes `mytool init` without opening docs or retrying | 10 sessions, no new blocked note |
| ci-duration    | survey | any session editing CI config or waiting on CI | —                                                                          | a target condition can be stated |
```

Rules for the table:

- `Subject` is a kebab slug. It is also the notes directory name — keep it short
  and stable, because renaming orphans existing notes.
- `Scope` must be checkable in the moment, without judgment. "any session
  running `mytool`" works; "anything CLI-related" does not.
- `Target condition` is `—` in `survey` mode. A survey subject that has one is
  mislabelled — it belongs in `target` mode.
- `Retire when` is never blank.

Regenerate the whole table rather than editing rows in place; that is what keeps
the format from drifting over time.

## Declare

1. Name the area in the user's words. Do not rename it into jargon.
2. Choose the mode by asking one question: _can you state the outcome you want,
   specifically enough that a note could say it was blocked?_ Yes → `target`.
   No → `survey`. Do not talk the user into `target`.
3. Write the scope as an observable trigger.
4. Write the retirement condition now, not later.
5. Show the proposed row and confirm before writing.

Two or three active subjects is the working range. At five, notes stop being
read. If the user wants a fourth, ask which existing subject retires.

### Target conditions

Describe the **process operating as desired**, not work getting done.

| Not usable               | Usable                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| The CLI should be easier | A first-time user completes `init` without opening docs or retrying      |
| Speed up CI              | A pull-request check reports in under 5 minutes at p90                   |
| Fix the docs             | A new contributor makes a first commit without asking a question in chat |

Test: could a note plausibly say "this was blocked"? If not, it is a wish.

## Graduate

`survey` → `target`. Run this whenever a survey subject has accumulated notes.

1. Read every open note for the subject.
2. Cluster by recurring observed behavior and conditions; do not let a
   reporter's hypothesis establish cause.
3. Ask whether the dominant cluster can be restated as a condition the process
   would satisfy if that behavior disappeared. If yes, that is the target
   condition. If no, the subject stays in `survey` mode.
4. Propose: new mode, target condition, narrowed scope, retirement condition.
5. On confirm, update the row. Leave existing notes in place — they are the
   evidence for the target condition, and deleting them destroys the record of
   why it was chosen.

If a subject has accumulated many notes across several reviews and still shows
no cluster, say so and recommend retiring or splitting it. A survey subject that
never resolves is a standing cost with no return.

## Retire

Retire when the stated condition is met, or when the area stops being worth
attention.

1. Confirm the retirement condition actually holds — for a subject in `target`
   mode, check that no `blocked` notes appeared in the stated window.
2. Remove the row from the table.
3. Leave `field-notes/<subject>/` and any findings in place.
4. Note the retirement and its reason in the summary.

Retiring stops collection. It does not mean the problem is solved, and it does
not close open findings.
