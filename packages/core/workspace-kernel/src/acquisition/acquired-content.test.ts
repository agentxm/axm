import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { selectAcquisitionQueue } from "./acquisition-queue.js";
import * as Option from "effect/Option";
import { describe, expect, it, vi } from "@effect/vitest";
import type { GitHostedSkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { extensionName, handle } from "../workspace-state/testing.js";
import { AcquiredContent, acquiredFilesForRef, sourceRefContentKey } from "./acquired-content.js";

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

const pluginSkill = (name: string): GitHostedSkillRef => ({
  type: "skill",
  refType: "git-hosted",
  name: extensionName(name),
  skill: { name: extensionName(name), description: Option.none(), metadata: Option.none() },
  source: {
    type: "git",
    url: new URL("https://github.com/acme/plugin.git"),
    ref: Option.none(),
    subPath: Option.none(),
  },
  location: `file:///tmp/discovered/skills/${name}`,
  sourcePath: `skills/${name}`,
  gitTreeSha: "package-tree",
  gitCommitSha: "accepted-commit",
  distribution: { format: "claude", packageRoot: ".", componentPath: `skills/${name}` },
  portable: true,
});

describe("retained package acquisition", () => {
  it("captures sibling selections once without mixing snapshots or package boundaries", () => {
    const first = pluginSkill("first");
    const second = pluginSkill("second");
    expect(sourceRefContentKey(first)).toBe(sourceRefContentKey(second));
    expect(selectAcquisitionQueue([first, second])).toEqual({ type: "ready", refs: [first] });
    for (const different of [
      { ...second, gitCommitSha: "next-commit" },
      { ...second, gitTreeSha: "other-tree" },
      {
        ...second,
        distribution: {
          format: "claude" as const,
          packageRoot: "nested",
          componentPath: "skills/second",
        },
      },
    ]) {
      expect(sourceRefContentKey(different)).not.toBe(sourceRefContentKey(first));
      expect(selectAcquisitionQueue([first, different])).toEqual({
        type: "ready",
        refs: [first, different],
      });
    }
  });

  it.effect("returns each selected component within the same captured package", () => {
    const first = pluginSkill("first");
    const second = pluginSkill("second");
    const key = sourceRefContentKey(first);
    return Effect.gen(function* () {
      const selected = yield* acquiredFilesForRef(second, "remote");
      expect(Option.getOrThrow(selected)).toEqual({
        directory: "/tmp/captured/skills/second",
        packageDirectory: "/tmp/captured",
        componentPath: "skills/second",
      });
    }).pipe(
      Effect.provideService(AcquiredContent, {
        requestedKeys: new Set([key]),
        filesByKey: new Map([
          [
            key,
            {
              directory: "/tmp/captured/skills/first",
              packageDirectory: "/tmp/captured",
              componentPath: "skills/first",
            },
          ],
        ]),
        failuresByKey: new Map(),
      }),
      Effect.provide(NodeServices.layer),
    );
  });
});
