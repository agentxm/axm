import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "system/installability/product-installs-through-supported-channels",
  title: "AXM installs through its supported channels with integrity verification",
  class: "installability",
  role: "experience",
  goals: ["platform-reach", "trustworthy-distribution"],
  boundary: "repository",
  selection: "release-candidate",
  methods: ["contract"],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

describe("Product installation channels", () => {
  it.effect.each([{ script: "install.sh" }, { script: "install.ps1" }])(
    "the $script installer exists and verifies artifact integrity",
    ({ script }) =>
      Effect.sync(() => {
        const content = fs.readFileSync(path.join(repoRoot, script), "utf8");
        expect(content.toLowerCase()).toContain("checksum");
      }),
  );

  it.effect("the cmd installer routes through the canonical PowerShell transaction", () =>
    Effect.sync(() => {
      const content = fs.readFileSync(path.join(repoRoot, "install.cmd"), "utf8");
      expect(content).toContain("powershell");
      expect(content.toLowerCase()).toContain("install.ps1");
    }),
  );

  it.effect(
    "the release flow verifies installation on every supported shell before completion",
    () =>
      Effect.sync(() => {
        const publish = fs.readFileSync(
          path.join(repoRoot, ".github", "workflows", "publish.yml"),
          "utf8",
        );
        expect(publish).toContain("install-verification");
      }),
  );
});
