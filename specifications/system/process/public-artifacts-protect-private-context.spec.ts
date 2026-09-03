import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/process/public-artifacts-protect-private-context",
  title: "Tracked repository content references no private coordination context",
  statement:
    "Tracked text content in the public AXM repository shall not reference the private work tracker or the private platform repository, so public artifacts carry no private coordination context.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process"],
  status: "accepted",
  boundary: "repository",
  boundaryRationale:
    "Only the tracked file set reported by git and the committed text content can show whether public artifacts reference private context.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Tracked content under agent_extensions is exempt from the check without a recorded reason for the exemption.",
  ],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

/**
 * Markers whose appearance in tracked public content would leak private
 * coordination context: the private tracker workspace and the private
 * platform repository. Joined at runtime so this specification never matches
 * itself.
 */
const PRIVATE_CONTEXT_MARKERS = [
  ["linear.app", "agentxm"].join("/"),
  ["github.com", "agentxm", "agentxm-internal"].join("/"),
];

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".cmd",
  ".json",
  ".jsonc",
  ".md",
  ".mjs",
  ".mts",
  ".ps1",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

describe("Private context stays out of public artifacts", () => {
  it.effect("no tracked text file references private tracker or private repository context", () =>
    Effect.sync(() => {
      const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
        .split("\n")
        .filter(
          (file) =>
            file.length > 0 &&
            TEXT_EXTENSIONS.has(path.extname(file)) &&
            !file.startsWith("agent_extensions/"),
        );

      const findings: string[] = [];
      for (const file of tracked) {
        const filePath = path.join(repoRoot, file);
        if (!fs.existsSync(filePath)) {
          continue;
        }
        const content = fs.readFileSync(filePath, "utf8");
        for (const marker of PRIVATE_CONTEXT_MARKERS) {
          if (content.includes(marker)) {
            findings.push(`${file}: ${marker}`);
          }
        }
      }
      expect(findings).toEqual([]);
    }),
  );
});
