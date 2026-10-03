import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import { normalizePublishInput } from "../index.js";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import { buildZip, textContent } from "./test-zip-helpers.js";

export const specification = defineSpecification({
  requirement: "extensions/publishing/skill-envelope-keeps-upstream-content",
  title: "Skill publication separates publisher identity from unchanged upstream content",
  statement:
    "Skill distribution admission shall validate publisher identity and version in the package envelope independently of the upstream SKILL.md display name and metadata, require the skill payload, and return the submitted archive unchanged; cosmetic authoring conformance shall not be an ingest requirement. Contained relative links, including cycles, shall remain payload; escaping links and ambiguous extraction topology shall be refused.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const identity = {
  owner: handle("@acme"),
  type: "skill",
  name: extensionName("review"),
  version: exactVersion("1.0.0"),
} as const;
const archiveFor = (body: string | undefined, name = "review") =>
  buildZip([
    { fileName: "skill.json", content: textContent(JSON.stringify({ ...identity, name })) },
    ...(body === undefined ? [] : [{ fileName: "src/SKILL.md", content: textContent(body) }]),
    { fileName: "src/_assets/metadata.json", content: textContent('{"untouched":true}\r\n') },
  ]);

describe("Existing-format skill distribution admission", () => {
  for (const body of [
    "---\r\nname: Upstream Display\r\nallowed-tools: [Read, Bash]\r\nfuture: { enabled: true }\r\n---\r\n# Review\r\n",
    "# An existing skill without frontmatter\n",
    "---\nname: [unfinished\n---\n# Existing body\n",
  ]) {
    it.effect(
      `retains the payload ${body.startsWith("#") ? "without frontmatter" : body.includes("unfinished") ? "with malformed descriptive metadata" : "with vendor metadata"}`,
      () =>
        Effect.gen(function* () {
          const archiveBytes = archiveFor(body);
          const result = yield* normalizePublishInput({
            declaredIdentity: identity,
            archive: { archiveBytes, archiveContentType: "application/zip" },
          });
          expect(result.manifest.identity).toMatchObject(identity);
          expect(result.archiveBytes).toBe(archiveBytes);
        }),
    );
  }
  it.effect("retains contained links, cycles, executable modes, and empty directories", () =>
    Effect.gen(function* () {
      const archiveBytes = buildZip([
        { fileName: "skill.json", content: textContent(JSON.stringify(identity)) },
        { fileName: "src/SKILL.md", content: textContent("# Existing skill\n") },
        {
          fileName: "src/run.sh",
          content: textContent("#!/bin/sh\n"),
          externalAttributes: 0o100755 << 16,
        },
        { fileName: "src/empty/", content: new Uint8Array(), externalAttributes: 0o40755 << 16 },
        { fileName: "src/run", content: textContent("run.sh"), externalAttributes: 0o120777 << 16 },
        { fileName: "src/a", content: textContent("b"), externalAttributes: 0o120777 << 16 },
        { fileName: "src/b", content: textContent("a"), externalAttributes: 0o120777 << 16 },
      ]);
      const result = yield* normalizePublishInput({
        declaredIdentity: identity,
        archive: { archiveBytes, archiveContentType: "application/zip" },
      });
      expect(result.archiveBytes).toBe(archiveBytes);
    }),
  );

  it.effect("still refuses missing payloads and an inconsistent envelope identity", () =>
    Effect.gen(function* () {
      for (const archiveBytes of [archiveFor(undefined), archiveFor("# Review\n", "different")]) {
        const failure = yield* normalizePublishInput({
          declaredIdentity: identity,
          archive: { archiveBytes, archiveContentType: "application/zip" },
        }).pipe(Effect.flip);
        expect(["FilteredPackageError", "ManifestError"]).toContain(failure._tag);
      }
    }),
  );
});
