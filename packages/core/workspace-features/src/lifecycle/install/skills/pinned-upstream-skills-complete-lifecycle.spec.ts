import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { extractExternalArchive } from "@agentxm/workspace-kernel/acquisition";
import { LockfileReader } from "@agentxm/workspace-kernel/workspace-state";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { UninstallExtensions } from "../../index.js";
import { applyInstall, installRequest, makeInstallWorld } from "../../../testing/install-world.js";
import { applySync } from "../../../testing/sync-fixture.js";
import { applyUpdate, configuredUpdateRequest } from "../../update/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/skills/install/pinned-upstream-skills-complete-lifecycle",
  title: "Pinned upstream skill layouts complete acquisition and management without conversion",
  statement:
    "For the pinned compatibility corpus, AXM shall install each selected upstream skill directory without rewriting its contents, retain its supporting files and native metadata, restore or explicitly update the accepted payload, and remove only its managed installation while preserving upstream source bytes.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "trustworthy-distribution", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Pinned upstream payloads exercise the public lifecycle services with real directories and agent projections; source instructions are data and are never executed.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const Corpus = Schema.Struct({
  sources: Schema.Array(
    Schema.Struct({
      repository: Schema.String,
      commit: Schema.String,
      archive: Schema.String,
      sha256: Schema.String,
      skills: Schema.Array(Schema.String),
      entries: Schema.Record(
        Schema.String,
        Schema.Struct({
          kind: Schema.Literals(["file", "directory", "symlink"]),
          mode: Schema.String,
          sha256: Schema.optionalKey(Schema.String),
        }),
      ),
    }),
  ),
});
const fixtures = new URL("./__fixtures__/compatibility/", import.meta.url);
const corpus = Schema.decodeUnknownSync(Schema.fromJsonString(Corpus))(
  fs.readFileSync(new URL("corpus.json", fixtures), "utf8"),
);
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// Each case owns its workspace and source copy. Verification compares original
// bytes; neither a provider nor an agent executes the acquired instructions.
for (const source of corpus.sources) {
  for (const selected of source.skills) {
    describe(`${source.repository}@${source.commit}: ${selected}`, () => {
      it.effect.each(["restore", "reinstall", "update"] as const)(
        "preserves the payload through %s and removal",
        (journey) =>
          Effect.gen(function* () {
            const world = yield* Effect.acquireRelease(
              Effect.sync(() => makeInstallWorld()),
              (world) => Effect.sync(() => world.cleanup()),
            );
            const archive = fs.readFileSync(new URL(source.archive, fixtures));
            expect(hash(archive)).toBe(source.sha256);
            const upstream = path.join(world.workspace.root, "vendor", "corpus");
            fs.mkdirSync(upstream, { recursive: true });
            yield* extractExternalArchive(archive, "tar.gz", upstream);
            const name = path.basename(selected);
            const original = fs.readFileSync(path.join(upstream, selected, "SKILL.md"));
            const assertPayload = (root: string, updated?: Uint8Array) => {
              const entries = Object.entries(source.entries).filter(([relative]) =>
                relative.startsWith(`${selected}/`),
              );
              expect(fs.readdirSync(root, { recursive: true }).map(String).sort()).toEqual(
                entries.map(([relative]) => relative.slice(selected.length + 1)).sort(),
              );
              for (const [relative, entry] of entries) {
                const local = relative.slice(selected.length + 1);
                const target = path.join(root, local);
                if (entry.kind === "file") {
                  expect(hash(fs.readFileSync(target))).toBe(
                    local === "SKILL.md" && updated !== undefined ? hash(updated) : entry.sha256,
                  );
                  expect(fs.statSync(target).mode & 0o111).toBe(Number(entry.mode) & 0o111);
                }
              }
            };
            yield* world.workspace.provide(
              applyInstall(
                installRequest({
                  type: "skill",
                  subject: { kind: "source", source: upstream },
                  names: [selected],
                  all: false,
                }),
              ),
            );
            const active = path.join(world.workspace.root, ".claude", "skills", name);
            assertPayload(active);
            const canonical = fs.realpathSync(active);
            const before = world.workspace.readFile("axm-lock.yaml");
            if (journey === "update") {
              const next = Buffer.concat([original, Buffer.from("\nUpstream revision.\n")]);
              fs.writeFileSync(path.join(upstream, selected, "SKILL.md"), next);
              yield* world.workspace.provide(
                applyUpdate(configuredUpdateRequest({ type: "skill" })),
              );
              assertPayload(active, next);
            } else {
              fs.rmSync(canonical, { recursive: true });
              if (journey === "restore") {
                yield* world.workspace.provide(
                  applySync({ target: Option.none(), type: Option.some("skill") }),
                );
              } else {
                yield* world.workspace.provide(
                  applyInstall(
                    installRequest({
                      type: "skill",
                      subject: { kind: "configured" },
                      reinstall: true,
                    }),
                  ),
                );
              }
              assertPayload(active);
              expect(world.workspace.readFile("axm-lock.yaml")).toBe(before);
            }
            yield* world.workspace.provide(
              Effect.gen(function* () {
                const candidate = yield* UninstallExtensions.prepare({
                  type: Option.some("skill"),
                  selector: name,
                });
                yield* UninstallExtensions.previewOrApply(candidate, preapprovedPlanExecution);
                expect(Option.isNone(yield* (yield* LockfileReader).entry("skill", name))).toBe(
                  true,
                );
              }),
            );
            expect(fs.existsSync(active)).toBe(false);
            assertPayload(
              path.join(upstream, selected),
              journey === "update"
                ? Buffer.concat([original, Buffer.from("\nUpstream revision.\n")])
                : undefined,
            );
          }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
      );
    });
  }
}
