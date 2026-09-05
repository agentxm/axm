import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/process/public-artifacts-protect-private-context",
  title: "Repository-authored tracked content references no private coordination context",
  statement:
    "Repository-authored tracked text content in the public AXM repository shall not reference the private work tracker or the private platform repository, so public artifacts carry no private coordination context.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "Only the tracked file set reported by git and the committed text content can show whether public artifacts reference private context.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "Installed extension content under agent_extensions/ is published extension content that AXM manages and the Registry governs, not a repository-authored artifact; the obligation and its scan cover repository-authored content only.",
  ],
  openQuestions: [],
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

/**
 * The one tracked subtree outside the obligation: installed extension content
 * that AXM manages and the Registry governs. It is published extension
 * content, not a repository-authored artifact, so the scan names and excludes
 * it explicitly.
 */
const INSTALLED_EXTENSION_CONTENT_PREFIX = "agent_extensions/";

const isRepositoryAuthored = (file: string): boolean =>
  !file.startsWith(INSTALLED_EXTENSION_CONTENT_PREFIX);

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
  it.effect(
    "no repository-authored tracked text file references private tracker or private repository context",
    () =>
      Effect.sync(() => {
        const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
          .split("\n")
          .filter(
            (file) =>
              file.length > 0 &&
              TEXT_EXTENSIONS.has(path.extname(file)) &&
              isRepositoryAuthored(file),
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
