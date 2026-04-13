import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { scopeFlag } from "../../cli-flags.js";
import { resolveBuiltInSources, withRuntime } from "../../runtime.js";
import { handleDoctor } from "./handler.js";

const doctorConfig = {
  scope: scopeFlag,
} as const;

export const doctorCommand = Command.make("doctor", doctorConfig, ({ scope }) =>
  Effect.gen(function* () {
    const builtInSources = yield* resolveBuiltInSources;
    yield* handleDoctor({ scope, builtInSources });
  }).pipe(withRuntime("doctor")),
).pipe(
  withArgvTracking(doctorConfig),
  Command.withDescription("Run workspace diagnostics"),
  Command.withExamples([
    { command: "axm doctor", description: "Show workspace diagnostics" },
    { command: "axm doctor --json", description: "Emit diagnostics as JSON" },
    { command: "axm doctor --verbose", description: "Include info advisories for passing checks" },
    { command: "axm doctor --quiet", description: "Only show checks that are not passing" },
  ]),
);
