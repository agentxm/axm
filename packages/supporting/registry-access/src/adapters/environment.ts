/**
 * Runtime environment detection for credential policy and login flows.
 *
 * Environment values are read through the ambient `ConfigProvider`, which the
 * application supplies once per invocation. Tests and embedders replace the
 * provider instead of mutating `process.env`, so no auth policy specification
 * stubs globals.
 */

import type * as Config from "effect/Config";
import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { envOption, isCI } from "@agentxm/host-primitives";
import { RegistryAccessFailed } from "../authentication/errors.js";
import type { LoginStrategyEnvironment } from "../authentication/login-strategy.js";

const authConfigurationFailed = (name: string) => (cause: Config.ConfigError) =>
  new RegistryAccessFailed({
    category: "auth",
    detail: `Could not read authentication configuration: ${name}`,
    cause,
  });

/** Read one auth variable from the ambient provider as a typed Registry access failure. */
export const readAuthVariable = (
  name: string,
): Effect.Effect<Option.Option<string>, RegistryAccessFailed> =>
  envOption(name).pipe(Effect.mapError(authConfigurationFailed(name)));

/** Whether an auth variable holds a non-empty value; an empty value counts as unset. */
export const authVariableIsSet = (name: string): Effect.Effect<boolean, RegistryAccessFailed> =>
  Effect.map(
    readAuthVariable(name),
    Option.exists((value) => value.length > 0),
  );

/** Returns true if SSH_CLIENT or SSH_TTY is set to a non-empty value. */
export const isSSH: Effect.Effect<boolean, RegistryAccessFailed> = Effect.map(
  Effect.all([authVariableIsSet("SSH_CLIENT"), authVariableIsSet("SSH_TTY")]),
  ([client, tty]) => client || tty,
);

/** Whether CI is enabled, under the shared CI reading. */
export const isContinuousIntegration: Effect.Effect<boolean, RegistryAccessFailed> = isCI.pipe(
  Effect.mapError(authConfigurationFailed("CI")),
);

/** Returns true if running as root (uid 0). */
export const isRoot = (): boolean => process.getuid?.() === 0;

/** Returns true if /.dockerenv or /.containerenv exists. Requires FileSystem. */
export const isContainer = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dockerExists = yield* fs
    .exists("/.dockerenv")
    .pipe(Effect.catch(() => Effect.succeed(false)));
  if (dockerExists) return true;
  const containerExists = yield* fs
    .exists("/.containerenv")
    .pipe(Effect.catch(() => Effect.succeed(false)));
  return containerExists;
});

/** Returns true if /proc/version contains "microsoft". Requires FileSystem. */
export const isWSL = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const exists = yield* fs.exists("/proc/version").pipe(Effect.catch(() => Effect.succeed(false)));
  if (!exists) return false;
  const content = yield* fs
    .readFileString("/proc/version")
    .pipe(Effect.catch(() => Effect.succeed("")));
  return /microsoft/i.test(content);
});

/**
 * The environment facts login-strategy selection reads. Assembled here so the
 * strategy decision never touches globals.
 */
export const loginStrategyEnvironment = Effect.gen(function* () {
  const env = yield* Effect.all({
    SSH_CONNECTION: readAuthVariable("SSH_CONNECTION"),
    SSH_CLIENT: readAuthVariable("SSH_CLIENT"),
    SSH_TTY: readAuthVariable("SSH_TTY"),
    DISPLAY: readAuthVariable("DISPLAY"),
    WAYLAND_DISPLAY: readAuthVariable("WAYLAND_DISPLAY"),
    BROWSER: readAuthVariable("BROWSER"),
    CI: readAuthVariable("CI"),
    CODESPACES: readAuthVariable("CODESPACES"),
  });
  const variables = Object.fromEntries(
    Object.entries(env).flatMap(([key, value]) =>
      Option.isSome(value) ? [[key, value.value] as const] : [],
    ),
  );
  const platform = process.platform;
  return {
    ...variables,
    platform,
    isWSL: platform === "linux" && (yield* isWSL),
  } satisfies LoginStrategyEnvironment;
});
