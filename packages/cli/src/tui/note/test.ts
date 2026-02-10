import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Note, type NoteService } from "./service.js";

export interface NoteRecord {
  readonly message: string;
  readonly title: string | undefined;
}

export interface MockNoteService extends NoteService {
  readonly notes: NoteRecord[];
}

export function makeNoteTestLayer(): [Layer.Layer<Note>, MockNoteService] {
  const notes: NoteRecord[] = [];

  const mockService: MockNoteService = {
    notes,
    display: (message, title) =>
      Effect.sync(() => {
        notes.push({ message, title });
      }),
  };

  const layer = Layer.succeed(Note, mockService);
  return [layer, mockService];
}
