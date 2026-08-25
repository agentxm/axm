# Field notes

Observe how work **actually** goes, and turn what recurs into durable
improvement.

Instruction files describe work-as-imagined. What happens in a real session is
work-as-done, and the gap between them is where the useful information lives —
produced constantly, discarded immediately. This pack captures a little of it,
cheaply, while the work is still happening.

You declare two or three **subjects** worth watching. During ordinary work, an
agent that hits a gap in one of them appends a small **field note** and keeps
going. Later, a review clusters observed patterns, tests causal confidence, and
promotes what recurs into a **finding** with an evidence-backed priority basis,
a proposed change, and a way to verify it worked.

Nothing is captured until you declare a subject. With no subjects, the rule is
inert.

## Included extensions

Members are **not standalone** (`standalone: false`): install this pack rather
than treating the leaves as complete units on their own.

| Extension | Role |
| --- | --- |
| `@craigsmitham/rules/field-notes` | Always-on capture: when to record, the record format, and when to stop and ask instead |
| `@craigsmitham/skills/field-notes` | Declare, graduate, and retire subjects; triage notes into findings and close them |
| `@craigsmitham/knowledge/field-notes` | The concepts: the observed gap, subject modes, recurrence thresholds, verified closure |

## Install

```bash
axm packs install @craigsmitham/packs/field-notes
```

## Set up

Ask for a subject in your own words — *"start watching our CLI onboarding"* —
and the `field-notes` skill will add a table like this to your instruction file:

```markdown
## Field note subjects

| Subject | Mode | Scope | Target condition | Retire when |
| --- | --- | --- | --- | --- |
| cli-onboarding | target | any session running `mytool` | a first-time user completes `mytool init` without opening docs or retrying | 10 sessions, no new blocked note |
| ci-duration | survey | any session editing CI config or waiting on CI | — | a target condition can be stated |
```

Two modes, because you do not always know what is wrong yet:

- **`survey`** — the area feels expensive but you cannot say why. Capture
  broadly. Its output is not a fix; it is a target condition you could not have
  written at the start.
- **`target`** — you can state the outcome you want. Capture narrowly against
  it, and retire the subject when it holds.

Then work normally. Ask for a review when notes have accumulated:
*"what have the field notes been picking up?"*

## What gets recorded

Specific incidents with observable detail, not impressions. Each occurrence has
a unique ID and opaque session identity, so repeats can be counted without
confusing a pattern key for an event. A note records what was expected and
observed, direct impact and cost, how the issue was detected, what restored
progress, and relevant conditions seen during the incident.

Observed factors remain separate from the reporter's tentative causal
hypothesis and optional improvement idea. Unknown values stay unknown rather
than triggering an inline investigation or becoming a confident-sounding
guess. Existing date-key notes remain valid during triage.

Successes count. An undocumented workaround that *worked* is knowledge the
project depends on and has not written down — those notes are often the most
valuable in the set.

## Design notes

- **Capture never derails the work.** Notes are appended and abandoned. The only
  interruptions are a live correctness, data-loss, or security problem, or
  genuine ambiguity about architecture, data model, or destructive scope.
- **Recurrence is the threshold.** Nothing is promoted below two notes from
  separate sessions. One incident may be a bad session; a pattern is a signal.
  This is also what makes cheap capture affordable.
- **Reports are signals, not rates.** Triage reports recurrence against observed
  sessions or opportunities when available and says `exposure unknown` when no
  defensible denominator exists.
- **Priority preserves its evidence.** Actual impact, recurrence, extent,
  urgency, potential consequence, detectability, recoverability, confidence,
  and change cost remain separate instead of becoming a severity score. A
  costly singleton is surfaced separately but remains a note rather than a
  recurring finding.
- **Cause is earned.** Triage clusters observed behavior, treats reporter
  explanations as hypotheses, checks readily available corroboration, and may
  promote a pattern with `cause: unknown` and an `investigate` action.
- **Closure means verified, not shipped.** A finding closes when its class of
  note stops appearing and named adverse effects have been checked — not when a
  change lands. Accepted findings carry one owner, an action type, and a
  verification window.
- **Subjects retire.** Every subject states its end condition when created.

## Prior art

The practice borrows deliberately from disciplines that solved this before
software: critical incident technique (Flanagan, 1954), after-action review
(US Army FM 7-0), work-as-imagined vs work-as-done (Hollnagel), obstacle parking
lots (Toyota Kata), and closed-loop failure reporting (FRACAS). Sources are cited
in the knowledge bundle.

## License

CC-BY-SA-4.0. Attribute as: "field-notes pack, © Craig Smitham, CC-BY-SA-4.0"
with a link to https://github.com/craigsmitham/agent-extensions.
