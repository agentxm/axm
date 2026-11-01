import { withoutLocalGitEnvironment } from "@agentxm/host-primitives";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { captureReleaseCommand, releaseValidation } from "./release-process.js";

export const foreignGitEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv =>
  // Foreign release repositories still need the caller's CI transport credentials.
  withoutLocalGitEnvironment(environment, { preserveCommandConfig: true });

/** Compare canonical paths so symlinked temporary directories retain their identity. */
export const requireForeignGitRoot = Effect.fnUntraced(function* (
  cwd: string,
  expectedRoot: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const env = foreignGitEnvironment(environment);
  const topLevel = yield* fs.realPath(
    path.resolve(
      yield* captureReleaseCommand("git", ["rev-parse", "--show-toplevel"], { cwd, env }),
    ),
  );
  const expected = yield* fs.realPath(path.resolve(expectedRoot));
  const commonValue = yield* captureReleaseCommand("git", ["rev-parse", "--git-common-dir"], {
    cwd,
    env,
  });
  const common = yield* fs.realPath(path.resolve(cwd, commonValue));
  return yield* releaseValidation("Validate foreign Git root", () => {
    if (topLevel !== expected)
      throw new Error(`Foreign Git root mismatch: expected ${expected}, observed ${topLevel}.`);
    const commonRelative = path.relative(expected, common);
    if (commonRelative.startsWith("..") || path.isAbsolute(commonRelative))
      throw new Error(`Foreign Git common directory escapes ${expected}: ${common}.`);
  });
});
