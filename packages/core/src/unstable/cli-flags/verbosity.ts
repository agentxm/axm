import * as Layer from "effect/Layer";
import type * as LogLevel from "effect/LogLevel";
import * as ServiceMap from "effect/Context";

export type VerbosityLevel = "quiet" | "normal" | "verbose" | "debug";

export const LevelOrder = {
  quiet: 0,
  normal: 1,
  verbose: 2,
  debug: 3,
} as const satisfies Record<VerbosityLevel, number>;

export class Verbosity extends ServiceMap.Service<
  Verbosity,
  {
    readonly level: VerbosityLevel;
    readonly isAtLeast: (min: VerbosityLevel) => boolean;
  }
>()("@agentxm/client-core/unstable/cli-flags/verbosity") {}

export const makeVerbosityLayer = (level: VerbosityLevel): Layer.Layer<Verbosity> =>
  Layer.succeed(Verbosity, {
    level,
    isAtLeast: (min) => LevelOrder[level] >= LevelOrder[min],
  });

export const verbosityToLogLevel = (level: VerbosityLevel): LogLevel.LogLevel => {
  switch (level) {
    case "quiet":
      return "Warn";
    case "normal":
      return "Info";
    case "verbose":
      return "Debug";
    case "debug":
      return "Trace";
  }
};
