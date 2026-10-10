import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { FIXTURE_PUBLISHED_AT } from "@agentxm/registry-client/testing";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions";
import { ReleaseAgePosture } from "@agentxm/workspace-kernel/resolution";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { InstallExtensions } from "./install-extensions.js";
import { installRequest, makeInstallWorld } from "../../testing/install-world.js";

export const specification = defineSpecification({
  requirement: "cli/install/unversioned-sources-follow-release-age",
  title: "An unversioned source does not grant an explicit-version exemption",
  statement:
    "Installing an unversioned Registry source shall select an eligible release under the configured minimum release age for every extension type, refuse when no release is eligible, and preserve holdback evidence when an older release is selected. The one-run release-age override shall permit and report the younger release. Preparation shall not change durable workspace state.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: ["cli/policy-overrides-reach-every-blocked-command"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Unversioned Registry sources", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const type of installableExtensionTypes)
    it.effect(
      type,
      () => {
        const world = makeInstallWorld();
        const young = makeInstallWorld();
        cleanups.push(world.cleanup, young.cleanup);
        const versions = [
          { version: "2.0.0", body: "New guidance.", published: "1970-01-01T00:00:00Z" },
        ];
        const publish = (registry: typeof world.registry) => {
          switch (type) {
            case "skill":
              registry.writeSkill("review", versions);
              break;
            case "subagent":
              registry.writeSubagent("review", versions);
              break;
            case "rule":
              registry.writeRule("review", versions);
              break;
            case "hook":
              registry.writeHook("review", versions);
              break;
            case "knowledge":
              registry.writeKnowledge("review", versions);
              break;
            case "mcp-server":
              registry.writeMcp("review", versions);
              break;
            case "pack":
              registry.writePack(
                "review",
                versions.map(({ version, published }) => ({
                  version,
                  published,
                  dependencies: {},
                })),
              );
              break;
          }
        };
        publish(young.registry);
        versions.push({
          version: "1.0.0",
          body: "Mature guidance.",
          published: FIXTURE_PUBLISHED_AT,
        });
        publish(world.registry);
        const source = `@acme/${toExtensionTypePlural(type)}/review`;
        const request = installRequest({ type, subject: { kind: "source", source } });
        return Effect.gen(function* () {
          yield* young.workspace.provide(
            Effect.gen(function* () {
              const before = young.workspace.snapshot();
              const refused = yield* InstallExtensions.prepare(request).pipe(Effect.flip);
              expect(refused).toMatchObject({
                category: "conflict",
                detail: expect.stringContaining("minimum release age"),
              });
              expect(young.workspace.snapshot()).toEqual(before);

              const allowed = yield* InstallExtensions.prepare(request).pipe(
                Effect.provideService(ReleaseAgePosture, "ignore"),
              );
              expect(allowed.execution.plan.releaseAge?.bypasses).toContainEqual(
                expect.objectContaining({ target: source, candidateVersion: "2.0.0" }),
              );
              expect(young.workspace.snapshot()).toEqual(before);
            }),
          );
          yield* world.workspace.provide(
            Effect.gen(function* () {
              const before = world.workspace.snapshot();
              const eligible = yield* InstallExtensions.prepare(request);
              expect(eligible.execution.plan.releaseAge?.holdbacks).toContainEqual(
                expect.objectContaining({
                  target: source,
                  candidateVersion: "2.0.0",
                  selectedVersion: "1.0.0",
                }),
              );
              expect(world.workspace.snapshot()).toEqual(before);
              yield* InstallExtensions.previewOrApply(eligible, preapprovedPlanExecution);
              expect(world.workspace.readFile("axm-lock.yaml")).toContain("version: 1.0.0");
              expect(world.workspace.readFile("axm-lock.yaml")).not.toContain("version: 2.0.0");
            }),
          );
        }).pipe(Effect.provide(NodeServices.layer));
      },
      30_000,
    );
});
