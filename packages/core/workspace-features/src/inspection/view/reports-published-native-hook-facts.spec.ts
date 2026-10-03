import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as fs from "node:fs";
import * as path from "node:path";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeFileRegistry } from "@agentxm/registry-client/testing";
import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import { ViewExtension } from "./view-extension.js";
import { makeInspectionFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/view/reports-published-native-hook-facts",
  title: "Published Hook inspection reports exact version facts and prospective native outcomes",
  statement:
    "Viewing a published Hook shall validate the selected version's immutable archive and report its native implementations and prospective workspace-agent outcomes through the shared resolver. It shall distinguish published static facts from native invocation evidence, refuse invalid manifests or integrity mismatches, and never execute package code.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Published native Hook facts", () => {
  for (const scenario of ["valid", "invalid-manifest", "changed-archive"])
    it.effect(`reports static facts only for an intact native Hook archive: ${scenario}`, () => {
      const registry = makeFileRegistry();
      const sentinel = path.join(registry.root, "executed");
      registry.writeHook("audit", [
        {
          version: "1.0.0",
          files: {
            "src/hook.sh": `printf invoked > '${sentinel}'\n`,
            ...(scenario === "invalid-manifest" ? { "hook.json": "{}" } : {}),
          },
        },
      ]);
      if (scenario === "changed-archive") {
        const archive = registry.storedFiles().find((file) => file.endsWith(".zip"));
        if (archive === undefined) throw new Error("Missing test archive");
        fs.appendFileSync(path.join(registry.root, archive), "changed after publication");
      }
      const fixture = makeInspectionFixture({
        settings: {
          agents: ["claude-code", "cursor"],
          sources: [registry.source],
          defaultRegistry: registry.source.name,
        },
      });
      const parts = parseExtensionFqnParts("@acme/hooks/audit");
      if (parts === undefined) throw new Error("Invalid test identity");
      return fixture
        .provide(
          Effect.gen(function* () {
            const query = ViewExtension.read({
              handle: "@acme/hooks/audit",
              parts,
              targetRegistry: { registryName: registry.source.name, registryUrl: registry.url },
              field: Option.none(),
              hookContext: { scope: "project", agents: ["claude-code", "cursor"] },
            });
            if (scenario !== "valid") {
              expect(yield* query.pipe(Effect.flip)).toMatchObject({
                _tag: "PublishedMetadataUnavailable",
                reason: "field-unavailable",
              });
              expect(fs.existsSync(sentinel)).toBe(false);
              return;
            }
            const result = yield* query;
            expect(result.document.hook).toMatchObject({
              evidence: "published-static-only",
              manifest: { version: "1.0.0" },
            });
            expect(result.document.hook?.agentOutcomes).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  agentId: "claude-code",
                  hook: expect.objectContaining({
                    implementationId: "claude-code",
                    nativeInvocation: "not-observed",
                    runtimeAvailability: "unverified",
                  }),
                }),
                expect.objectContaining({ agentId: "cursor", outcome: "blocked" }),
              ]),
            );
            expect(fs.existsSync(sentinel)).toBe(false);
          }),
        )
        .pipe(
          Effect.provide(NodeServices.layer),
          Effect.ensuring(
            Effect.sync(() => {
              fixture.cleanup();
              registry.cleanup();
            }),
          ),
        );
    });
});
