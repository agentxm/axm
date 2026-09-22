import * as Option from "effect/Option";
import { describe, expect, it, vi } from "@effect/vitest";
import type { GitHostedSkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { extensionName, handle } from "../resolution/sources/test-helpers.js";
import { sourceRefContentKey } from "./acquired-content.js";

describe("sourceRefContentKey", () => {
  it("separates Git content acquired under different transport contexts", () => {
    const ref: GitHostedSkillRef = {
      type: "skill",
      refType: "git-hosted",
      owner: handle("@acme"),
      name: extensionName("example"),
      skill: {
        name: extensionName("example"),
        description: Option.none(),
        metadata: Option.none(),
      },
      source: {
        type: "git",
        url: new URL("https://example.com/repository.git"),
        ref: Option.none(),
        subPath: Option.none(),
      },
      location: "file:///tmp/acquired-example",
      gitTreeSha: "tree-1",
      gitCommitSha: "commit-1",
    };

    try {
      vi.stubEnv("AXM_ACQUISITION_KEY_TEST", "context-one");
      const first = sourceRefContentKey(ref);
      expect(sourceRefContentKey(ref)).toBe(first);

      vi.stubEnv("AXM_ACQUISITION_KEY_TEST", "context-two");
      expect(sourceRefContentKey(ref)).not.toBe(first);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
