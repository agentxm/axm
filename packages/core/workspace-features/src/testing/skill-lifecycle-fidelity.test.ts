import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { snapshotTree } from "@agentxm/workspace-kernel/workspace-state/testing";
import { extractExternalArchive } from "@agentxm/workspace-kernel/acquisition";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { UpdateExtensions } from "../lifecycle/index.js";
import { CredentialStoreTest, WorkloadCredentialsTest } from "@agentxm/registry-access/testing";
import { RegistryUrlTest } from "@agentxm/registry-client/testing";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { ImportNativeExtension } from "../authoring/index.js";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { applySync, expectResolved, makeSyncFixture } from "./sync-fixture.js";
import { PublishExtensions, normalizePublishResult } from "../publishing/index.js";
import { PublishPortsTest, makePublishTarget, publishRequest } from "../publishing/testing.js";

const body =
  "---\r\nname: review\r\nallowed-tools: [Read, Bash]\r\nhooks: { PreToolUse: [{ hooks: [{ type: command, command: '${CLAUDE_SKILL_DIR}/scripts/check.sh' }] }] }\r\nagentOverrides: { cursor: { preserve: true } }\r\n---\r\n# Review\r\nRead references/context.md.\r\n";
const script = "#!/bin/sh\nexit 0\n";

