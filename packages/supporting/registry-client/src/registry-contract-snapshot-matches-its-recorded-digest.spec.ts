import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "registry-client/contract-snapshot-matches-its-recorded-digest",
  title: "The tracked Registry contract matches its recorded digest",
  statement:
    "The tracked Registry contract document shall be stored in its canonical form, two-space indented JSON followed by a newline, and its SHA-256 digest shall equal the digest recorded beside it, so the contract the client is generated from can be compared with the contract a Registry serves.",
  class: "constraint",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed contract snapshot and the committed digest record show which Registry contract the public client was generated from.",
  methods: ["contract"],
  derivedFrom: ["packages/supporting/registry-client/scripts/sync-registry-spec.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const snapshotPath = fileURLToPath(new URL("../specs/registry-openapi.json", import.meta.url));
const digestPath = fileURLToPath(new URL("../specs/registry-openapi.sha256", import.meta.url));

describe("The Registry contract snapshot", () => {
  it.effect("is stored in canonical form", () =>
    Effect.sync(() => {
      const text = fs.readFileSync(snapshotPath, "utf8");
      const document: unknown = JSON.parse(text);
      expect(text).toBe(`${JSON.stringify(document, undefined, 2)}\n`);
    }),
  );

  it.effect("hashes to the recorded digest", () =>
    Effect.sync(() => {
      const recorded = fs.readFileSync(digestPath, "utf8");
      expect(recorded).toMatch(/^[0-9a-f]{64}\n$/);
      const digest = createHash("sha256").update(fs.readFileSync(snapshotPath)).digest("hex");
      expect(digest).toBe(recorded.trim());
    }),
  );
});
