import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/compatibility/supported-platform-matrix",
  title: "Every supported platform and shell receives release-blocking verification",
  statement:
    "Every supported operating system, architecture, and installer shell shall receive release-blocking verification, and Windows workspace behavior shall be verified on a real Windows runner.",
  class: "quality",
  characteristic: "compatibility",
  role: "supporting",
  goals: ["platform-reach"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed ci.yml and publish.yml workflow files show which platforms, shells, and runners the release-blocking verification covers.",
  methods: ["contract"],
  selection: "platform-matrix",
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "A job named in the workflow files blocks its merge or release rather than running as an advisory check.",
  ],
  openQuestions: [],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

/** The supported binary targets AXM promises. */
const SUPPORTED_BINARIES = [
  "axm-linux-x64",
  "axm-linux-arm64",
  "axm-darwin-arm64",
  "axm-darwin-x64",
  "axm-windows-x64.exe",
] as const;

/** The supported installer shells. */
const SUPPORTED_SHELLS = ["bash", "powershell", "cmd"] as const;

describe("Supported platform matrix", () => {
  it.effect("binary verification covers every supported operating system and architecture", () =>
    Effect.sync(() => {
      const ci = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
      for (const binary of SUPPORTED_BINARIES) {
        expect(ci).toContain(binary);
      }
    }),
  );

  it.effect("installed-product verification covers every supported shell", () =>
    Effect.sync(() => {
      const publish = fs.readFileSync(
        path.join(repoRoot, ".github", "workflows", "publish.yml"),
        "utf8",
      );
      for (const shell of SUPPORTED_SHELLS) {
        expect(publish).toContain(shell);
      }
    }),
  );

  it.effect("Windows workspace behavior runs on a real Windows runner", () =>
    Effect.sync(() => {
      const ci = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
      expect(ci).toContain("windows-latest");
      expect(ci).toContain("test-windows");
    }),
  );
});
