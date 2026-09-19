import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import YAML from "yaml";

import {
  CHECKSUM_MANIFEST,
  EXPECTED_BINARY_ASSETS,
  EXPECTED_CONTENT_ASSETS,
  EXPECTED_RELEASE_ASSETS,
  validateReleaseAssets,
} from "./release-checksums.js";
import { produceReleaseContent } from "./release-content.js";
import { readReleaseWorkflow } from "./release-workflow-graph.js";

export const specification = defineSpecification({
  requirement: "system/process/release-cohort-includes-site-content",
  title: "Release cohort includes public site content",
  statement:
    "Each stable release shall publish the four installer documents, the generated agent catalog and CLI reference, and ten generated JSON Schemas as immutable GitHub Release assets from the exact release commit, in addition to the five native binaries and their binaries-only SHA256SUMS manifest, and shall reject any undeclared release asset.",
  class: "process",
  role: "supporting",
  goals: ["trustworthy-distribution", "dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "The committed CI and publication workflows define the exact producer, artifact inventory, and immutable GitHub Release publication path.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "The generated agent catalog, CLI reference, schemas, and installer documents in the release commit are the content intended for that release.",
  ],
  openQuestions: [],
});

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

describe("Release site-content cohort", () => {
  it.effect("stages exactly sixteen content assets from the release checkout", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "axm-release-site-content-"))),
      (directory) =>
        Effect.sync(() => {
          produceReleaseContent(repositoryRoot, directory);
          for (const name of EXPECTED_BINARY_ASSETS) {
            writeFileSync(join(directory, name), `binary:${name}`, "utf8");
          }
          const checksums = [...EXPECTED_BINARY_ASSETS]
            .sort()
            .map(
              (name) => `${createHash("sha256").update(`binary:${name}`).digest("hex")}  ${name}`,
            )
            .join("\n");
          writeFileSync(join(directory, CHECKSUM_MANIFEST), `${checksums}\n`, "utf8");

          expect(EXPECTED_CONTENT_ASSETS).toHaveLength(16);
          expect(EXPECTED_RELEASE_ASSETS).toHaveLength(22);
          expect(validateReleaseAssets(directory)).toEqual({
            assetCount: 22,
            binaryCount: 5,
            contentCount: 16,
          });
          expect(readFileSync(join(directory, CHECKSUM_MANIFEST), "utf8")).not.toContain(
            "schema.json",
          );
        }),
      (directory) => Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    ),
  );

  it.effect("produces one exact-commit CI artifact and downloads it before publication", () =>
    Effect.sync(() => {
      const ci: unknown = YAML.parse(
        readFileSync(join(repositoryRoot, ".github/workflows/ci.yml"), "utf8"),
      );
      const serializedCi = JSON.stringify(ci);
      expect(serializedCi).toContain("axm:produce-release-content");
      expect(serializedCi).toContain("axm-release-content-${{ github.sha }}");

      const release = readReleaseWorkflow().jobs["release"];
      expect(release?.steps.some((step) => step.run?.includes("axm:download-ci-artifacts"))).toBe(
        true,
      );
      const distributor = readFileSync(
        join(repositoryRoot, "scripts/distribute-release.ts"),
        "utf8",
      );
      expect(distributor).toContain("EXPECTED_RELEASE_ASSETS.map");
      expect(distributor).toContain("publishImmutableCohort");
    }),
  );
});
