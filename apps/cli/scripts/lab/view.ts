/**
 * The fixture viewer: one gallery fixture filling the terminal, repainted
 * whenever the terminal resizes or a key changes what it shows.
 *
 * It paints at the terminal's own width until a key asks for a narrower one,
 * and marks the right edge of a narrower painting so the width a layout had
 * to fit is visible. The keys step through the gallery widths that fit, toggle
 * the ASCII glyph set and colour, scroll a painting taller than the terminal,
 * and move to the next or previous fixture. It runs in the terminal's
 * alternate screen, so leaving it puts back whatever was there before.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as Terminal from "effect/Terminal";

import { asciiGlyphs, unicodeGlyphs } from "../../src/screen/glyphs.js";
import { OutputStreams } from "../../src/screen/streams.js";
import { padDisplay, truncateLine } from "../../src/screen/width.js";
import {
  galleryWidths,
  paintFixture,
  stressWidths,
  type GalleryFixture,
} from "../../src/test-support/gallery/fixture.js";

import { userError, type LabStyle } from "./shared.js";

const ESC = "\u001b[";
const ENTER_ALTERNATE = `${ESC}?1049h${ESC}?25l`;
const LEAVE_ALTERNATE = `${ESC}?25h${ESC}?1049l`;
const HOME = `${ESC}H`;
const CLEAR_LINE = `${ESC}2K`;
const CLEAR_BELOW = `${ESC}J`;
const CLEAR_SCREEN = `${ESC}2J`;

/** The widths a narrower painting can take, the gallery's and the stress frames'. */
const candidateWidths = [...new Set([...galleryWidths, ...stressWidths])].sort((a, b) => a - b);

interface ViewState {
  readonly index: number;
  /** A chosen width, or none to fit the terminal. */
  readonly width: Option.Option<number>;
  readonly ascii: boolean;
  readonly colors: boolean;
  readonly scroll: number;
}

type ViewEvent =
  { readonly _tag: "Key"; readonly input: Terminal.UserInput } | { readonly _tag: "Resize" };

/** The widths that fit a terminal this wide, narrowest first, ending with the terminal itself. */
const widthsFor = (columns: number): ReadonlyArray<number> => [
  ...candidateWidths.filter((width) => width < columns),
  columns,
];

const stepWidth = (state: ViewState, columns: number, step: -1 | 1): ViewState => {
  const widths = widthsFor(columns);
  const current = Option.getOrElse(state.width, () => columns);
  const at = widths.findIndex((width) => width >= current);
  const next =
    widths[Math.min(widths.length - 1, Math.max(0, (at < 0 ? widths.length - 1 : at) + step))] ??
    columns;
  return { ...state, width: next >= columns ? Option.none() : Option.some(next), scroll: 0 };
};

const dim = (text: string, colors: boolean) => (colors ? `${ESC}2m${text}${ESC}0m` : text);
const inverse = (text: string, colors: boolean) => (colors ? `${ESC}7m${text}${ESC}0m` : text);

/** Everything the viewer shows for a state, as one write that repaints the screen. */
const frame = (
  fixtures: ReadonlyArray<GalleryFixture>,
  state: ViewState,
  terminal: { readonly columns: number; readonly rows: number },
): { readonly screen: string; readonly lineCount: number; readonly bodyRows: number } => {
  const fixture = fixtures[state.index];
  const bodyRows = Math.max(1, terminal.rows - 2);
  if (fixture === undefined) return { screen: `${HOME}${CLEAR_BELOW}`, lineCount: 0, bodyRows };
  const width = Option.getOrElse(state.width, () => terminal.columns);
  const lines = paintFixture(
    fixture,
    { columns: width, rows: bodyRows },
    { colors: state.colors, glyphs: state.ascii ? asciiGlyphs : unicodeGlyphs },
  );
  const fitted = Option.isNone(state.width);
  const size =
    fixture._tag === "document" ? `${String(width)}` : `${String(width)}x${String(bodyRows)}`;
  const header = truncateLine(
    ` ${fixture.name}  ${fixture._tag} · ${size}${fitted ? " (fit)" : ""} · ${state.ascii ? "ascii" : "unicode"} · ${state.colors ? "colour" : "plain"}  ${String(state.index + 1)}/${String(fixtures.length)} `,
    terminal.columns,
  );
  const scroll = Math.min(state.scroll, Math.max(0, lines.length - bodyRows));
  const shown = lines.slice(scroll, scroll + bodyRows);
  // A narrower painting shows where its edge is.
  const edge = fitted ? "" : dim(state.ascii ? "|" : "│", state.colors);
  const body = shown.map((line) =>
    fitted
      ? truncateLine(line, terminal.columns)
      : `${padDisplay(truncateLine(line, width), width)}${edge}`,
  );
  const position =
    lines.length > bodyRows
      ? `lines ${String(scroll + 1)}–${String(scroll + shown.length)} of ${String(lines.length)} · `
      : "";
  const footer = truncateLine(
    ` ${position}←→ width  ↑↓ scroll  n/p fixture  a ascii  c colour  q back`,
    terminal.columns,
  );
  const rows = [
    inverse(padDisplay(header, terminal.columns), state.colors),
    ...body,
    ...Array.from({ length: bodyRows - body.length }, () => ""),
    dim(footer, state.colors),
  ];
  return {
    // Each row is placed and cleared before it is written: clearing after a
    // row that fills the line would erase its last cell.
    screen:
      rows.map((row, line) => `${ESC}${String(line + 1)};1H${CLEAR_LINE}${row}`).join("") +
      CLEAR_BELOW,
    lineCount: lines.length,
    bodyRows,
  };
};

