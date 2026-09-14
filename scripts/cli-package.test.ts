import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { composeCliManifest } from "./cli-package.js";

const cli = {
  name: "axm.sh",
  version: "1.2.3",
  dependencies: { "@fixture/update": "^0.0.1", effect: "4.0.0-rc.115" },
  exports: { "./app": { types: "./dist/app.d.ts", default: "./dist/app.js" } },
};

describe("compiled CLI package composition", () => {
  it.effect("keeps private implementations bundled and shared contracts external", () =>
    Effect.gen(function* () {
      const result = yield* composeCliManifest(cli, [
        {
          name: "@fixture/update",
          version: "0.0.1",
          private: true,
          dependencies: {
            effect: "4.0.0-rc.115",
            "@fixture/resolution": "^0.0.1",
            "@agentxm/extension-model": "^1.2.3",
          },
        },
        {
          name: "@fixture/resolution",
          version: "0.0.1",
          private: true,
          dependencies: { semver: "7.8.5" },
        },
      ]);
      expect(result.bundleDependencies).toEqual(["@fixture/resolution", "@fixture/update"]);
      expect(result.dependencies).toEqual({
        "@fixture/update": "0.0.1",
        "@fixture/resolution": "0.0.1",
        "@agentxm/extension-model": "^1.2.3",
        effect: "4.0.0-rc.115",
        semver: "7.8.5",
      });
      expect(result).toHaveProperty("exports", cli.exports);
    }),
  );

  it.effect(
    "preserves optional dependencies and promotes a dependency when another owner requires it",
    () =>
      Effect.gen(function* () {
        const result = yield* composeCliManifest(
          { ...cli, optionalDependencies: { native: "1.0.0" } },
          [
            {
              name: "@fixture/update",
              version: "0.0.1",
              private: true,
              dependencies: { native: "1.0.0" },
              optionalDependencies: { optional: "2.0.0" },
            },
          ],
        );
        expect(result.dependencies["native"]).toBe("1.0.0");
        expect(result.optionalDependencies).toEqual({ optional: "2.0.0" });
      }),
  );

  it.effect("refuses a second version of a shared runtime dependency", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        composeCliManifest(cli, [
          {
            name: "@fixture/update",
            version: "0.0.1",
            private: true,
            dependencies: { effect: "4.0.0-rc.116" },
          },
        ]),
      );
      expect(error.message).toContain("conflicting references");
    }),
  );
});
