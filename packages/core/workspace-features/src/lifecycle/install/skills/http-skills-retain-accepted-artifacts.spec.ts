import * as fs from "node:fs";
import { gzipSync } from "node:zlib";
import { zipSync } from "fflate";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { httpArtifactDigest, WELL_KNOWN_SCHEMA } from "@agentxm/workspace-kernel/sources";
import { LockfileReader } from "@agentxm/workspace-kernel/workspace-state";
import { applyInstall, installRequest } from "../../../testing/install-world.js";
import { makeLifecycleFixture } from "../../testing.js";
import { UninstallExtensions } from "../../index.js";
import { applySync } from "../../../testing/sync-fixture.js";
import { applyUpdate, configuredUpdateRequest } from "../../update/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/skills/install/http-skills-retain-accepted-artifacts",
  title: "HTTP skills retain accepted bytes through their lifecycle",
  statement:
    "AXM shall install HTTPS skills without rewriting their payload, record exact downloaded artifact digests separately from materialized tree integrity, restore and explicitly reinstall accepted artifacts without advancing a discovery index, advance them only through explicit update, and withdraw their owned native artifacts and accepted resolution on uninstall. Changed bytes at an accepted artifact URL shall be refused without accepting a new digest.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "trustworthy-distribution", "safe-repetition"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const document = (version: string) =>
  new TextEncoder().encode(`---\r\nname: review\r\nfuture: untouched\r\n---\r\n# ${version}\r\n`);

