/** Configuration-backed environment values used by CLI policy. */

import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

/** Values and absence follow the active provider; source failures remain typed. */
export const envOption = (name: string) => Config.option(Config.String(name));

/** A default applies only to an absent value. */
export const envWithDefault = (name: string, fallback: string) =>
  Config.String(name).pipe(Config.withDefault(fallback));

/**
 * The one reading of the `CI` variable: any non-empty value enables CI except
 * the conventional false spellings. Every CI decision — prompt availability,
 * output styling, and the startup update check — applies this predicate.
 */
export const ciEnabled = (raw: string | undefined): boolean =>
  raw !== undefined && raw.length > 0 && raw !== "0" && raw.toLowerCase() !== "false";

/** Whether CI is enabled, read through the active configuration provider. */
export const isCI = Effect.map(envOption("CI"), (value) => Option.exists(value, ciEnabled));