type Reaction = { readonly _tag: "Show"; readonly state: ViewState } | { readonly _tag: "Leave" };

const react = (
  state: ViewState,
  input: Terminal.UserInput,
  fixtureCount: number,
  columns: number,
  page: number,
): Reaction => {
  const { name, ctrl } = input.key;
  const char = Option.getOrUndefined(input.input);
  const show = (next: ViewState): Reaction => ({ _tag: "Show", state: next });
  if ((ctrl && name === "c") || name === "escape" || char === "q") return { _tag: "Leave" };
  if (name === "left") return show(stepWidth(state, columns, -1));
  if (name === "right") return show(stepWidth(state, columns, 1));
  if (name === "up") return show({ ...state, scroll: Math.max(0, state.scroll - 1) });
  if (name === "down") return show({ ...state, scroll: state.scroll + 1 });
  if (name === "pageup") return show({ ...state, scroll: Math.max(0, state.scroll - page) });
  if (name === "pagedown" || name === "space")
    return show({ ...state, scroll: state.scroll + page });
  if (name === "home") return show({ ...state, scroll: 0 });
  if (char === "a") return show({ ...state, ascii: !state.ascii });
  if (char === "c") return show({ ...state, colors: !state.colors });
  if (char === "n" || name === "tab")
    return show({ ...state, index: (state.index + 1) % fixtureCount, scroll: 0 });
  if (char === "p")
    return show({ ...state, index: (state.index - 1 + fixtureCount) % fixtureCount, scroll: 0 });
  return show(state);
};

/**
 * Show `fixtures[index]` until the person leaves, and answer with the index
 * of the fixture showing when they did.
 */
export const viewFixtures = (
  fixtures: ReadonlyArray<GalleryFixture>,
  index: number,
  style: LabStyle,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal;
      const streams = yield* OutputStreams;
      const facts = yield* streams.facts;
      if (!facts.stdoutIsTTY)
        return yield* userError("The viewer needs a terminal; paint fixtures with `lab gallery`.");
      const events = yield* Queue.unbounded<ViewEvent>();
      const input = yield* terminal.readInput;
      yield* Stream.fromQueue(input).pipe(
        Stream.runForEach((key) => Queue.offer(events, { _tag: "Key", input: key })),
        Effect.forkScoped,
      );
      yield* streams.resize.pipe(
        Stream.runForEach(() => Queue.offer(events, { _tag: "Resize" })),
        Effect.forkScoped,
      );
      yield* Effect.acquireRelease(streams.stdout(ENTER_ALTERNATE), () =>
        Effect.ignore(streams.stdout(LEAVE_ALTERNATE)),
      );
      const state = yield* Ref.make<ViewState>({
        index,
        width: Option.none(),
        ascii: style.glyphs === asciiGlyphs,
        colors: style.colors,
        scroll: 0,
      });
      const size = Effect.gen(function* () {
        const columns = yield* terminal.columns;
        const rows = yield* terminal.rows;
        return { columns: Math.max(20, columns), rows: Math.max(4, rows) };
      });
      // After a resize the old geometry is gone, so the whole screen is cleared first.
      const repaint = (cleared: boolean) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(state);
          const painted = frame(fixtures, current, yield* size);
          // Keep the scroll within what the painting has, so a key past the end does nothing.
          const limit = Math.max(0, painted.lineCount - painted.bodyRows);
          if (current.scroll > limit) yield* Ref.set(state, { ...current, scroll: limit });
          yield* streams.stdout(`${cleared ? CLEAR_SCREEN : ""}${painted.screen}`);
          return painted.bodyRows;
        });
      let page = yield* repaint(true);
      for (;;) {
        const event = yield* Queue.take(events);
        if (event._tag === "Key") {
          const { columns } = yield* size;
          const reaction = react(
            yield* Ref.get(state),
            event.input,
            fixtures.length,
            columns,
            page,
          );
          if (reaction._tag === "Leave") break;
          yield* Ref.set(state, reaction.state);
        }
        page = yield* repaint(event._tag === "Resize");
      }
      return (yield* Ref.get(state)).index;
    }),
  );
