import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "system/process/public-artifacts-protect-private-context",
  title: "Repository-authored content and history reference no private coordination context",
  statement:
    "Repository-authored tracked text content and new commit messages in the public AXM repository shall not reference the private work tracker or the private platform repository, so public artifacts carry no private coordination context.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "Only the tracked file set and commit graph reported by git can show whether public artifacts reference private context.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "Installed extension content under agent_extensions/ is published extension content that AXM manages and the Registry governs, not a repository-authored artifact; the obligation and its scan cover repository-authored content only.",
  ],
  openQuestions: [],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

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

const TRACKER_PREFIX = ["A", "XM"].join("");
const TRACKER_IDENTIFIER = new RegExp(`${TRACKER_PREFIX}-[0-9]+`, "g");

/**
 * Exact references that predate this guard. Changelog entries preserve their
 * published history; the remaining two are old fixtures. Any new path or
 * identifier must be removed rather than added here.
 */
const EXISTING_TRACKED_IDENTIFIERS = new Set([
  ...[1588, 985, 203, 204, 205, 206].map(
    (number) => `CHANGELOG.md:${TRACKER_PREFIX}-${String(number)}`,
  ),
  `packages/core/workspace/src/desired-state/workspace/desired-state-graph.test.ts:${TRACKER_PREFIX}-1268`,
  `scripts/parity-ledger-check.test.ts:${TRACKER_PREFIX}-985`,
]);

/**
 * The two public histories that existed when this guard was introduced: the
 * target branch and the reviewed terminal-work branch. The guard scans every
 * commit added beyond both, so it remains effective before and after squash.
 */
const COMMIT_MESSAGE_BASELINES = [
  "681db72976f8f42e22788431c7ee1ec667c46c58",
  "b88897b04b58c2c91a7e91fa4f72f06413815937",
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
          for (const identifier of content.match(TRACKER_IDENTIFIER) ?? []) {
            const finding = `${file}:${identifier}`;
            if (!EXISTING_TRACKED_IDENTIFIERS.has(finding)) findings.push(finding);
          }
        }
        expect(findings).toEqual([]);
      }),
  );

  it.effect("new commit messages contain no private tracker identifiers", () =>
    Effect.sync(() => {
      const messages = execFileSync(
        "git",
        ["log", "--format=%H%x09%B%x00", "HEAD", "--not", ...COMMIT_MESSAGE_BASELINES],
        { cwd: repoRoot, encoding: "utf8" },
      );
      const findings = messages
        .split("\0")
        .filter((message) => message.match(TRACKER_IDENTIFIER) !== null)
        .map((message) => message.slice(0, 40));
      expect(findings).toEqual([]);
    }),
  );
});
