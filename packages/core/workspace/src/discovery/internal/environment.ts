/**
 * Environment variable access for package detectors.
 *
 * Mirrors the shared helpers the extracted kernels carry; a generic utils
 * package is deliberately not created.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

// eslint-disable-next-line no-restricted-properties -- Centralized env var access point; all callers use these helpers
export const readEnv = (name: string): string | undefined => process.env[name];

/** Read an optional env var. Centralized access point for process.env. */
export const envOption = (name: string): Effect.Effect<Option.Option<string>> =>
  Effect.sync(() => Option.fromUndefinedOr(readEnv(name)));

/** Read an env var with a default value. Centralized access point for process.env. */
export const envWithDefault = (name: string, fallback: string): Effect.Effect<string> =>
  Effect.sync(() => readEnv(name) ?? fallback);
