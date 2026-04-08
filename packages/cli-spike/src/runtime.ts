/**
 * CLI runtime module.
 *
 * Owns cli-spike-specific service composition and exports withRuntime().
 * Root command composition stays in app.ts.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Terminal from "effect/Terminal";

import {
  type CliTelemetryConfigService,
  makeFoundationLayer,
  resolveCliFormat,
  withCliErrorHandling,
} from "@axm.sh/core/unstable/cli-runtime";
import { jsonFlag } from "@axm.sh/core/unstable/cli-flags";
import { resolveTelemetryMode } from "@axm.sh/core/unstable/telemetry";
import { makeAppError, type AppError } from "@axm.sh/core/unstable/app-error";
import { PromptCancelled } from "@axm.sh/core/unstable/prompt-cancelled";

import { FakePetStoreLive } from "./fake-pet-store.js";

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

export interface RuntimeCapabilities {
  readonly json: boolean;
}

interface RuntimeOptions {
  readonly command?: string;
  readonly capabilities?: RuntimeCapabilities;
}

export const withRuntime =
  (options?: RuntimeOptions) =>
  <A, R>(program: Effect.Effect<A, AppError | PromptCancelled | Terminal.QuitError, R>) =>
    Effect.gen(function* () {
      const explicitJson = yield* jsonFlag;
      const jsonRequested = Option.getOrElse(explicitJson, () => false);

      if (jsonRequested && options?.capabilities?.json !== true) {
        return yield* makeAppError({
          code: "JSON_OUTPUT_UNSUPPORTED",
          what: "This command does not support --json output",
          howToFix: "Use a command with a published JSON schema or omit --json.",
        });
      }

      const format = yield* resolveCliFormat;
      const foundationLayer = makeFoundationLayer(format);
      const appLayer = Layer.provideMerge(FakePetStoreLive, foundationLayer);
      const provided = program.pipe(Effect.provide(appLayer), Effect.scoped);
      const handled = provided.pipe(
        Effect.catchTag("QuitError", () =>
          Effect.fail(new PromptCancelled({ message: "Operation cancelled." })),
        ),
      );

      return yield* withCliErrorHandling(handled, {
        command: options?.command,
        format,
        telemetryConfig: spikeCliTelemetryConfig,
      });
    });
