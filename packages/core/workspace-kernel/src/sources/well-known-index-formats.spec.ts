import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { MAX_ARCHIVE_ENTRIES } from "@agentxm/registry-client";
import { defineSpecification } from "@agentxm/specification-metadata";
import { parseWellKnownIndex, WELL_KNOWN_SCHEMA } from "./index.js";

export const specification = defineSpecification({
  requirement: "extensions/discovery/well-known-index-formats",
  title: "Well-known discovery distinguishes artifact digests from legacy file lists",
  statement:
    "AXM shall interpret the v0.2 discovery schema as single-artifact entries with required SHA-256 digests, resolve artifact URLs against the index URL, and support deployed v0.1 file inventories without inventing publisher digests. Unknown fields and unsupported entry types shall not prevent supported v0.2 entries from discovery; unknown schema versions, unsafe operational paths, duplicate entry names, and indexes exceeding the acquisition entry budget shall be refused before payload acquisition.",
  class: "functional",
  role: "supporting",
  goals: ["extension-adoption", "trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const indexUrl = new URL("https://example.com/.well-known/agent-skills/index.json");
const digest = `sha256:${"a".repeat(64)}`;

describe("Well-known index decoding", () => {
  it.effect("keeps v0.2 artifact identity and resolves relative and cross-origin URLs", () =>
    Effect.gen(function* () {
      const offers = yield* parseWellKnownIndex(
        encode({
          $schema: WELL_KNOWN_SCHEMA,
          unknown: true,
          skills: [
            {
              name: "Review Display",
              description: 42,
              type: "skill-md",
              url: "review/SKILL.md",
              digest,
              custom: "preserved upstream",
            },
            {
              name: "bundle",
              type: "archive",
              url: "https://cdn.example.com/bundle.tar.gz",
              digest,
            },
            { name: "future", type: "unknown", metadata: {} },
          ],
        }),
        indexUrl,
      );
      expect(offers).toHaveLength(2);
      expect(offers[0]).toMatchObject({
        name: "Review Display",
        format: "skill-md",
        artifacts: [{ digest }],
      });
      expect(offers[0]?.artifacts[0]?.url.href).toBe(
        "https://example.com/.well-known/agent-skills/review/SKILL.md",
      );
      expect(offers[1]?.artifacts[0]?.url.href).toBe("https://cdn.example.com/bundle.tar.gz");
    }),
  );

  it.effect("retains v0.1 supporting-file coordinates without inventing a declared digest", () =>
    Effect.gen(function* () {
      const offers = yield* parseWellKnownIndex(
        encode({
          version: "1.0",
          skills: [{ name: "review", files: ["SKILL.md", "assets/template.md"] }],
        }),
        new URL("https://example.com/.well-known/skills/index.json"),
      );
      expect(offers[0]).toMatchObject({ name: "review", format: "files" });
      expect(
        offers[0]?.artifacts.map((artifact) => ({
          url: artifact.url.href,
          path: artifact.path,
          digest: artifact.digest,
        })),
      ).toEqual([
        {
          url: "https://example.com/.well-known/skills/review/SKILL.md",
          path: "SKILL.md",
          digest: undefined,
        },
        {
          url: "https://example.com/.well-known/skills/review/assets/template.md",
          path: "assets/template.md",
          digest: undefined,
        },
      ]);
    }),
  );

  for (const [label, value] of [
    [
      "duplicate legacy entry",
      {
        skills: [
          { name: "x", files: ["SKILL.md"] },
          { name: "x", files: ["SKILL.md"] },
        ],
      },
    ],
    [
      "duplicate current entry",
      {
        $schema: WELL_KNOWN_SCHEMA,
        skills: [
          { name: "x", type: "skill-md", url: "one/SKILL.md", digest },
          { name: "x", type: "archive", url: "two.zip", digest },
        ],
      },
    ],
    ["unknown schema", { $schema: "https://example.com/future", skills: [] }],
    [
      "missing digest",
      { $schema: WELL_KNOWN_SCHEMA, skills: [{ name: "x", type: "skill-md", url: "SKILL.md" }] },
    ],
    [
      "protocol downgrade",
      {
        $schema: WELL_KNOWN_SCHEMA,
        skills: [{ name: "x", type: "archive", url: "http://example.com/x.zip", digest }],
      },
    ],
    ["legacy traversal", { skills: [{ name: "x", files: ["SKILL.md", "../outside"] }] }],
    ["legacy directory escape", { skills: [{ name: "..", files: ["SKILL.md"] }] }],
    ["missing payload", { skills: [{ name: "x", files: ["other.md"] }] }],
  ] as const) {
    it.effect(`refuses ${label}`, () =>
      Effect.gen(function* () {
        const failure = yield* parseWellKnownIndex(encode(value), indexUrl).pipe(Effect.flip);
        expect(failure).toMatchObject({ _tag: "SourceNotResolvable", category: "validation" });
      }),
    );
  }
  it.effect("bounds offers and the aggregate legacy file inventory", () =>
    Effect.gen(function* () {
      const supported = { name: "review", type: "skill-md", url: "SKILL.md", digest };
      const offers = yield* parseWellKnownIndex(
        encode({
          $schema: WELL_KNOWN_SCHEMA,
          skills: Array.from({ length: MAX_ARCHIVE_ENTRIES }, (_, index) => ({
            ...supported,
            name: `skill-${index}`,
          })),
        }),
        indexUrl,
      );
      expect(offers).toHaveLength(MAX_ARCHIVE_ENTRIES);
      for (const skills of [
        Array.from({ length: MAX_ARCHIVE_ENTRIES + 1 }, (_, index) => ({
          ...supported,
          name: `skill-${index}`,
        })),
        [
          {
            name: "one",
            files: [
              "SKILL.md",
              ...Array.from({ length: MAX_ARCHIVE_ENTRIES - 1 }, (_, index) => `file-${index}`),
            ],
          },
          { name: "two", files: ["SKILL.md"] },
        ],
      ]) {
        const failure = yield* parseWellKnownIndex(encode({ skills }), indexUrl).pipe(Effect.flip);
        expect(failure).toMatchObject({ _tag: "SourceNotResolvable", category: "validation" });
        expect(failure.detail).toContain("count");
      }
    }),
  );
});
