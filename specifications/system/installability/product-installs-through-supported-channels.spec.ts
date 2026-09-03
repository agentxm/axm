import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/installability/product-installs-through-supported-channels",
  title: "AXM installs through its supported channels with integrity verification",
  statement:
    "AXM shall install through its supported bash, PowerShell, and cmd installers, each verifying artifact integrity by checksum.",
  class: "quality",
  characteristic: "installability",
  role: "experience",
  goals: ["platform-reach", "trustworthy-distribution"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed installer scripts show which install channels exist and that each verifies artifact integrity by checksum; the installed execution bound to this requirement shows that they install a working product.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
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
});
