# Terminal UX development

Change how the CLI looks and behaves in a terminal with the fastest loop that
can answer your question, and climb to a real terminal only when the question
needs one. [Terminal design](../../docs/architecture/commands/terminal-design.md)
owns the design rules this loop checks; the gallery test owns acceptance.

## The loop

1. **Look at the scenario.** `pnpm lab` browses the gallery: type to filter,
   `space` and `enter` to view a fixture. `pnpm lab view <fixture> --watch`
   opens one directly and repaints it whenever you save a source it loaded.
   The viewer paints at your terminal's size, so drag the pane edge to check
   responsive layout.

   | Key            | Does                                                   |
   | -------------- | ------------------------------------------------------ |
   | `←` `→`        | Step through the gallery widths narrower than the pane |
   | `↑` `↓` `PgUp` | Scroll a painting taller than the pane                 |
   | `n` `p`        | Next or previous fixture                               |
   | `a` `c`        | Toggle the ASCII glyph set and colour                  |
   | `q`            | Back to the browser; `ctrl-c` also ends `--watch`      |

2. **Drive a question.** `pnpm lab ask <question> --steps "down*2,space" --frames`
   presses keys through the question's own reducer and prints every state.
   `pnpm lab ask --help` names the sample questions.
3. **Watch it move.** `pnpm lab play <recording> --speed 0.25` replays a
   recorded operation through the real `Screen`, spinner and transcript
   included. `pnpm lab play` lists the recordings.
4. **Run the whole flow.** `pnpm lab run --size 100x30 --frames --steps "await:type to filter,down,space" -- skills install <source>`
   runs the CLI from source under a pseudo-terminal with an empty home and
   workspace, and prints the screen after each step.
5. **Use it.** `pnpm axm <arguments>` in a scratch directory. Change one thing
   at a time: a narrow and a short pane, piped output (`| cat`), `NO_COLOR=1`,
   `AXM_ASCII=1`, `--quiet`, `--verbose`, `--json`, and `ctrl-c` mid-operation.
   Timing, motion, and whether the words make sense are judged here.

Every lab command paints at the current terminal unless `--size` names one,
as `80x24` or `80`.

## Add a scenario

A scenario you iterate on is a fixture, and a fixture is also its regression
check.

1. `pnpm lab new apps/cli/src/root/<command>/view.ts` writes a `view.gallery.ts`
   beside the view. Replace its placeholder with the view painting sample
   data; the builders in `apps/cli/src/test-support/gallery/samples/builders.ts`
   make operation records in a few lines.
2. `pnpm lab view <fixture> --watch` while you shape it.
3. `pnpm lab accept <fixture>` records that fixture's snapshots, and only
   those, after its invariants pass.

## Before you hand off

- `pnpm exec nx run cli:test:screen` runs the screen, gallery, and conformance
  tests in seconds.
- `pnpm lab review` shows every changed snapshot before and after, side by
  side; `--base main` compares with another revision. Read it as the design
  diff, and explain every change it shows.
- `pnpm exec nx run cli:test` is the evidence. The lab is a review aid and
  establishes nothing.

Check each change at 40, 80, and 120 columns, in ASCII, piped, quiet and
verbose, as `--json`, in a short pane, and on its failure path, where `Next`
must name a recovery that works.
