import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { rootCommand } from "./app.js";
import { cliConfigLayer } from "./runtime.js";
import { validateCommandPath } from "./validate-command-path.js";

describe("validate command path", () => {
  it.layer(Layer.mergeAll(cliConfigLayer, NodeServices.layer))((it) => {
    it.effect("resolves the route the parser matched in the registered tree", () =>
      Effect.gen(function* () {
        expect(yield* validateCommandPath(rootCommand, ["skills", "new", "my-skill"])).toEqual([
          "skills",
          "new",
        ]);
        expect(yield* validateCommandPath(rootCommand, ["whoami", "--json"])).toEqual(["whoami"]);
        expect(
          yield* validateCommandPath(rootCommand, ["knowledge", "concepts", "query", "auth"]),
        ).toEqual(["knowledge", "concepts", "query"]);
        expect(yield* validateCommandPath(rootCommand, [])).toEqual([]);
      }),
    );

    it.effect("refuses an unknown command before any route runs", () =>
      Effect.gen(function* () {
        const error = yield* validateCommandPath(rootCommand, ["auth", "whoami"]).pipe(Effect.flip);
        expect(error._tag).toBe("ShowHelp");
      }),
    );
  });
});
