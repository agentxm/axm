import { fileURLToPath } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { collectOwnedSourceFrames } from "./source-frames.js";

const owned = fileURLToPath(new URL("../app-error/app-error.ts", import.meta.url));

describe("owned source frames", () => {
  it.effect("admits catalogued locations and emits oldest first without function text", () =>
    Effect.gen(function* () {
      const frames = yield* collectOwnedSourceFrames([
        {
          stack: `Error: private message\n    at privateFunction (${owned}:2:4)\n    at ${owned}:3:5\n    at duplicate (${owned}:2:4)`,
        },
      ]);
      expect(frames).toEqual([
        { module: "axm.sh", filename: "src/app-error/app-error.ts", line: 3, column: 4 },
        { module: "axm.sh", filename: "src/app-error/app-error.ts", line: 2, column: 3 },
      ]);
      expect(JSON.stringify(frames)).not.toContain("private");
      expect(JSON.stringify(frames)).not.toContain(owned);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "omits invented owned names, traversal, excluded files and out-of-range locations",
    () =>
      Effect.gen(function* () {
        const unknown = fileURLToPath(new URL("invented-owned-file.ts", import.meta.url));
        const test = fileURLToPath(import.meta.url);
        const outside = fileURLToPath(
          new URL("../../../../../../private-source.ts", import.meta.url),
        );
        const frames = yield* collectOwnedSourceFrames([
          {
            stack: `Error\n at ${unknown}:1:1\n at ${test}:1:1\n at ${outside}:1:1\n at ${owned}:999999:1\n at ${owned}:1:0\n at node:internal/main:1:1`,
          },
        ]);
        expect(frames).toEqual([]);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("diagnostic inspection defects do not escape", () =>
    Effect.gen(function* () {
      const frames = yield* collectOwnedSourceFrames([
        {
          get stack(): string {
            throw new Error("uninspectable foreign error");
          },
        },
      ]);
      expect(frames).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
