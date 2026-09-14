import { expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import type { GitHostedSkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";

import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { gitHostedSkillArtifactSource } from "./artifact.js";

it("reports the Git source identity, selected directory and accepted tree", () => {
  const ref: GitHostedSkillRef = {
    type: "skill",
    refType: "git-hosted",
    name: decodeExtensionNameSync("quality"),
    owner: decodeHandleSync("@qualitymd"),
    source: {
      type: "github",
      name: "github",
      url: new URL("https://github.com"),
      owner: "qualitymd",
      repo: "quality.md",
      ref: Option.some("main"),
      subPath: Option.none(),
    },
    location: "file:///cache/quality.md/skills/quality",
    sourcePath: "skills/quality",
    gitCommitSha: "7f4a7c95d3f54f55a2e9306fc66f830f9ea219e1",
    gitTreeSha: "2ade2ca678e5f91a7d4dd31e74e84d1bcc3986eb",
    skill: {
      name: decodeExtensionNameSync("quality"),
      description: Option.none(),
      metadata: Option.none(),
    },
  };
  expect(gitHostedSkillArtifactSource(ref)).toEqual({
    type: "github",
    origin: "https://github.com/qualitymd/quality.md",
    ref: "main",
    directory: "skills/quality",
    gitTreeHash: ref.gitTreeSha,
  });
});
