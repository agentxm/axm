import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { vi } from "vitest";
import { InteractionContext } from "./interaction-context/service.js";
import type { InteractionContextService } from "./interaction-context/types.js";
import { OperationContext } from "./operation-context.js";

vi.mock("../utils/tty.js", () => ({
  isInteractive: vi.fn(() => true),
}));

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

  describe("liveLayer", () => {
    const mockInteraction: InteractionContextService = {
      p: {} as never,
    };
    const mockInteractionLayer = InteractionContext.layer(mockInteraction);

    it.effect("should provide interactive context when TTY available", () =>
      Effect.gen(function* () {
        const ctx = yield* OperationContext;
        expect(ctx.cwd).toBe(process.cwd());
        expect(ctx.dryRun).toBe(false);
        expect(Option.isSome(ctx.interactive)).toBe(true);
      }).pipe(Effect.provide(Layer.provide(OperationContext.liveLayer(), mockInteractionLayer))),
    );

    it.effect("should not provide interactive context when nonInteractive is true", () =>
      Effect.gen(function* () {
        const ctx = yield* OperationContext;
        expect(ctx.cwd).toBe(process.cwd());
        expect(ctx.dryRun).toBe(false);
        expect(Option.isNone(ctx.interactive)).toBe(true);
      }).pipe(
        Effect.provide(
          Layer.provide(OperationContext.liveLayer({ nonInteractive: true }), mockInteractionLayer),
        ),
      ),
    );

    it.effect("should use provided cwd and dryRun config", () =>
      Effect.gen(function* () {
        const ctx = yield* OperationContext;
        expect(ctx.cwd).toBe("/custom");
        expect(ctx.dryRun).toBe(true);
      }).pipe(
        Effect.provide(
          Layer.provide(
            OperationContext.liveLayer({ cwd: "/custom", dryRun: true }),
            mockInteractionLayer,
          ),
        ),
      ),
    );
  });
});
