import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import {
  defineBoundEvidence,
  defineSpecification,
} from "@agentxm/extension-model/unstable/specifications";
import { unrecognizedOptions } from "../../support/parser-probe.js";

export const specification = defineSpecification({
  requirement: "system/process/release-preparation-validates-production-gates",
  title: "Release preparation validates production Registry gates without distribution",
  statement:
    "Release preparation shall preflight the production Registry before allocating candidate state and shall validate the exact generated candidate against the production Registry in preview-only mode, never applying a publication.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process", "trustworthy-distribution"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed task interface and the contributor-facing release guide show what the release-preparation entry point promises about the production Registry preflight and preview; the orchestration order and the preview publication contract are driven against a fake host by the bound tooling gate.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "A preview publication against the production Registry reports the same gate outcomes a real publication would enforce.",
    "The tooling test gate declared as bound evidence runs on every change through the required aggregate check.",
  ],
  openQuestions: [],
});

/**
 * The release-preparation and candidate orchestrations accept an injected
 * host, and the repository tooling tests drive them against fake ones,
 * asserting the observable order of effects and the preview publication
 * contract. Their results are evidence bound to this identity; the
 * specification remains the sole requirements authority.
 */
export const boundEvidence = defineBoundEvidence([
  {
    gate: "test: axm:test (scripts/release-prepare.tooling.test.ts)",
    verifies:
      "Drives release preparation against a fake host and checks that the production Registry preflight runs before any candidate state is allocated and stops preparation when it fails, that the exact generated candidate is previewed against the Registry only after versioning, changelog, and bundled-skill generation, and that the production preview publication targets the production Registry in verify-on-existing preview mode with no apply path.",
  },
]);

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

const readJsonRecord = (relativePath: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${relativePath} must contain a JSON object`);
  }
  return { ...parsed };
};

const child = (parent: Record<string, unknown>, key: string): Record<string, unknown> => {
  const value = parent[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`expected an object at ${key}`);
  }
  return { ...value };
};

describe("Release preparation Registry gates", () => {
  it.effect("both Registry previews use options accepted by the registered CLI", () =>
    Effect.gen(function* () {
      // Observe the repository script through its Bun host rather than import
      // repository tooling into the specifications project.
      const probe = spawnSync(
        "bun",
        [
          "--eval",
          `
        import { productionRegistryPreviewArgs } from "./scripts/release-shared.ts";
        console.log(JSON.stringify([
          productionRegistryPreviewArgs(),
          productionRegistryPreviewArgs("/tmp/axm-released"),
        ]));
      `,
        ],
        { cwd: repoRoot, encoding: "utf8" },
      );
      expect(probe.status, probe.stderr).toBe(0);
      const previews = Schema.decodeUnknownSync(Schema.Array(Schema.Array(Schema.String)))(
        JSON.parse(probe.stdout),
      );
      expect(previews).toHaveLength(2);
      for (const preview of previews) {
        // The probe adds an unregistered sentinel so parsing cannot reach a
        // handler, the filesystem, credentials, or the production Registry.
        const argv = preview.slice(1);
        expect(yield* unrecognizedOptions(argv)).toEqual([]);
      }
    }),
  );

  it.effect("the preflight and the exact preview never replay a cached result", () =>
    Effect.sync(() => {
      const targets = child(readJsonRecord("project.json"), "targets");
      // A cached task result would skip the production Registry preflight or
      // the exact candidate preview; both targets are declared uncacheable.
      expect(child(targets, "release-prepare")["cache"]).toBe(false);
      expect(child(targets, "release-prepare-candidate")["cache"]).toBe(false);
    }),
  );

  it.effect(
    "the release guide promises a production Registry preflight before candidate state and an exact preview without publication",
    () =>
      Effect.sync(() => {
        const guide = fs
          .readFileSync(path.join(repoRoot, "contributing", "guides", "releasing.md"), "utf8")
          .replace(/\s+/g, " ")
          .toLowerCase();
        expect(guide).toContain("verify production registry authentication");
        expect(guide).toContain("no candidate state exists yet");
        expect(guide).toContain("exact production registry preview");
        expect(guide).toContain(
          "removes it without committing, pushing, opening a pull request, or publishing",
        );
      }),
  );
});
