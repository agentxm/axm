import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import { Note } from "./service.js";
import { makeNoteTestLayer } from "./test.js";

describe("Note", () => {
  it("records display call with title", async () => {
    const [layer, mock] = makeNoteTestLayer();
    await Effect.gen(function* () {
      const note = yield* Note;
      yield* note.display("Run axm skills install", "Next steps");
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.notes).toEqual([{ message: "Run axm skills install", title: "Next steps" }]);
  });

  it("records display call without title", async () => {
    const [layer, mock] = makeNoteTestLayer();
    await Effect.gen(function* () {
      const note = yield* Note;
      yield* note.display("Operation complete");
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.notes).toEqual([{ message: "Operation complete", title: undefined }]);
  });

  it("records multiple display calls", async () => {
    const [layer, mock] = makeNoteTestLayer();
    await Effect.gen(function* () {
      const note = yield* Note;
      yield* note.display("first", "Title A");
      yield* note.display("second");
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(mock.notes).toEqual([
      { message: "first", title: "Title A" },
      { message: "second", title: undefined },
    ]);
  });
});
