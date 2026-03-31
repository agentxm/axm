/**
 * CLI runtime module.
 *
 * Owns cli-spike-specific service composition and exports withRuntime().
 * Root command composition stays in app.ts.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  type CliTelemetryConfigService,
  makeFoundationLayer,
  resolveCliFormat,
  withCliErrorHandling,
} from "@axm.sh/core/unstable/cli-runtime";
import { resolveTelemetryMode } from "@axm.sh/core/unstable/telemetry";
import type { AppError } from "@axm.sh/core/unstable/app-error";
import type { PromptCancelled } from "@axm.sh/core/unstable/prompt-cancelled";

import { FakeSkillsManagerLive } from "./fake-skills-manager.js";

export const ROOT_COMMAND = "axm-spike";
export const VERSION = "0.0.1";

const spikeCliTelemetryConfig = {
  mode: resolveTelemetryMode(
    {
      doNotTrack: process.env["DO_NOT_TRACK"],
      telemetry: process.env["AXM_TELEMETRY"],
    },
    {},
  ),
  client: { name: ROOT_COMMAND, version: VERSION },
} satisfies CliTelemetryConfigService;

interface RuntimeOptions {
  readonly command?: string;
}

export const withRuntime = <A, R>(
  program: Effect.Effect<A, AppError | PromptCancelled, R>,
  options?: RuntimeOptions,
) =>
  Effect.gen(function* () {
    const format = yield* resolveCliFormat;
    const foundationLayer = makeFoundationLayer(format);
    const appLayer = Layer.provideMerge(FakeSkillsManagerLive, foundationLayer);
    const provided = program.pipe(Effect.provide(appLayer), Effect.scoped);

    return yield* withCliErrorHandling(provided, {
      command: options?.command,
      format,
      telemetryConfig: spikeCliTelemetryConfig,
    });
  });
