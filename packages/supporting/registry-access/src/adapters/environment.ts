/**
 * Runtime environment detection for credential policy and login flows.
 *
 * Environment values are read through Effect's `ConfigProvider`, whose default
 * is the process environment. Tests and embedders replace the provider instead
 * of mutating `process.env`, so no auth policy specification stubs globals.
 */

import * as ConfigProvider from "effect/ConfigProvider";
import * as ServiceMap from "effect/Context";
import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ciEnabled } from "@agentxm/host-primitives";
import { RegistryAccessFailed } from "../authentication/errors.js";
import type { LoginStrategyEnvironment } from "../authentication/login-strategy.js";

/**
 * Reads the live process environment on every lookup. Effect's own
 * `ConfigProvider` default snapshots the environment the first time any
 * program reads configuration; auth reads must observe the environment the
 * invocation actually runs under.
 */
const processEnvironmentProvider: ConfigProvider.ConfigProvider = ConfigProvider.make((path) =>
  // eslint-disable-next-line no-restricted-properties -- the one process-environment read in registry-access
  ConfigProvider.fromEnvRecord(process.env).load(path),
);

/**
 * The configuration source every auth environment decision reads. Defaults to
 * the process environment; tests and embedders provide any `ConfigProvider`
 * — `ConfigProvider.fromEnvRecord({ ... })` — instead of mutating globals.
 */
export const AuthEnvironment: ServiceMap.Reference<ConfigProvider.ConfigProvider> =
  ServiceMap.Reference<ConfigProvider.ConfigProvider>("@agentxm/registry-access/AuthEnvironment", {
    defaultValue: () => processEnvironmentProvider,
  });

/**
 * The raw string a provider node carries. A `Record` or `Array` node still
 * carries the value of the exact key when the environment also defines
 * longer keys under it (`AXM_TOKEN` beside `AXM_TOKEN_FILE`).
 */
const nodeValue = (node: ConfigProvider.Node | undefined): Option.Option<string> =>
  node === undefined
    ? Option.none()
    : node._tag === "Value"
      ? Option.some(node.value)
      : Option.fromUndefinedOr(node.value);

/**
 * Read an optional environment value. The single access point: every auth
 * environment decision resolves through the ambient `ConfigProvider`.
 */
export const envOption = (
  name: string,
): Effect.Effect<Option.Option<string>, RegistryAccessFailed> =>
  Effect.gen(function* () {
    const provider = yield* AuthEnvironment;
    const node = yield* provider.load([name]).pipe(
      Effect.mapError(
        (cause) =>
          new RegistryAccessFailed({
            category: "auth",
            detail: `Could not read authentication configuration: ${name}`,
            cause,
          }),
      ),
    );
    return nodeValue(node);
  });

/** Returns true if SSH_CLIENT or SSH_TTY is set. */
export const isSSH: Effect.Effect<boolean, RegistryAccessFailed> = Effect.map(
  Effect.all([envOption("SSH_CLIENT"), envOption("SSH_TTY")]),
  ([client, tty]) => Option.isSome(client) || Option.isSome(tty),
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

/** Returns true if CI env var is set. */
export const isCI: Effect.Effect<boolean, RegistryAccessFailed> = Effect.map(
  envOption("CI"),
  (value) => Option.exists(value, ciEnabled),
);

/**
 * The environment facts login-strategy selection reads. Assembled here so the
 * strategy decision never touches globals.
 */
export const loginStrategyEnvironment = Effect.gen(function* () {
  const env = yield* Effect.all({
    SSH_CONNECTION: envOption("SSH_CONNECTION"),
    SSH_CLIENT: envOption("SSH_CLIENT"),
    SSH_TTY: envOption("SSH_TTY"),
    DISPLAY: envOption("DISPLAY"),
    WAYLAND_DISPLAY: envOption("WAYLAND_DISPLAY"),
    BROWSER: envOption("BROWSER"),
    CI: envOption("CI"),
    CODESPACES: envOption("CODESPACES"),
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