describe("Skill lifecycle fidelity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const fixture of [
    { label: "declared native name", body, nativeName: "review" },
    {
      label: "absent name",
      body: "# Review\nUse scripts/check.sh.\n",
      nativeName: "review-package",
    },
    {
      label: "unsafe name",
      body: "---\nname: ../outside\n---\n# Review\n",
      nativeName: "review-package",
    },
    {
      label: "pinned Matt Pocock TDD skill",
      nativeName: "tdd",
      sourceName: "tdd",
      component: "skills/engineering/tdd",
      archive: new URL(
        "../lifecycle/install/skills/__fixtures__/compatibility/matt-skills.tar.gz",
        import.meta.url,
      ),
      sha256: "e2f7007effd8f7d5186da1eb33d65b1270958d634eed4136f87e648fef2259ac",
    },
    {
      label: "pinned Gstack careful skill",
      nativeName: "careful",
      sourceName: "careful",
      component: "careful",
      archive: new URL("./__fixtures__/skill-fidelity/gstack-careful.tar.gz", import.meta.url),
      sha256: "5cd9fc93c80d6342d8fece16ab4e6a2470a61e2e1939fa4479f50106576090c2",
    },
  ])
    it.effect(
      `installs, imports, publishes, and reinstalls unchanged with ${fixture.label}`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const sourceName = fixture.sourceName ?? "review";
          const component = fixture.component ?? "review";
          const acquired = makeSyncFixture({
            settings: {
              owner: "@acme",
              agents: ["claude-code"],
              skills: { [sourceName]: `./upstream/${component}` },
            },
          });
          cleanups.push(acquired.cleanup);
          const sourceRoot = path.join(acquired.root, "upstream", component);
          if (fixture.archive !== undefined) {
            const bytes = yield* fs.readFile(fileURLToPath(fixture.archive));
            expect(createHash("sha256").update(bytes).digest("hex")).toBe(fixture.sha256);
            yield* fs.makeDirectory(path.join(acquired.root, "upstream"), { recursive: true });
            yield* extractExternalArchive(bytes, "tar.gz", path.join(acquired.root, "upstream"));
          } else {
            acquired.writeFile("upstream/review/SKILL.md", fixture.body);
            acquired.writeFile("upstream/review/scripts/check.sh", script);
            acquired.writeFile("upstream/review/references/context.md", "# Context\n");
            yield* fs.chmod(path.join(sourceRoot, "scripts/check.sh"), 0o755);
            yield* fs.symlink("scripts/check.sh", path.join(sourceRoot, "check"));
          }
          const original = snapshotTree(sourceRoot);
          const modes = yield* Effect.forEach(
            Object.keys(original).filter((relative) => original[relative]?.startsWith("file:")),
            (relative) =>
              fs
                .stat(path.join(sourceRoot, relative))
                .pipe(Effect.map((stat) => ({ relative, mode: stat.mode & 0o777 }))),
          );
          const installed = yield* acquired.provide(applySync());
          expect(deriveOperationOutcome(expectResolved(installed))).toBe("applied");
          const installedRoot = path.join(acquired.root, ".claude/skills", sourceName);
          expect(snapshotTree(installedRoot)).toEqual(original);

          const publisher = makeSyncFixture({ settings: { owner: "@acme", agents: [] } });
          const target = makePublishTarget(publisher.root);
          cleanups.push(publisher.cleanup);
          const imported = yield* publisher.provide(
            Effect.gen(function* () {
              const candidate = yield* ImportNativeExtension.prepare({
                type: "skill",
                source: installedRoot,
                target: "@acme/skills/review-package",
                enable: false,
              });
              return yield* ImportNativeExtension.previewOrApply(
                candidate,
                preapprovedPlanExecution,
              );
            }).pipe(Effect.scoped),
          );
          expect(deriveOperationOutcome(imported)).toBe("applied");
          const publish = () =>
            publisher.provide(
              Effect.gen(function* () {
                const prepared = yield* PublishExtensions.prepare(
                  publishRequest(target.url, {
                    selectors: ["@acme/skills/review-package"],
                    preview: false,
                  }),
                );
                return prepared._tag === "Settled"
                  ? prepared.outcome
                  : yield* PublishExtensions.previewOrApply(
                      prepared.candidate,
                      preapprovedPlanExecution,
                    );
              }).pipe(
                Effect.provide(
                  Layer.mergeAll(
                    PublishPortsTest(),
                    CredentialStoreTest(),
                    WorkloadCredentialsTest(),
                    RegistryUrlTest(target.url),
                  ),
                ),
              ),
            );
          const published = yield* publish();
          expect(
            normalizePublishResult({
              mode: published.mode,
              selection: published.selection,
              publicationSet: published.publicationSet,
              results: published.results,
            }).counts.published,
          ).toBe(1);

          const consumer = makeSyncFixture({
            settings: {
              owner: "@acme",
              agents: ["claude-code", "cursor"],
              minimumReleaseAge: "0s",
              defaultRegistry: "published",
              sources: [{ name: "published", type: "registry", location: target.url }],
              skills: { "review-package": "published:@acme/skills/review-package@0.1.0" },
            },
          });
          cleanups.push(consumer.cleanup);
          const reinstalled = expectResolved(yield* consumer.provide(applySync()));
          expect(deriveOperationOutcome(reinstalled), JSON.stringify(reinstalled)).toBe("applied");
          const retainedRoot = yield* fs.realPath(
            path.join(consumer.root, ".claude/skills", fixture.nativeName),
          );
          expect(retainedRoot).toContain("/agent_extensions/");
          for (const root of [
            path.join(publisher.root, "skills/review-package/src"),
            retainedRoot,
            path.join(consumer.root, ".claude/skills", fixture.nativeName),
            path.join(consumer.root, ".cursor/skills", fixture.nativeName),
          ]) {
            expect(snapshotTree(root), root).toEqual(original);
            for (const { relative, mode } of modes) {
              expect((yield* fs.stat(path.join(root, relative))).mode & 0o777).toBe(mode);
            }
          }
          expect((yield* consumer.provide(applySync()))._tag).toBe("AlreadyReconciled");
          let activeName = fixture.nativeName;
          if (fixture.label === "declared native name") {
            publisher.writeFile(
              "skills/review-package/src/SKILL.md",
              body.replace("name: review", "name: inspect"),
            );
            publisher.writeFile(
              "skills/review-package/skill.json",
              JSON.stringify({
                owner: "@acme",
                name: "review-package",
                type: "skill",
                version: "0.2.0",
              }),
            );
            yield* publish();
            const updated = yield* consumer.provide(
              Effect.gen(function* () {
                const candidate = yield* UpdateExtensions.prepare({
                  kind: "targeted",
                  source: "@acme/skills/review-package@0.2.0",
                  nonInteractive: true,
                });
                if (candidate.outcome === "nothing-configured")
                  throw new Error("Expected configured Skill update");
                return yield* UpdateExtensions.previewOrApply(candidate, preapprovedPlanExecution);
              }),
            );
            expect(deriveOperationOutcome(updated), JSON.stringify(updated)).toBe("applied");
            expect(consumer.exists(".claude/skills/inspect/SKILL.md")).toBe(true);
            expect(consumer.exists(".claude/skills/review")).toBe(false);
            expect(consumer.exists(".agents/skills/review")).toBe(false);
            activeName = "inspect";
          }
          consumer.writeSettings({ ...consumer.readSettings(), skills: {} });
          yield* consumer.provide(applySync());
          expect(consumer.exists(`.claude/skills/${activeName}`)).toBe(false);
          expect(consumer.exists(`.cursor/skills/${activeName}`)).toBe(false);
          expect(snapshotTree(installedRoot)).toEqual(original);
        }).pipe(Effect.provide(NodeServices.layer)),
      30_000,
    );
});
