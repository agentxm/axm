/**
 * The user-level AXM application home (`~/.axm`), where the self-update
 * capability keeps its install metadata.
 *
 * `@agentxm/workspace-state` resolves the same directory for workspace
 * placement, but that package is `domain:core` and this capability is
 * `domain:supporting`, so the dependency cannot point that way. The rule is
 * one line of path arithmetic over the same two inputs (`AXM_USER_HOME`, else
 * the OS home directory), and both readers are covered by their own tests.
 */

import * as os from "node:os";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

/** Directory name of the AXM application home inside a user's home directory. */
export const AXM_DIR_NAME = ".axm";

const axmUserHomeConfig = Config.option(Config.String("AXM_USER_HOME"));

export const resolveUserAxmHomePure = (
  pathJoin: (...segments: ReadonlyArray<string>) => string,
  homeDir: string,
): string => pathJoin(homeDir, AXM_DIR_NAME);

/** Resolve `~/.axm`, honouring an `AXM_USER_HOME` override. */
export const resolveUserAxmHome = (): Effect.Effect<string, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    // eslint-disable-next-line no-restricted-syntax -- Optional string decoding is total, so failure would mean the Config provider violated its contract.
    const configuredHome = yield* Effect.orDie(axmUserHomeConfig);
    return resolveUserAxmHomePure(
      path.join,
      Option.getOrElse(configuredHome, () => os.homedir()),
    );
  });
