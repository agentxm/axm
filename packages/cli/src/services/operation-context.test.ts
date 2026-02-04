import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { OperationContext } from "./operation-context.js";
import type { InteractionContextService } from "./interaction-context/types.js";

describe("OperationContext", () => {
  describe("layer", () => {
    it.effect("should provide config with interaction", () => {
      const mockInteraction: InteractionContextService = {
        p: {} as never,
      };

      return Effect.gen(function* () {
        const ctx = yield* OperationContext;
        expect(ctx.cwd).toBe("/test");
        expect(ctx.dryRun).toBe(true);
        expect(Option.isSome(ctx.interaction)).toBe(true);
        expect(Option.getOrThrow(ctx.interaction)).toBe(mockInteraction);
      }).pipe(
        Effect.provide(
          OperationContext.layer({
            cwd: "/test",
            dryRun: true,
            interaction: Option.some(mockInteraction),
          }),
        ),
      );
    });

    it.effect("should provide config without interaction", () =>
      Effect.gen(function* () {
        const ctx = yield* OperationContext;
        expect(ctx.cwd).toBe("/test");
        expect(ctx.dryRun).toBe(false);
        expect(Option.isNone(ctx.interaction)).toBe(true);
      }).pipe(
        Effect.provide(
          OperationContext.layer({
            cwd: "/test",
            dryRun: false,
            interaction: Option.none(),
          }),
        ),
      ),
    );
  });

  describe("defaultLayer", () => {
    it.effect("should use process.cwd and default values", () =>
      Effect.gen(function* () {
        const ctx = yield* OperationContext;
        expect(ctx.cwd).toBe(process.cwd());
        expect(ctx.dryRun).toBe(false);
        expect(Option.isNone(ctx.interaction)).toBe(true);
      }).pipe(Effect.provide(OperationContext.defaultLayer)),
    );
  });
});
