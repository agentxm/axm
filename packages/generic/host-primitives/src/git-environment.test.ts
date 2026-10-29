import { describe, expect, it } from "@effect/vitest";
import { withoutLocalGitEnvironment } from "./git-environment.js";

describe("Git child environment", () => {
  const selectors = [
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
    "GIT_CONFIG",
  ];
  const commandConfig = {
    GIT_CONFIG_PARAMETERS: "'http.extraHeader=Authorization: fixture'",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_VALUE_0: "fixture-helper",
  };
  const transport = { PATH: "/tools", SSH_AUTH_SOCK: "/agent", HTTPS_PROXY: "proxy" };
  const input: Readonly<Record<string, string>> = {
    ...Object.fromEntries(selectors.map((key) => [key, "caller"])),
    ...commandConfig,
    ...transport,
  };

  it("removes repository and command configuration for isolated local commands without mutating the caller", () => {
    expect(withoutLocalGitEnvironment(input)).toEqual(transport);
    expect(input["GIT_CONFIG_COUNT"]).toBe("1");
    expect(input["GIT_DIR"]).toBe("caller");
  });

  it("preserves complete command configuration for acquisition but never repository selectors", () => {
    expect(withoutLocalGitEnvironment(input, { preserveCommandConfig: true })).toEqual({
      ...commandConfig,
      ...transport,
    });
  });
});
