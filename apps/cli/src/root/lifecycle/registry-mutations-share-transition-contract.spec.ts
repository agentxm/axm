import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { defineSpecification } from "@agentxm/specification-metadata";
import { AuthClientTest, AuthLoginInteractionTest } from "@agentxm/registry-access/testing";
import { RegistryTransitionSchema } from "@agentxm/workspace-features/publishing";
import {
  makeCliTestContext,
  makeWorkspaceHandlerTestContext,
} from "../../test-support/test-helpers.js";
import { writeWorkspaceFiles } from "../../test-support/test-stubs.js";
import { handleVisibilitySet, handleVisibilityReconcile } from "../visibility/handler.js";
import {
  handleArchive,
  handleUnarchive,
  handleDeprecate,
  handleUndeprecate,
  handleYank,
  handleUnyank,
} from "./command.js";

export const specification = defineSpecification({
  requirement: "cli/registry-mutations-share-transition-contract",
  title: "Registry mutations report one acknowledged transition contract",
  statement:
    "All eight published-extension Registry mutation commands shall emit registry-transition-v1 with their action, Registry origin, unversioned fqn, acknowledged before/after state, changed or already-current disposition, revision, message, and restorable false. An exact version shall appear separately as version. The CLI shall preserve acknowledged no-op outcomes and shall not emit superseded target, authority, or result fields.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "safe-repetition"],
  methods: ["contract", "decision-table"],
  derivedFrom: ["apps/cli/src/machine-output-contracts.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const fqn = "@acme/skills/review";
const timestamp = "2026-09-19T00:00:00.000Z";
const yanked = { yankedAt: timestamp, yankCategory: null, yankMessage: null };
const available = { yankedAt: null, yankCategory: null, yankMessage: null };
const archived = { archivedAt: timestamp, message: "Publisher guidance" };
const deprecated = {
  deprecatedAt: timestamp,
  reason: "unmaintained",
  message: "Publisher guidance",
};

for (const action of [
  "yank",
  "unyank",
  "deprecate",
  "undeprecate",
  "archive",
  "unarchive",
  "visibility-set",
  "visibility-reconcile",
] as const) {
  describe(action, () => {
    for (const alreadyCurrent of [false, true]) {
      it.effect(`preserves the acknowledged ${alreadyCurrent ? "no-op" : "change"}`, () =>
        Effect.acquireUseRelease(
          Effect.sync(() => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-registry-transition-"));
            writeWorkspaceFiles(path.join(root, ".axm"));
            fs.writeFileSync(
              path.join(root, "axm.json"),
              JSON.stringify({
                owner: "@acme",
                agents: [],
                skills: { review: "workspace" },
                publish: { defaultVisibility: "private" },
              }),
            );
            fs.mkdirSync(path.join(root, "skills/review"), { recursive: true });
            fs.writeFileSync(
              path.join(root, "skills/review/skill.json"),
              JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
            );
            fs.writeFileSync(path.join(root, "skills/review/SKILL.md"), "# Review\n");
            return root;
          }),
          (root) =>
            Effect.gen(function* () {
              const visibility = action.startsWith("visibility-");
              const versioned = action === "yank" || action === "unyank";
              const removing =
                action === "unarchive" || action === "undeprecate" || action === "unyank";
              const state = action === "archive" || action === "unarchive" ? archived : deprecated;
              const before = visibility
                ? alreadyCurrent
                  ? "private"
                  : "public"
                : versioned
                  ? alreadyCurrent
                    ? removing
                      ? available
                      : yanked
                    : removing
                      ? yanked
                      : available
                  : alreadyCurrent
                    ? removing
                      ? null
                      : state
                    : removing
                      ? state
                      : null;
              const after = visibility
                ? "private"
                : versioned
                  ? removing
                    ? available
                    : yanked
                  : removing
                    ? null
                    : state;
              const revision = "acknowledged-revision";
              const httpClient = HttpClient.make((request) =>
                Effect.sync(() => {
                  const response =
                    request.method === "GET"
                      ? visibility
                        ? {
                            target: fqn,
                            intent: null,
                            request: null,
                            resolved: null,
                            actual: { value: before, revision: "observed-revision" },
                            comparison: "unconfigured",
                            findings: [],
                          }
                        : {
                            [action === "archive" || action === "unarchive"
                              ? "archival"
                              : "deprecation"]: before,
                            revision: "observed-revision",
                          }
                      : visibility
                        ? {
                            target: fqn,
                            before,
                            after,
                            authority: { kind: "operator" },
                            result: alreadyCurrent ? "already-satisfied" : "changed",
                            revision,
                          }
                        : versioned
                          ? {
                              owner: "@acme",
                              type: "skill",
                              name: "review",
                              version: "1.0.0",
                              ...(removing ? available : yanked),
                              before,
                              disposition: alreadyCurrent ? "already-current" : "changed",
                              revision,
                              links: { html: `https://agentxm.ai/${fqn}` },
                            }
                          : {
                              target: fqn,
                              before,
                              after,
                              disposition: alreadyCurrent
                                ? "unchanged"
                                : removing
                                  ? "restored"
                                  : "created",
                              revision,
                            };
                  return HttpClientResponse.fromWeb(request, Response.json(response));
                }),
              );
              const context = makeWorkspaceHandlerTestContext({
                machine: true,
                httpClient,
                wsOptions: { projectRoot: root },
              });
              yield* Effect.gen(function* () {
                switch (action) {
                  case "yank":
                    yield* handleYank({
                      ref: `${fqn}@1.0.0`,
                      allVersions: false,
                      category: Option.none(),
                      message: Option.none(),
                    });
                    break;
                  case "unyank":
                    yield* handleUnyank(`${fqn}@1.0.0`);
                    break;
                  case "archive":
                    yield* handleArchive({ ref: fqn, message: Option.none(), clearMessage: false });
                    break;
                  case "unarchive":
                    yield* handleUnarchive(fqn);
                    break;
                  case "deprecate":
                    yield* handleDeprecate({
                      ref: fqn,
                      reason: Option.some("unmaintained"),
                      message: Option.none(),
                      replacement: Option.none(),
                      clearMessage: false,
                      clearReplacement: false,
                    });
                    break;
                  case "undeprecate":
                    yield* handleUndeprecate(fqn);
                    break;
                  case "visibility-set":
                    yield* handleVisibilitySet(fqn, "private");
                    break;
                  case "visibility-reconcile":
                    yield* handleVisibilityReconcile(fqn);
                    break;
                }
              }).pipe(
                Effect.provide(
                  Layer.mergeAll(
                    context.fullLayer,
                    AuthClientTest(),
                    AuthLoginInteractionTest().layer,
                  ),
                ),
              );
              expect(context.rendererState.results).toHaveLength(1);
              const result = yield* Schema.encodeUnknownEffect(RegistryTransitionSchema)(
                context.rendererState.results[0]?.data,
              );
              expect(result).toMatchObject({
                contract: "registry-transition-v1",
                action,
                fqn,
                registry: expect.any(String),
                before,
                after,
                revision,
                disposition: alreadyCurrent ? "already-current" : "changed",
                restorable: false,
                message: expect.any(String),
              });
              expect(result).not.toHaveProperty("target");
              expect(result).not.toHaveProperty("authority");
              expect(result).not.toHaveProperty("result");
              if (versioned) expect(result).toHaveProperty("version", "1.0.0");
              else expect(result).not.toHaveProperty("version");
            }),
          (root) => Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
        ),
      );
    }
  });
}

describe("all-available yank", () => {
  for (const before of [["1.0.0", "1.2.3"], []]) {
    it.effect(`reports the acknowledged snapshot of ${before.length} available versions`, () =>
      Effect.gen(function* () {
        const httpClient = HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({
                selection: "all-available",
                affectedVersions: before,
                futureVersionsAffected: false,
                before,
                after: [],
                disposition: before.length === 0 ? "already-current" : "changed",
                revision: "available-snapshot-revision",
              }),
            ),
          ),
        );
        const context = makeCliTestContext({ machine: true, httpClient });
        yield* handleYank({
          ref: fqn,
          allVersions: true,
          category: Option.none(),
          message: Option.none(),
        }).pipe(Effect.provide(context.baseLayer));
        const result = yield* Schema.encodeUnknownEffect(RegistryTransitionSchema)(
          context.rendererState.results[0]?.data,
        );
        expect(result).toMatchObject({
          contract: "registry-transition-v1",
          action: "yank",
          fqn,
          before,
          after: [],
          affectedVersions: before,
          disposition: before.length === 0 ? "already-current" : "changed",
          revision: "available-snapshot-revision",
          restorable: false,
        });
        expect(result).not.toHaveProperty("version");
        expect(result).not.toHaveProperty("target");
      }),
    );
  }
});
