import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { parseLocalPath } from "./parser.js";
import { print } from "./print.js";

describe("print", () => {
  it("formats local path", () => {
    expect(print({ type: "local", path: "./my/skills" })).toBe("./my/skills");
  });

  it("formats absolute path", () => {
    expect(print({ type: "local", path: "/home/user/skills" })).toBe("/home/user/skills");
  });

  describe("round-trip", () => {
    it.effect("relative path", () =>
      Effect.gen(function* () {
        const path = "./my/skills";
        const source = yield* parseLocalPath(path);
        expect(print(source)).toBe(path);
      }),
    );

    it.effect("absolute path", () =>
      Effect.gen(function* () {
        const path = "/home/user/skills";
        const source = yield* parseLocalPath(path);
        expect(print(source)).toBe(path);
      }),
    );
  });
});
