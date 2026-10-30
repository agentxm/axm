import { execFileSync } from "node:child_process";

// The external E2E harness cannot import product source. Ask the installed Git
// for its repository-local keys instead of maintaining a second product list.
// Resolve once before tests replace PATH/HOME with isolated fixture toolchains.
const localGitVariables = new Set(
  execFileSync("git", ["rev-parse", "--local-env-vars"], {
    encoding: "utf8",
    env: Object.fromEntries(
      // eslint-disable-next-line no-restricted-properties -- Discover Git metadata using the parent toolchain
      Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
    ),
  })
    .trim()
    .split("\n"),
);

// Hooks also override helper lookup. Discovery limits are not in Git's local
// list, but must not constrain repositories created by the fixture either.
for (const key of ["GIT_EXEC_PATH", "GIT_CEILING_DIRECTORIES", "GIT_INTERNAL_SUPER_PREFIX"]) {
  localGitVariables.add(key);
}

export const withoutLocalGitEnvironment = (
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        !localGitVariables.has(entry[0]) &&
        !/^GIT_CONFIG_(KEY|VALUE)_/.test(entry[0]),
    ),
  );
