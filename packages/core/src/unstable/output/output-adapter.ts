import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliRenderer, type BoxOptions as RendererBoxOptions } from "../cli-renderer/cli-renderer.js";
import { Output, type BoxOptions } from "./output.js";

/**
 * Map Output's BoxOptions to CliRenderer's BoxOptions.
 * Uses spread conditionals to avoid assigning undefined to optional properties
 * (required by exactOptionalPropertyTypes).
 */
const mapBoxOptions = (opts: BoxOptions): RendererBoxOptions => ({
  ...(opts.contentAlign && { contentAlignment: opts.contentAlign }),
  ...(opts.titleAlign && { titleAlignment: opts.titleAlign }),
  ...(typeof opts.width === "number" && { width: opts.width }),
  ...(opts.contentPadding !== undefined && { padding: opts.contentPadding }),
  ...(opts.rounded !== undefined && { rounded: opts.rounded }),
});

/**
 * Adapter layer that implements `Output` by delegating to `CliRenderer`.
 *
 * This is a temporary bridge during migration — once all handlers use
 * CliRenderer directly, this adapter and the Output service will be removed.
 */
export const OutputAdapter: Layer.Layer<Output, never, CliRenderer> = Layer.effect(
  Output,
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    return {
      message: (msg) => renderer.message(msg),
      info: (msg) => renderer.info(msg),
      success: (msg) => renderer.success(msg),
      step: (msg) => renderer.step(msg),
      warn: (msg) => renderer.warn(msg),
      error: (msg) => renderer.error(msg),
      intro: (title) => renderer.intro(title ?? ""),
      outro: (msg) => renderer.outro(msg ?? ""),
      cancel: (msg) => renderer.cancel(msg),
      note: (msg, title) => renderer.note(msg, title),
      box: (msg, title, opts) => renderer.box(msg, title, opts && mapBoxOptions(opts)),
      stream: (level, stream) => renderer.streamLog(level, stream),
    };
  }),
);
