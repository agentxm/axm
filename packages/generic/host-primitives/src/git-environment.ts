/** Environment boundaries for Git processes targeting an explicitly selected repository. */
const localGitVariables = new Set([
  "GIT_EXEC_PATH",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_PREFIX",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_GRAFT_FILE",
  "GIT_SHALLOW_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_INTERNAL_SUPER_PREFIX",
  "GIT_CEILING_DIRECTORIES",
  "GIT_CONFIG",
]);

/**
 * Never let hook-local repository selectors redirect a child Git process.
 * Hooks also export GIT_EXEC_PATH. Drop that executable search override so
 * the selected Git binary uses its own helpers, without relaxing command guards.
 * GIT_CONFIG selects another repository's config file and is always removed.
 * Acquisition and release transport preserve command-level config (including CI HTTP auth headers,
 * credential helpers and URL rewrites). Local fixtures/index readers drop it.
 * Keep the counted config and its key/value pairs together; do not parse Git's
 * shell-quoted GIT_CONFIG_PARAMETERS encoding ourselves.
 */
export const withoutLocalGitEnvironment = (
  environment: Readonly<Record<string, string | undefined>>,
  options: { readonly preserveCommandConfig?: boolean } = {},
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        !localGitVariables.has(entry[0]) &&
        (options.preserveCommandConfig === true ||
          (entry[0] !== "GIT_CONFIG_PARAMETERS" &&
            entry[0] !== "GIT_CONFIG_COUNT" &&
            !/^GIT_CONFIG_(KEY|VALUE)_/.test(entry[0]))),
    ),
  );
