/**
 * The fixture browser `lab` opens with no command: the CLI's own `Pick`
 * question over every gallery fixture, asked through the real `Screen`, and
 * the viewer for the one picked. Leaving the viewer asks again; cancelling
 * the question ends the browser. Browsing the gallery is therefore also
 * using the prompt the CLI ships.
 */

import * as Effect from "effect/Effect";

import { pickAsk } from "../../src/screen/ask/ask.js";
import { Screen } from "../../src/screen/screen.js";
import type { GalleryFixture } from "../../src/test-support/gallery/fixture.js";

import type { LabStyle } from "./shared.js";
import { viewFixtures } from "./view.js";

/** The board a fixture is drawn from: the part of its name before `--`. */
const groupOf = (fixture: GalleryFixture): string => {
  const at = fixture.name.indexOf("--");
  return at < 0 ? "primitives" : fixture.name.slice(0, at);
};

const fixtureQuestion = (fixtures: ReadonlyArray<GalleryFixture>) =>
  pickAsk({
    question: "Which fixture do you want to look at?",
    label: "Fixture",
    noun: { one: "fixture", other: "fixtures" },
    min: 1,
    max: 1,
    verb: "view",
    options: fixtures.map((fixture, index) => ({
      title: fixture.name,
      details: [fixture._tag],
      group: groupOf(fixture),
      value: index,
    })),
  });

/** Ask for a fixture, show it, and ask again until the question is cancelled. */
export const browseFixtures = (fixtures: ReadonlyArray<GalleryFixture>, style: LabStyle) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const question = fixtureQuestion(fixtures);
    for (;;) {
      const picked = yield* screen.ask(question).pipe(
        Effect.map((indexes) => indexes[0]),
        Effect.catchTag("QuestionCancelled", () => Effect.succeed(undefined)),
      );
      if (picked === undefined) return;
      yield* viewFixtures(fixtures, picked, style);
    }
  });
