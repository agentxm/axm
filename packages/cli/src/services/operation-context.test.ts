import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { OperationContext } from "./operation-context.js";
import type { InteractionContextService } from "./interaction-context/types.js";

describe("OperationContext", () => {
  describe("layer", () => {
    it.effect("should provide config with interactive context", () => {
      const mockInteraction: InteractionContextService = {
        p: {} as never,
      };

      return Effect.gen(function* () {
        const ctx = yield* OperationContext;
        expect(ctx.cwd).toBe("/test");
        expect(ctx.dryRun).toBe(true);
        expect(Option.isSome(ctx.interactive)).toBe(true);
        expect(Option.getOrThrow(ctx.interactive)).toBe(mockInteraction);
      }).pipe(
        Effect.provide(
          OperationContext.layer({
            cwd: "/test",
            dryRun: true,
            interactive: Option.some(mockInteraction),
          }),
        ),
      );
    });

    it.effect("should provide config without interactive context", () =>
      Effect.gen(function* () {
        const ctx = yield* OperationContext;
        expect(ctx.cwd).toBe("/test");
        expect(ctx.dryRun).toBe(false);
        expect(Option.isNone(ctx.interactive)).toBe(true);
      }).pipe(
        Effect.provide(
          OperationContext.layer({
            cwd: "/test",
            dryRun: false,
            interactive: Option.none(),
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
        expect(Option.isNone(ctx.interactive)).toBe(true);
      }).pipe(Effect.provide(OperationContext.defaultLayer)),
    );
  });
});
