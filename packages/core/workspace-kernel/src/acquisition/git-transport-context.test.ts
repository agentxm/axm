import { afterEach, expect, it, vi } from "@effect/vitest";
import { gitTransportContextFingerprint } from "./git-transport-context.js";

afterEach(() => vi.unstubAllEnvs());

it("keys acquisition by forwarded transport configuration rather than the caller's repository", () => {
  const original = gitTransportContextFingerprint();
  vi.stubEnv("GIT_DIR", "/caller/.git/worktrees/linked");
  vi.stubEnv("GIT_INDEX_FILE", "/caller/index");
  vi.stubEnv("GIT_EXEC_PATH", "/caller/helpers");
  expect(gitTransportContextFingerprint()).toBe(original);
  vi.stubEnv("GIT_CONFIG_COUNT", "1");
  vi.stubEnv("GIT_CONFIG_KEY_0", "http.extraHeader");
  vi.stubEnv("GIT_CONFIG_VALUE_0", "Authorization: fixture");
  expect(gitTransportContextFingerprint()).not.toBe(original);
});
