/** Platform cache placement shared by all non-authoritative AXM caches. */

import * as os from "node:os";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

export interface AxmCacheEnvironment {
  readonly axmUserHome?: string;
  readonly localAppData?: string;
  readonly xdgCacheHome?: string;
}

const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value.length === 0 ? undefined : value;

export const resolveAxmCacheRootPure = (
  pathJoin: (...segments: ReadonlyArray<string>) => string,
  platform: string,
  homeDir: string,
  environment: AxmCacheEnvironment,
): string => {
  const overriddenHome = nonEmpty(environment.axmUserHome);
  const home = overriddenHome ?? homeDir;

  if (platform === "darwin") return pathJoin(home, "Library", "Caches", "axm");

  if (platform === "win32") {
    const cacheHome =
      overriddenHome === undefined
        ? (nonEmpty(environment.localAppData) ?? pathJoin(home, "AppData", "Local"))
        : pathJoin(home, "AppData", "Local");
    return pathJoin(cacheHome, "axm", "cache");
  }

  const cacheHome =
    overriddenHome === undefined
      ? (nonEmpty(environment.xdgCacheHome) ?? pathJoin(home, ".cache"))
      : pathJoin(home, ".cache");
  return pathJoin(cacheHome, "axm");
};

const cacheEnvironmentConfig = Config.all({
  axmUserHome: Config.option(Config.string("AXM_USER_HOME")),
  localAppData: Config.option(Config.string("LOCALAPPDATA")),
  xdgCacheHome: Config.option(Config.string("XDG_CACHE_HOME")),
});

export const resolveAxmCacheRoot = (): Effect.Effect<string, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    // All fields are optional strings; failure would violate the provider contract.
    // eslint-disable-next-line no-restricted-syntax -- Config cannot fail for an all-optional record.
    const environment = yield* Effect.orDie(cacheEnvironmentConfig);
    const axmUserHome = Option.getOrUndefined(environment.axmUserHome);
    const localAppData = Option.getOrUndefined(environment.localAppData);
    const xdgCacheHome = Option.getOrUndefined(environment.xdgCacheHome);
    return resolveAxmCacheRootPure(path.join, process.platform, os.homedir(), {
      ...(axmUserHome === undefined ? {} : { axmUserHome }),
      ...(localAppData === undefined ? {} : { localAppData }),
      ...(xdgCacheHome === undefined ? {} : { xdgCacheHome }),
    });
  });
