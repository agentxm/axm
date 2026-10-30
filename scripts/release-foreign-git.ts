import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { withoutLocalGitEnvironment } from "@agentxm/host-primitives";
import { captureIn } from "./release-command.js";

export const foreignGitEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv =>
  // Foreign release repositories still need the caller's CI transport credentials.
  withoutLocalGitEnvironment(environment, { preserveCommandConfig: true });

/**
 * A directory's identity is its canonical path. Git reports canonical paths,
 * while callers hold the path they built: `mkdtempSync(join(tmpdir(), …))`
 * yields `/var/folders/…` for a directory Git names `/private/var/folders/…`.
 * `resolve` normalizes separators and `..` segments but does not follow
 * symbolic links, so both sides must be canonicalized before comparison or a
 * symlinked temporary root reads as a foreign checkout.
 */
const canonicalPath = (value: string): string => realpathSync(resolve(value));

export const requireForeignGitRoot = (
  cwd: string,
  expectedRoot: string,
  environment: NodeJS.ProcessEnv = process.env,
): void => {
  const env = foreignGitEnvironment(environment);
  const topLevel = canonicalPath(captureIn(cwd, "git", ["rev-parse", "--show-toplevel"], env));
  const expected = canonicalPath(expectedRoot);
  if (topLevel !== expected)
    throw new Error(`Foreign Git root mismatch: expected ${expected}, observed ${topLevel}.`);
  const commonValue = captureIn(cwd, "git", ["rev-parse", "--git-common-dir"], env);
  const common = canonicalPath(resolve(cwd, commonValue));
  const commonRelative = relative(expected, common);
  if (commonRelative.startsWith("..") || isAbsolute(commonRelative))
    throw new Error(`Foreign Git common directory escapes ${expected}: ${common}.`);
};
