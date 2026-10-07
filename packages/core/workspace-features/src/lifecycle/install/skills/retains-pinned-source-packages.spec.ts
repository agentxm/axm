import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import * as Result from "effect/Result";
import {
  LockfileReader,
  acquiredPackageRelativePath,
} from "@agentxm/workspace-kernel/workspace-state";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { InstallExtensions, UninstallExtensions } from "../../index.js";
import { installRequest, makeInstallWorld } from "../../../testing/install-world.js";
import { applySync } from "../../../testing/sync-fixture.js";
import { serveBareRepository } from "../../../testing/git-repositories.js";

export const specification = defineSpecification({
  requirement: "cli/skills/install/retains-pinned-source-packages",
  title: "Pinned source layouts retain one complete package at their source address",
  statement:
    "For the pinned Basecamp and Matt Pocock plugin layouts and native spot-spew layout, selected skills shall retain the complete package once at its host and repository path, activate only selected components, restore the shared accepted snapshot with one acquisition, and retire that package only after its last consumer is removed.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "trustworthy-distribution"],
  methods: ["example", "decision-table"],
  boundary: "platform",
  boundaryRationale:
    "Recorded pinned layout facts and synthetic bodies travel through real local Git acquisition, filesystem retention, native projection, sync, and removal; the same package boundaries also verify placement for the recorded public source URLs.",
  derivedFrom: ["cli/skills/install/retains-plugin-package-context"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const layouts = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        repository: Schema.String,
        commit: Schema.String,
        upstreamArchiveSha256: Schema.String,
        payload: Schema.String,
        packageRoot: Schema.String,
        selected: Schema.Array(Schema.String),
        files: Schema.Record(Schema.String, Schema.String),
      }),
    ),
  ),
)(fs.readFileSync(new URL("./__fixtures__/pinned-package-layouts.json", import.meta.url), "utf8"));

describe("Pinned retained source layouts", () => {
  it.effect.each(layouts)(
    "retains $repository at pinned layout $commit",
    (layout) =>
      Effect.gen(function* () {
        const world = yield* Effect.acquireRelease(
          Effect.sync(() => makeInstallWorld()),
          (world) => Effect.sync(world.cleanup),
        );
        const source = path.join(world.workspace.root, "vendor/upstream");
        for (const [relative, content] of Object.entries(layout.files)) {
          const destination = path.join(source, relative);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.writeFileSync(destination, content);
        }
        const git = (args: ReadonlyArray<string>) =>
          execFileSync("git", [...args], { cwd: source, stdio: "ignore" });
        git(["init", "--initial-branch=main"]);
        git(["add", "."]);
        git([
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.test",
          "commit",
          "-m",
          "Record pinned source layout",
        ]);
        const served = yield* Effect.acquireRelease(
          Effect.promise(() =>
            serveBareRepository({ root: world.workspace.root, source, name: "upstream" }),
          ),
          (served) => Effect.sync(served.stop),
        );
        const locator = served.url;
        const publicAddress = new URL(layout.repository);
        expect(
          Result.getOrThrow(
            acquiredPackageRelativePath(
              {
                refType: "git-hosted",
                sourcePath: layout.packageRoot,
                source: {
                  type: "git",
                  url: publicAddress,
                  ref: Option.some(layout.commit),
                  subPath: Option.none(),
                },
              },
              "skills",
              path.basename(layout.selected[0] ?? "fixture"),
            ),
          ),
        ).toBe(
          `${publicAddress.hostname}${publicAddress.pathname}${layout.packageRoot === "." ? "" : `/${layout.packageRoot}`}`,
        );
        const selectedNames = layout.selected.map((selected) => path.basename(selected));
        const acquisitions = yield* Ref.make(0);
        yield* world.workspace.provide(
          Effect.gen(function* () {
            const sources = yield* SourceHostProviders;
            const counted = {
              ...sources,
              acquireForTransition: (ref: Parameters<typeof sources.acquireForTransition>[0]) =>
                Ref.update(acquisitions, (count) => count + 1).pipe(
                  Effect.andThen(sources.acquireForTransition(ref)),
                ),
            };
            const candidate = yield* InstallExtensions.prepare(
              installRequest({
                type: "skill",
                subject: { kind: "source", source: locator },
                names: layout.selected,
                all: false,
              }),
            );
            const installed = yield* InstallExtensions.previewOrApply(
              candidate,
              preapprovedPlanExecution,
            ).pipe(Effect.provideService(SourceHostProviders, counted));
            expect(installed.installedSkills).toHaveLength(selectedNames.length);
            expect(yield* Ref.get(acquisitions)).toBe(1);
            const address = new URL(locator);
            const retained = path.join(
              world.workspace.root,
              "agent_extensions",
              address.host.replaceAll(":", "~3a"),
              address.pathname.replace(/\.git$/u, ""),
              layout.packageRoot === "." ? "" : layout.packageRoot,
            );
            const assertPayload = () => {
              const prefix = layout.packageRoot === "." ? "" : `${layout.packageRoot}/`;
              for (const [relative, content] of Object.entries(layout.files)) {
                if (!relative.startsWith(prefix)) continue;
                expect(
                  fs.readFileSync(path.join(retained, relative.slice(prefix.length)), "utf8"),
                ).toBe(content);
              }
            };
            assertPayload();
            const lock = yield* (yield* LockfileReader).lockfile;
            expect(Object.keys(lock.skills).sort()).toEqual([...selectedNames].sort());
            expect(
              fs.readdirSync(path.join(world.workspace.root, ".claude/skills")).sort(),
            ).toEqual([...selectedNames].sort());
            const acceptedBytes = world.workspace.readFile("axm-lock.yaml");
            fs.rmSync(retained, { recursive: true });
            yield* Ref.set(acquisitions, 0);
            yield* applySync({ target: Option.none(), type: Option.some("skill") }).pipe(
              Effect.provideService(SourceHostProviders, counted),
            );
            expect(yield* Ref.get(acquisitions)).toBe(1);
            expect(world.workspace.readFile("axm-lock.yaml")).toBe(acceptedBytes);
            assertPayload();
            for (const [index, name] of selectedNames.entries()) {
              const candidate = yield* UninstallExtensions.prepare({
                type: Option.some("skill"),
                selector: name,
              });
              yield* UninstallExtensions.previewOrApply(candidate, preapprovedPlanExecution);
              expect(fs.existsSync(retained)).toBe(index < selectedNames.length - 1);
            }
          }),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    30_000,
  );
});
