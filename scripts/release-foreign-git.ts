import { isAbsolute, relative, resolve } from "node:path";
import { withoutLocalGitEnvironment } from "@agentxm/host-primitives";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { captureReleaseCommand, releaseValidation } from "./release-process.js";

export const foreignGitEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv =>
  // Foreign release repositories still need the caller's CI transport credentials.
  withoutLocalGitEnvironment(environment, { preserveCommandConfig: true });

/** Compare canonical paths so symlinked temporary directories retain their identity. */
export const requireForeignGitRoot = (
  cwd: string,
  expectedRoot: string,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const env = foreignGitEnvironment(environment);
    const topLevel = yield* fs.realPath(
      resolve(yield* captureReleaseCommand("git", ["rev-parse", "--show-toplevel"], { cwd, env })),
    );
    const expected = yield* fs.realPath(resolve(expectedRoot));
    const commonValue = yield* captureReleaseCommand("git", ["rev-parse", "--git-common-dir"], {
      cwd,
      env,
    });
    const common = yield* fs.realPath(resolve(cwd, commonValue));
    return yield* releaseValidation("Validate foreign Git root", () => {
      if (topLevel !== expected)
        throw new Error(`Foreign Git root mismatch: expected ${expected}, observed ${topLevel}.`);
      const commonRelative = relative(expected, common);
      if (commonRelative.startsWith("..") || isAbsolute(commonRelative))
        throw new Error(`Foreign Git common directory escapes ${expected}: ${common}.`);
    });
  });
