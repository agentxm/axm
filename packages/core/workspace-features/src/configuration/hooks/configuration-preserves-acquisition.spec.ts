import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { ConfigureHook } from "../index.js";
import { makeConfigurationFixture } from "../testing.js";
import { applyInstall, installRequest, makeInstallWorld } from "../../testing/install-world.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/configure/preserves-acquisition-and-package-content",
  title: "Hook configuration changes consumer values without acquiring another package",
  statement:
    "When a person configures an installed Hook, AXM shall validate and replace consumer values, reconcile active native registrations, preserve immutable package content and accepted resolution, retain disabled state and source-less Pack membership, and refuse stale or unowned packages without changing workspace state.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition", "extension-adoption"],
  methods: ["example", "decision-table"],
  boundary: "platform",
  boundaryRationale:
    "Real native files and package archives demonstrate preserved content, registration replacement, and source ownership.",
  derivedFrom: ["extensions/hooks/resolve-typed-consumer-configuration"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const manifest = JSON.stringify({
  owner: "@acme",
  type: "hook",
  name: "audit",
  version: "1.0.0",
  configuration: { label: { type: "string", default: "original" } },
  implementations: [
    {
      id: "claude",
      protocol: "claude-code",
      bindings: [
        {
          id: "audit",
          event: "PreToolUse",
          handler: {
            type: "command",
            runtime: "bash",
            entrypoint: "src/hook.sh",
            args: [{ config: "label" }],
          },
        },
      ],
    },
  ],
});

const configure = (label: string) =>
  Effect.gen(function* () {
    const candidate = yield* ConfigureHook.prepare({ name: "audit", configuration: { label } });
    return yield* ConfigureHook.previewOrApply(candidate, preapprovedPlanExecution);
  });

describe("Configuring installed Hooks", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const route of ["direct", "two-packs"] as const) {
    it.effect(
      `replaces active values while retaining ${route} acquisition`,
      () => {
        const world = makeInstallWorld();
        cleanups.push(world.cleanup);
        world.workspace.writeFile(
          ".claude/settings.json",
          JSON.stringify({
            hooks: { PostToolUse: [{ hooks: [{ type: "command", command: "echo foreign" }] }] },
          }),
        );
        world.registry.writeHook("audit", [{ version: "1.0.0", files: { "hook.json": manifest } }]);
        for (const name of ["first", "second"])
          world.registry.writePack(name, [
            {
              version: "1.0.0",
              dependencies: { "@acme/hooks/audit": "^1.0.0" },
            },
          ]);
        return world.workspace
          .provide(
            Effect.gen(function* () {
              for (const source of route === "direct"
                ? ["@acme/hooks/audit"]
                : ["@acme/packs/first", "@acme/packs/second"]) {
                const installed = yield* applyInstall(
                  installRequest({
                    type: route === "direct" ? "hook" : "pack",
                    subject: { kind: "source", source: `${source}@1.0.0` },
                  }),
                );
                expect(deriveOperationOutcome(installed)).toBe("applied");
              }
              const lock = world.workspace.readFile("axm-lock.yaml");
              const content = world.workspace.readFile(
                "agent_extensions/registry/@acme/hooks/audit/hook.json",
              );
              expect(deriveOperationOutcome(yield* configure("replacement"))).toBe("applied");
              const settings: unknown = JSON.parse(world.workspace.readFile("axm.json"));
              expect(settings).toMatchObject({
                hooks: { audit: { configuration: { label: "replacement" } } },
              });
              const native = world.workspace.readFile(".claude/settings.json");
              expect(native).toContain("replacement");
              expect(native).not.toContain("original");
              expect(native).toContain("echo foreign");
              expect(native.match(/replacement/g)).toHaveLength(1);
              expect(world.workspace.readFile("axm-lock.yaml")).toBe(lock);
              expect(
                world.workspace.readFile("agent_extensions/registry/@acme/hooks/audit/hook.json"),
              ).toBe(content);
              if (route === "two-packs") {
                expect(settings).toHaveProperty("hooks.audit", {
                  configuration: { label: "replacement" },
                });
              }
              yield* configure("replacement");
              expect(world.workspace.readFile(".claude/settings.json")).toBe(native);
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      },
      { timeout: 60_000 },
    );
  }

  it.effect("retains disabled state and leaves foreign native files untouched", () => {
    const world = makeConfigurationFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        hooks: { audit: { source: "workspace", enabled: false } },
      },
      files: {
        "hooks/audit/hook.json": manifest,
        "hooks/audit/src/hook.sh": "exit 0\n",
        ".claude/settings.json": "unreadable foreign configuration\n",
      },
    });
    cleanups.push(world.cleanup);
    return world
      .provide(
        Effect.gen(function* () {
          expect(deriveOperationOutcome(yield* configure("configured"))).toBe("applied");
          expect(JSON.parse(world.readFile("axm.json"))).toMatchObject({
            hooks: {
              audit: {
                source: "workspace",
                enabled: false,
                configuration: { label: "configured" },
              },
            },
          });
          expect(world.readFile(".claude/settings.json")).toBe(
            "unreadable foreign configuration\n",
          );
          expect(world.readFile("hooks/audit/hook.json")).toBe(manifest);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("refuses changed package content after planning", () => {
    const world = makeConfigurationFixture({
      settings: {
        owner: "@acme",
        agents: [],
        hooks: { audit: { source: "workspace", enabled: false } },
      },
      files: { "hooks/audit/hook.json": manifest, "hooks/audit/src/hook.sh": "exit 0\n" },
    });
    cleanups.push(world.cleanup);
    return world
      .provide(
        Effect.gen(function* () {
          const candidate = yield* ConfigureHook.prepare({
            name: "audit",
            configuration: { label: "replacement" },
          });
          world.writeFile("hooks/audit/src/hook.sh", "exit 1\n");
          const before = world.snapshot();
          const outcome = yield* ConfigureHook.previewOrApply(
            candidate,
            preapprovedPlanExecution,
          ).pipe(Effect.result);
          expect(
            outcome._tag === "Failure" || deriveOperationOutcome(outcome.success) !== "applied",
          ).toBe(true);
          expect(world.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("refuses an undeclared package with the same name", () => {
    const world = makeConfigurationFixture({
      settings: { owner: "@acme", agents: [] },
      files: { "hooks/audit/hook.json": manifest, "hooks/audit/src/hook.sh": "exit 0\n" },
    });
    cleanups.push(world.cleanup);
    return world
      .provide(
        Effect.gen(function* () {
          const before = world.snapshot();
          const failure = yield* ConfigureHook.prepare({
            name: "audit",
            configuration: { label: "replacement" },
          }).pipe(Effect.flip);
          expect(failure).toMatchObject({ _tag: "WorkspaceConfigurationFailed" });
          expect(world.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
