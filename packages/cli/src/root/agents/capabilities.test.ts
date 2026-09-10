import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import { TestRenderer } from "../../screen/index.js";
import { handleAgentsCapabilities } from "./capabilities.js";

describe("agents capabilities.handler", () => {
  const makeLayers = () => {
    const renderer = TestRenderer.make();
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
        yield* handleAgentsCapabilities("gemini-cli");

        expect(rendererState.tables[0]?.caption).toContain("retired -> antigravity");
      }),
    );
  });
});
