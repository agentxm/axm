import pc from "picocolors";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface LogService {
  readonly info: (message: string) => Effect.Effect<void>;
  readonly warn: (message: string) => Effect.Effect<void>;
  readonly error: (message: string) => Effect.Effect<void>;
  readonly success: (message: string) => Effect.Effect<void>;
  readonly message: (message: string) => Effect.Effect<void>;
}

export class Log extends Context.Tag("@axm.sh/cli/tui/Log")<Log, LogService>() {}

const makeLiveLogService = (): LogService => ({
  info: (message) => Effect.sync(() => process.stdout.write(`${pc.blue("info")} ${message}\n`)),
  warn: (message) => Effect.sync(() => process.stdout.write(`${pc.yellow("warn")} ${message}\n`)),
  error: (message) => Effect.sync(() => process.stdout.write(`${pc.red("error")} ${message}\n`)),
  success: (message) =>
    Effect.sync(() => process.stdout.write(`${pc.green("success")} ${message}\n`)),
  message: (message) => Effect.sync(() => process.stdout.write(`${message}\n`)),
});

export const LogLive: Layer.Layer<Log> = Layer.succeed(Log, makeLiveLogService());
