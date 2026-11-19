import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import { makeTestScreen, tables } from "../../test-support/test-screen.js";
import { handleAgentsCapabilities } from "./capabilities.js";

describe("agents capabilities.handler", () => {
  const makeLayers = () => {
    const renderer = makeTestScreen();
    return {
      provide: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(
          Effect.provide(Layer.mergeAll(NodeServices.layer, renderer.layer, TestFlagsLayer())),
        ),
      rendererState: renderer.state,
    };
  };

  it.effect("reports lifecycle for a retired agent", () => {
    const { provide, rendererState } = makeLayers();

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsCapabilities("codemaker");

        expect(tables(rendererState)[0]?.caption).toContain("retired");
      }),
    );
  });
});
