/**
 * Unit tests for the interaction context service.
 *
 * Tests the InteractionContext service:
 * - Live layer exposes ClackService via p property
 * - Delegation to underlying Clack service
 * - Custom layer creation
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { makeClackTestLayer } from "../clack-effect/test.js";
import { InteractionContext, InteractionContextLive } from "./service.js";

describe("InteractionContext", () => {
  describe("InteractionContextLive", () => {
    it.effect("should expose ClackService via p property", () =>
      Effect.gen(function* () {
        const ctx = yield* InteractionContext;

        // Verify the shape - p should have the ClackService methods
        expect(ctx.p).toBeDefined();
        expect(ctx.p.intro).toBeTypeOf("function");
        expect(ctx.p.outro).toBeTypeOf("function");
        expect(ctx.p.log).toBeDefined();
        expect(ctx.p.confirm).toBeTypeOf("function");
        expect(ctx.p.select).toBeTypeOf("function");
        expect(ctx.p.multiselect).toBeTypeOf("function");
        expect(ctx.p.spinner).toBeTypeOf("function");
      }).pipe(Effect.provide(InteractionContextLive), Effect.provide(makeClackTestLayer()[0])),
    );

    it.effect("should delegate to underlying Clack service", () => {
      const [clackLayer, mockClack] = makeClackTestLayer();

      return Effect.gen(function* () {
        const ctx = yield* InteractionContext;

        // Call log methods through p
        yield* ctx.p.log.info("test info");
        yield* ctx.p.log.success("test success");

        // Verify delegation
        expect(mockClack.logs.info).toContain("test info");
        expect(mockClack.logs.success).toContain("test success");
      }).pipe(Effect.provide(InteractionContextLive), Effect.provide(clackLayer));
    });
  });

  describe("InteractionContext.layer", () => {
    it.effect("should create layer from custom service", () => {
      const mockP = {
        intro: () => Effect.void,
        outro: () => Effect.void,
        log: {
          info: () => Effect.void,
          warn: () => Effect.void,
          error: () => Effect.void,
          success: () => Effect.void,
          message: () => Effect.void,
        },
        confirm: () => Effect.succeed(true),
        select: () => Effect.succeed("selected"),
        multiselect: () => Effect.succeed([]),
        spinner: () => Effect.succeed({ start: () => {}, stop: () => {} }),
      };
      const mockService = { p: mockP as never };

      return Effect.gen(function* () {
        const ctx = yield* InteractionContext;
        expect(ctx.p).toBe(mockP);
      }).pipe(Effect.provide(InteractionContext.layer(mockService)));
    });
  });
});
