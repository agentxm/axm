---
observed_at: "2026-09-24T21:45:00Z"
session: "ce1ec542-d522-42fe-bb52-c13b1604c648"
area: "work-package brief and Effect CLI built-in help behaviour"
---

# Built-in `--help` ends in success, not the parser's help failure the brief routed on

## Context

Routing built-in help through the Screen's painter. The audit heading and the
work-package brief describe `--help`, the parent-command invocation, and
usage-error help as "the same path", and the application already recognised
the parser's `ShowHelp` failure to tell usage-error help apart, so the first
implementation presented help only when the invocation ended in that failure.

## Friction

Effect CLI's `--help` global flag is an action that writes the formatted help to
the console and succeeds; only a parent command without a subcommand, a usage
error, and `axm help <path>` end in `ShowHelp`. The new specification examples
passed against the wrong output because the piped machine help document has
one description per line and no escape sequences, and the fault showed only
when the source CLI was run by hand and `axm --help` printed JSON.

## Cost / impact

One implementation and one specification example were reworked: the
presentation moved from a help-failure branch to decoding the formatter's
console document, and the specification gained a check that the output is not
the machine document. Two extra typecheck and test rounds.

## Outcome

Built-in output is now presented from the formatter's machine document
regardless of how the invocation ended, and the examples assert the human form.

## Evidence

- `effect/unstable/cli/GlobalFlag.ts`, `Help` action: formats the help
  document and logs it; no failure is raised.
- `pnpm --silent axm --help > file` after the first implementation: the file
  held the `{"type": "help", …}` document.