describe("HTTP skill lifecycle", () => {
  for (const distribution of [
    "direct",
    "index-v02",
    "index-v01",
    "zip",
    "tar",
    "tar.gz",
  ] as const) {
    for (const journey of [
      "restore",
      "reinstall",
      "reinstall-selected",
      "reinstall-configured",
      "advance",
    ] as const) {
      it.effect(`${distribution}: ${journey}`, () =>
        Effect.gen(function* () {
          const archiveDistribution =
            distribution === "zip" || distribution === "tar" || distribution === "tar.gz";
          const artifactBytes = (version: "Original" | "Next"): Uint8Array => {
            if (distribution === "zip")
              return zipSync({
                "SKILL.md": document(version),
                "_assets/run.sh": [
                  new TextEncoder().encode("#!/bin/sh\necho shared\n"),
                  { os: 3, attrs: 0o100755 << 16 },
                ],
                "metadata.json": new TextEncoder().encode('{"upstream":true}\r\n'),
                "empty/": new Uint8Array(),
                run: [new TextEncoder().encode("_assets/run.sh"), { os: 3, attrs: 0o120777 << 16 }],
              });
            if (distribution === "tar" || distribution === "tar.gz") {
              // Fixed USTAR fixtures contain the same payload as the ZIP above.
              const tar = fs.readFileSync(
                new URL(`./__fixtures__/review-${version.toLowerCase()}.tar`, import.meta.url),
              );
              return distribution === "tar" ? tar : gzipSync(tar);
            }
            return document(version);
          };
          const original = artifactBytes("Original");
          const next = artifactBytes("Next");
          const origin = "https://skills.example.test";
          const artifact = archiveDistribution
            ? `${origin}/review.${distribution}`
            : `${origin}/review/SKILL.md`;
          const newerArtifact = archiveDistribution
            ? `${origin}/next.${distribution}`
            : `${origin}/next/SKILL.md`;
          const index = `${origin}/.well-known/${distribution === "index-v01" ? "skills" : "agent-skills"}/index.json`;
          const legacyArtifact = `${origin}/.well-known/skills/review/SKILL.md`;
          const source = distribution === "direct" || archiveDistribution ? artifact : index;
          const responses = new Map<string, Uint8Array>([
            [artifact, original],
            [newerArtifact, next],
            [legacyArtifact, original],
          ]);
          const writeIndex = (url: string, bytes: Uint8Array) => {
            responses.set(
              index,
              new TextEncoder().encode(
                JSON.stringify(
                  distribution === "index-v01"
                    ? { skills: [{ name: "review", files: ["SKILL.md"] }] }
                    : {
                        $schema: WELL_KNOWN_SCHEMA,
                        skills: [
                          {
                            name: "review",
                            type: "skill-md",
                            url,
                            digest: httpArtifactDigest(bytes),
                          },
                        ],
                      },
                ),
              ),
            );
          };
          writeIndex(artifact, original);
          const requests: string[] = [];
          const client = HttpClient.make((request) =>
            Effect.sync(() => {
              requests.push(request.url);
              const body = responses.get(request.url);
              return HttpClientResponse.fromWeb(
                request,
                body === undefined ? new Response(null, { status: 404 }) : new Response(body),
              );
            }),
          );
          const workspace = yield* Effect.acquireRelease(
            Effect.sync(() =>
              makeLifecycleFixture({
                sources: "live",
                settings: { agents: ["claude-code"] },
                httpClient: Layer.succeed(HttpClient.HttpClient, client),
              }),
            ),
            (workspace) => Effect.sync(() => workspace.cleanup()),
          );
          yield* workspace.provide(
            applyInstall(
              installRequest({
                ...(journey === "restore" ? { type: "skill" as const } : {}),
                subject: { kind: "source", source },
              }),
            ),
          );
          const active = path.join(workspace.root, ".claude/skills/review");
          const expectPayload = (version: "Original" | "Next") => {
            expect(fs.readFileSync(path.join(active, "SKILL.md"))).toEqual(
              Buffer.from(document(version)),
            );
            if (archiveDistribution) {
              expect(fs.readFileSync(path.join(active, "metadata.json"), "utf8")).toBe(
                '{"upstream":true}\r\n',
              );
              expect(fs.statSync(path.join(active, "_assets/run.sh")).mode & 0o111).toBe(0o111);
              expect(fs.readlinkSync(path.join(active, "run"))).toBe("_assets/run.sh");
              expect(fs.readdirSync(path.join(active, "empty"))).toEqual([]);
            }
          };
          expectPayload("Original");
          const accepted = yield* workspace.provide(
            Effect.flatMap(LockfileReader, (reader) => reader.entry("skill", "review")),
          );
          expect(Option.isSome(accepted)).toBe(true);
          if (Option.isNone(accepted)) return;
          expect(accepted.value.source.type).toBe("http");
          expect(accepted.value.resolved).toMatchObject(
            distribution === "index-v01"
              ? {
                  format: "files",
                  files: [{ path: "SKILL.md", digest: httpArtifactDigest(original) }],
                }
              : {
                  format: archiveDistribution ? distribution : "skill-md",
                  digest: httpArtifactDigest(original),
                },
          );
          const lockBytes = workspace.readFile("axm-lock.yaml");
          const canonical = fs.realpathSync(active);
          writeIndex(newerArtifact, next);
          const acceptedUrl = distribution === "index-v01" ? legacyArtifact : artifact;
          if (journey !== "advance") {
            fs.rmSync(canonical, { recursive: true });
            requests.length = 0;
            const sync = Effect.gen(function* () {
              if (journey.startsWith("reinstall")) {
                const result = yield* applyUpdate(
                  configuredUpdateRequest({
                    type: "skill",
                    reinstall: true,
                    ...(journey === "reinstall-configured" ? {} : { nameFilters: ["review"] }),
                  }),
                );
                expect(result._tag).toBe("Resolved");
                if (result._tag !== "Resolved") throw new Error("Expected a reinstall operation");
                const failed = result.resolution.units.find((unit) => unit.state === "failed");
                if (failed !== undefined) return yield* Effect.fail(failed);
                return;
              }
              const restored = yield* applySync({
                target: Option.none(),
                types: ["skill"],
              });
              expect(restored._tag).toBe("Resolved");
            });
            yield* workspace.provide(sync);
            expectPayload("Original");
            expect(workspace.readFile("axm-lock.yaml")).toBe(lockBytes);
            expect(requests).not.toContain(index);
            responses.set(acceptedUrl, next);
            fs.rmSync(canonical, { recursive: true });
            yield* workspace.provide(sync).pipe(Effect.flip);
            expect(workspace.readFile("axm-lock.yaml")).toBe(lockBytes);
            expect(fs.existsSync(canonical)).toBe(false);
          } else {
            responses.set(acceptedUrl, next);
            yield* workspace.provide(applyUpdate(configuredUpdateRequest({ type: "skill" })));
            expectPayload("Next");
            yield* workspace.provide(
              Effect.gen(function* () {
                const candidate = yield* UninstallExtensions.prepare({
                  type: Option.some("skill"),
                  selector: "review",
                });
                return yield* UninstallExtensions.previewOrApply(
                  candidate,
                  preapprovedPlanExecution,
                );
              }),
            );
            expect(fs.existsSync(active)).toBe(false);
            const removed = yield* workspace.provide(
              Effect.flatMap(LockfileReader, (reader) => reader.entry("skill", "review")),
            );
            expect(Option.isNone(removed)).toBe(true);
          }
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
      );
    }
  }
});
