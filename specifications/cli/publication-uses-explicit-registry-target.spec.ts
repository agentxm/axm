import * as Schema from "effect/Schema";
import { JsonErrorEnvelopeSchema } from "axm.sh/specification-harness";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  makePublicationCommandFixture,
  publicationTypes,
  readPublicationCommandResult,
} from "../support/publication-command-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/publication-uses-explicit-registry-target",
  title: "Publication uses the explicitly selected Registry",
  statement:
    "When exactly one of --registry and --registry-url is supplied for publication, AXM shall direct the admitted publication to that configured Registry or explicit Registry URL and refuse a target it cannot resolve without publishing elsewhere.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "Actual registered root and type-specific CLI invocations choose between distinct fixture Registry destinations; the examples observe nonempty archive files at the selected destination and no files at the other destination.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "packages/cli/src/root/publish/command.ts",
    "packages/cli/src/root/publish/per-type-command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "What target or rejection is required when both --registry and --registry-url are supplied? The current implementation prefers the URL and retains the supplied name as a label; no public precedence promise was identified.",
    "Which Registry should an invocation without either target flag select? The current implementation takes the first resolved Registry source; this requirement does not establish that default or source-order policy.",
    "Which URL schemes are supported publication targets beyond the existing local Registry and HTTP implementations? No new scheme support or normalization guarantee is established here.",
  ],
  limitations: [
    {
      limitation:
        "The process examples use local file Registry destinations. HTTP publication capability binding and credential-origin isolation remain separately owned; no live Registry, remote authentication, or server-side storage behavior is established here.",
      retirementCondition:
        "Retain explicit target selection evidence through each supported target transport without duplicating the credential and publication-capability owners.",
    },
  ],
});

describe("Explicit publication Registry target", () => {
  for (const type of publicationTypes) {
    for (const targetFlag of ["--registry", "--registry-url"] as const) {
      it(`${type.route} publish uses ${targetFlag} without publishing to another configured Registry`, async () => {
        const fixture = makePublicationCommandFixture(type);
        try {
          const result = await fixture.run(
            [type.route, "publish", "review"],
            [targetFlag, targetFlag === "--registry" ? "selected" : fixture.selected.url],
          );
          expect(result.exitCode, result.stdout + result.stderr).toBe(0);
          const archive = `extensions/@acme/${type.route}/review/1.0.0.zip`;
          expect(fixture.selectedArchives()).toEqual([archive]);
          expect(fixture.archiveBytes(archive).length).toBeGreaterThan(0);
          expect(fixture.distractor.storedFiles()).toEqual([]);
          expect(readPublicationCommandResult(result.stdout).counts.published).toBe(1);
        } finally {
          fixture.cleanup();
        }
      }, 120_000);
    }
  }
  for (const target of ["name", "url", "missing-name", "invalid-url"] as const) {
    it(`root publish resolves ${target} before distributing anything`, async () => {
      const type = publicationTypes[0];
      const fixture = makePublicationCommandFixture(type);
      try {
        const flags =
          target === "name"
            ? ["--registry", "selected"]
            : target === "url"
              ? ["--registry-url", fixture.selected.url]
              : target === "missing-name"
                ? ["--registry", "missing"]
                : ["--registry-url", "not a Registry URL"];
        const result = await fixture.run(["publish", "@acme/skills/review"], flags);
        if (target === "name" || target === "url") {
          expect(result.exitCode, result.stdout + result.stderr).toBe(0);
          const archive = "extensions/@acme/skills/review/1.0.0.zip";
          expect(fixture.selectedArchives()).toEqual([archive]);
          expect(fixture.archiveBytes(archive).length).toBeGreaterThan(0);
          expect(readPublicationCommandResult(result.stdout).counts.published).toBe(1);
        } else {
          expect(result.exitCode).not.toBe(0);
          const failure = Schema.decodeUnknownSync(JsonErrorEnvelopeSchema)(
            JSON.parse(result.stdout),
          );
          expect(failure.detail).toContain(
            target === "missing-name" ? "missing" : "--registry-url",
          );
          expect(fixture.selected.storedFiles()).toEqual([]);
        }
        expect(fixture.distractor.storedFiles()).toEqual([]);
      } finally {
        fixture.cleanup();
      }
    }, 120_000);
  }
});
