import React from "react";
import { render } from "ink";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SpinnerComponent } from "./component.js";
import type { SpinnerHandle } from "./types.js";

interface SpinnerService {
  readonly start: (message: string) => Effect.Effect<SpinnerHandle>;
}

export class Spinner extends Context.Tag("@axm.sh/cli/tui/Spinner")<Spinner, SpinnerService>() {}

const makeLiveSpinnerService = (): SpinnerService => ({
  start: (message) =>
    Effect.sync(() => {
      const instance = render(React.createElement(SpinnerComponent, { message }));

      return {
        stop: (stopMessage: string) =>
          Effect.sync(() => {
            instance.unmount();
            instance.cleanup();
            process.stdout.write(`\u2714 ${stopMessage}\n`);
          }),
      } satisfies SpinnerHandle;
    }),
});

export const SpinnerLive: Layer.Layer<Spinner> = Layer.succeed(Spinner, makeLiveSpinnerService());
