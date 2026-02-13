import React from "react";
import { render } from "ink";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SpinnerComponent } from "./component.js";
import type { SpinnerHandle, SpinnerService } from "./types.js";

export class Spinner extends Context.Tag("@axm.sh/cli/tui/Spinner")<Spinner, SpinnerService>() {}

const makeLiveSpinnerService = (): SpinnerService => {
  const active = new Set<{ instance: ReturnType<typeof render> }>();

  return {
    start: (message) =>
      Effect.sync(() => {
        const instance = render(React.createElement(SpinnerComponent, { message }));
        const entry = { instance };
        active.add(entry);

        return {
          stop: (stopMessage: string) =>
            Effect.sync(() => {
              active.delete(entry);
              instance.unmount();
              instance.cleanup();
              process.stdout.write(`\u2714 ${stopMessage}\n`);
            }),
        } satisfies SpinnerHandle;
      }),
    stopAll: Effect.sync(() => {
      for (const entry of active) {
        entry.instance.unmount();
        entry.instance.cleanup();
      }
      active.clear();
    }),
  };
};

export const SpinnerLive: Layer.Layer<Spinner> = Layer.succeed(Spinner, makeLiveSpinnerService());
