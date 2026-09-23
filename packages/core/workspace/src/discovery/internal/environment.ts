/**
 * Environment variable access for package detectors.
 *
 * Mirrors the shared helpers the extracted kernels carry; a generic utils
 * package is deliberately not created.
 */

import * as Config from "effect/Config";

/** Values and absence follow the active provider; source failures remain typed. */
export const envOption = (name: string) => Config.option(Config.String(name));

/** A default applies only to an absent value. */
export const envWithDefault = (name: string, fallback: string) =>
  Config.String(name).pipe(Config.withDefault(fallback));
