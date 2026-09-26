/** Host home-directory resolution shared across AXM tiers. */

// Intentional escape hatch: node:os homedir() has no Effect platform equivalent.
import * as os from "node:os";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

export const AXM_DIR_NAME = ".axm";

/** The optional override; empty values do not relocate the user's home. */
export const configuredUserHome: Effect.Effect<
  Option.Option<string>,
  Config.ConfigError
> = Config.option(Config.String("AXM_USER_HOME")).pipe(
  Effect.map(Option.filter((value) => value.length > 0)),
);

/** The OS account home, regardless of AXM_USER_HOME. */
export const osHomeDirectory: Effect.Effect<string> = Effect.sync(() => os.homedir());

/** Resolve the configured home, falling back to the OS account home. */
export const resolveUserHome = (): Effect.Effect<string, Config.ConfigError> =>
  Effect.gen(function* () {
    const configured = yield* configuredUserHome;
    return Option.getOrElse(configured, () => os.homedir());
  });

/** Pure path arithmetic shared by host integrations. */
export const resolveUserAxmHomePure = (
  pathJoin: (...segments: ReadonlyArray<string>) => string,
  homeDir: string,
): string => pathJoin(homeDir, AXM_DIR_NAME);

/** Resolve the AXM application home. */
export const resolveUserAxmHome = (): Effect.Effect<string, Config.ConfigError, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* resolveUserHome();
    return resolveUserAxmHomePure(path.join, home);
  });
