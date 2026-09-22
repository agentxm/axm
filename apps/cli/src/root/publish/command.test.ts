import { startedUnits } from "../../test-support/presenter-test.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { AuthClientTest, DeviceLoginInteractionTest } from "@agentxm/registry-access/testing";
import {
  CommandSemanticPropertiesLive,
  getCommandSemanticProperties,
  isEffectCliExit,
} from "../../cli-runtime/index.js";
import {
  StepFailure,
  renderConfirmationRecoveryCommand,
} from "@agentxm/workspace/transitions/planning";
import {
  extensionTypes,
  extensionTypeToPlural,
} from "@agentxm/extension-model/unstable/extensions";
import { applyPlan, type JobStepResult } from "@agentxm/workspace/transitions/planning";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { RegistryProblem } from "@agentxm/registry-client";
import { GitDirectoryComparison } from "@agentxm/workspace/resolution/sources";
import { GitDirectoryComparisonLive } from "@agentxm/workspace/resolution/sources/live";

import {
  at,
  expectPublishResult,
  expectRecord,
  makeWorkspaceHandlerTestContext,
  property,
} from "../../test-support/test-helpers.js";
import {
  exactVersion,
  extensionName,
  handle,
  versionRange,
} from "../../test-support/test-stubs.js";
import { exitCodeFor } from "../../app-error/index.js";
import { emitPublishResult } from "./result.js";
import { asciiGlyphs, paintText } from "../../screen/index.js";
import type { TestRendererState } from "../../test-support/presenter-test.js";
import {
  normalizePublishResult,
  publishCause,
  type PublishResultItem,
} from "@agentxm/workspace/publishing";
import {
  buildPublishJobs,
  findPackPublishDivergenceFindings,
  isPublishableType,
  publishAuthenticationPreconditions,
  publishRecoverySelection,
  validatePublishOwners,
  PUBLISHABLE_TYPES,
} from "@agentxm/workspace/publishing";
import {
  handleRootPublish,
  makeExactPublishRecovery,
  type RootPublishHandlerArgs,
} from "./command.js";

describe("pack publish resolution divergence", () => {
  const packCandidate = {
    fqn: "@acme/packs/reviewers",
    type: "pack" as const,
    authored: true,
    version: exactVersion("0.1.1"),
    dependencies: { "@acme/skills/review": versionRange("^0.0.4") },
  };
  const reachability = [
    {
      packFqn: "@acme/packs/reviewers",
      packAuthority: "workspace" as const,
      manifestPath: "packs/reviewers/pack.json",
      memberFqn: "@acme/skills/review",
      constraint: "^0.0.4",
      memberVersion: "0.0.5",
      memberAuthority: "workspace" as const,
      classification: "satisfying" as const,
    },
  ];

  it("does not warn when effective versions agree or the pack is not authored here", () => {
    const admittedPack = {
      target: {
        owner: handle("@acme"),
        type: "pack" as const,
        name: extensionName("reviewers"),
        version: exactVersion("0.1.1"),
      },
      status: "admitted" as const,
      findings: [],
      resolutions: [
        {
          dependency: {
            owner: handle("@acme"),
            type: "skill" as const,
            name: extensionName("review"),
            range: versionRange("^0.0.4"),
          },
          effectiveVersion: exactVersion("0.0.5"),
        },
      ],
    };
    expect(
      findPackPublishDivergenceFindings({
        candidates: [packCandidate],
        reachability,
        packs: [admittedPack],
      }).size,
    ).toBe(0);
    expect(
      findPackPublishDivergenceFindings({
        candidates: [{ ...packCandidate, authored: false }],
        reachability,
        packs: [
          {
            ...admittedPack,
            resolutions: [
              {
                dependency: {
                  owner: handle("@acme"),
                  type: "skill",
                  name: extensionName("review"),
                  range: versionRange("^0.0.4"),
                },
                effectiveVersion: exactVersion("0.0.4"),
              },
            ],
          },
        ],
      }).size,
    ).toBe(0);
  });
});

const args = (
  registryUrl: string,
  overrides?: Partial<RootPublishHandlerArgs>,
): RootPublishHandlerArgs => ({
  selectors: [],
  owners: [],
  types: [],
  excludes: [],
  registry: Option.none(),
  registryUrl: Option.some(registryUrl),
  onExisting: Option.none(),
  backfill: false,
  acceptWarnings: false,
  preview: true,
  scope: "project",
  visibility: Option.none(),
  includeDependencies: false,
  ...overrides,
});

describe("root publish", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-root-publish-test-"));
    fs.mkdirSync(path.join(tempDir, ".axm"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "registry"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({ owner: "@acme", agents: [] }),
    );
    fs.writeFileSync(path.join(tempDir, "axm-lock.yaml"), "lockfileVersion: 8\nskills: {}\n");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeContext = (
    machine = true,
    flags?: { readonly quiet?: boolean; readonly verbose?: boolean },
  ) => {
    const context = makeWorkspaceHandlerTestContext({
      machine,
      wsOptions: { projectRoot: tempDir },
      ...(flags === undefined ? {} : { flags }),
    });
    const interaction = DeviceLoginInteractionTest();
    const gitDirectoryComparisonLayer = Layer.provide(
      GitDirectoryComparisonLive,
      context.fullLayer,
    );
    return {
      ...context,
      provide: Effect.provide(
        Layer.mergeAll(
          context.fullLayer,
          AuthClientTest(),
          interaction.layer,
          gitDirectoryComparisonLayer,
        ),
      ),
    };
  };

  const writeReviewSkill = () => {
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({
        owner: "@acme",
        agents: [],
        skills: { review: "workspace" },
      }),
    );
    const skillDir = path.join(tempDir, "skills", "review");
    fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "skill.json"),
      JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(skillDir, "src", "SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
    );
  };

  it("reports authentication as a human-blocked preview precondition only when needed", () => {
    expect(
      publishAuthenticationPreconditions({
        preview: true,
        remoteRegistry: true,
        authenticated: false,
        hasPublishCandidates: true,
      }),
    ).toEqual([
      {
        id: "authentication",
        label: "Sign-in",
        status: "unmet",
        detail: "Publishing requires you to be signed in. Run `axm login`, then publish.",
        blockedOn: "human",
      },
    ]);

    expect(
      [
        { preview: false, remoteRegistry: true, authenticated: false },
        { preview: true, remoteRegistry: false, authenticated: false },
        { preview: true, remoteRegistry: true, authenticated: true },
      ].map((options) =>
        publishAuthenticationPreconditions({ ...options, hasPublishCandidates: true }),
      ),
    ).toEqual([[], [], []]);
  });

  it.effect("creates no server state during a signed-out preview", () => {
    writeReviewSkill();
    const context = makeWorkspaceHandlerTestContext({
      machine: true,
      wsOptions: { projectRoot: tempDir },
    });
    const writes: Array<string> = [];
    const httpClient = HttpClient.make((request) =>
      Effect.sync(() => {
        const url = new URL(request.url);
        if (request.method !== "GET") writes.push(`${request.method} ${url.pathname}`);
        if (request.method === "GET" && url.pathname === "/v1/owners/%40acme") {
          return HttpClientResponse.fromWeb(
            request,
            new Response(JSON.stringify({ displayName: "Acme" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          );
        }
        return HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({
              type: "about:blank",
              title: "Not Found",
              status: 404,
              detail: "Extension not found",
              code: "not_found",
            }),
            { status: 404, headers: { "content-type": "application/json" } },
          ),
        );
      }),
    );
    const provide = Effect.provide(
      Layer.mergeAll(
        context.fullLayer,
        AuthClientTest(),
        DeviceLoginInteractionTest().layer,
        Layer.succeed(HttpClient.HttpClient, httpClient),
        Layer.provide(GitDirectoryComparisonLive, context.fullLayer),
      ),
    );

    return provide(
      Effect.gen(function* () {
        yield* handleRootPublish(
          args("https://registry.example.com", { visibility: Option.some("private") }),
        );

        expect(writes).toEqual([]);
        const result = expectPublishResult(at(context.rendererState.results, 0).data, {
          mode: "preview",
          count: 1,
        });
        const preconditions = property(
          expectRecord(property(result, "execution")),
          "preconditions",
        );
        if (!Array.isArray(preconditions)) throw new Error("Expected preview preconditions");
        expect(expectRecord(at(preconditions, 0))).toMatchObject({
          id: "authentication",
          status: "unmet",
        });
      }),
    );
  });

  it.effect(
    "validates each unique publish owner and links missing owners to organization creation",
    () =>
      Effect.gen(function* () {
        const checked: Array<string> = [];
        const client = {
          ownerExists: (owner: ReturnType<typeof handle>) => {
            checked.push(owner);
            return Effect.succeed({ exists: owner !== "@missing" });
          },
        };

        const error = yield* Effect.flip(
          validatePublishOwners([handle("@acme"), handle("@acme"), handle("@missing")], client),
        );

        expect(checked.sort()).toEqual(["@acme", "@missing"]);
        expect(error.category).toBe("not_found");
        expect(error.detail).toContain("@missing");
        expect(error.suggestions).toEqual([
          {
            description: "Create the organization in AgentXM before publishing.",
            url: "https://agentxm.ai/orgs/new",
          },
        ]);
      }),
  );

  describe("human output", () => {
    /** What a person reads on stdout, painted without colour or width limits. */
    const painted = (state: TestRendererState): ReadonlyArray<string> =>
      state.docs.flatMap((entry) =>
        entry.channel === "stdout"
          ? paintText(entry.doc, { width: "unbounded", colors: false, glyphs: asciiGlyphs })
          : [],
      );

    const differsFromHead = Effect.provideService(GitDirectoryComparison, {
      compare: ({ directory }) =>
        Effect.succeed(
          Option.some({
            repositoryRoot: path.dirname(path.dirname(directory)),
            repositoryDirectory: `skills/${path.basename(directory)}`,
            headRevision: "0123456789abcdef0123456789abcdef01234567",
            differences: [{ path: "src/SKILL.md", change: "modified" }],
          }),
        ),
    });

    it.effect("previews one plan ledger instead of a sentence per fact", () => {
      writeReviewSkill();
      const { provide, rendererState } = makeContext(false);
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl));

          // The view owns the preview, so the execution plan is not printed too.
          expect(rendererState.docs.map((entry) => entry.channel)).toEqual(["stdout"]);
          expect(painted(rendererState)).toEqual([
            "Previewing publish  as @acme - to override",
            "",
            "     Extension                     Version   Plan      Detail",
            " +   @acme/skills/review           1.0.0     publish   2 files, 340 B",
            "",
            "     Visibility                    public (from platform defaults)",
            "",
            "Would publish 1 extension  nothing was uploaded",
            "--verbose for details",
          ]);
        }),
      );
    });

    it.effect("shows the evidence behind each row with --verbose", () => {
      writeReviewSkill();
      const { provide, rendererState } = makeContext(false, { verbose: true });
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl));

          const lines = painted(rendererState);
          expect(lines).toContain("     visibility public from platform defaults");
          expect(lines).toContain("     archive 2 included, 0 excluded, 122 B source, 340 B ZIP");
          expect(lines).toContain("     include src/SKILL.md (56 B)");
          expect(lines).toContain("     dependency order 0");
          expect(lines).not.toContain("--verbose for details");
        }),
      );
    });

    it.effect("settles an apply as a result ledger with visibility in the verdict", () => {
      writeReviewSkill();
      const { provide, rendererState } = makeContext(false);
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl, { preview: false }));

          expect(painted(rendererState)).toEqual([
            "Publishing  as @acme - to override",
            "",
            "     Extension                     Version   Status      Detail",
            " +   @acme/skills/review           1.0.0     published",
            "",
            "Published 1 extension  public - 0ms",
          ]);
          expect(startedUnits(rendererState)).toContain("publish registry");
          expect(startedUnits(rendererState)).toContain("publish candidates");
          // The apply phase reaches the observer as a typed lifecycle event.
          expect(
            rendererState.events.some(
              (event) => event._tag === "PhaseStarted" && event.phase === "apply",
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("states that a version is already published without a ledger", () => {
      writeReviewSkill();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;
      const first = makeContext(false);
      const second = makeContext(false);

      return first.provide(handleRootPublish(args(registryUrl, { preview: false }))).pipe(
        Effect.andThen(
          second.provide(
            Effect.gen(function* () {
              yield* handleRootPublish(args(registryUrl, { preview: false }));
              expect(painted(second.rendererState)).toEqual([
                " ok  @acme/skills/review@1.0.0 is already published and verified",
              ]);
            }),
          ),
        ),
      );
    });

    it.effect("keeps an already-published verification quiet under --quiet", () => {
      writeReviewSkill();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;
      const first = makeContext(false);
      const second = makeContext(false, { quiet: true });

      return first.provide(handleRootPublish(args(registryUrl, { preview: false }))).pipe(
        Effect.andThen(
          second.provide(
            Effect.gen(function* () {
              yield* handleRootPublish(args(registryUrl, { preview: false }));
              expect(painted(second.rendererState)).toEqual([]);
            }),
          ),
        ),
      );
    });

    it.effect("blocks on a source that differs from Git HEAD and ends with its exit code", () => {
      writeReviewSkill();
      const { provide, rendererState } = makeContext(false);
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          const exit = yield* handleRootPublish(args(registryUrl, { preview: false })).pipe(
            differsFromHead,
            Effect.exit,
          );

          // The reported outcome is the whole report: the invocation ends with
          // its exit code, not with a second problem on stderr.
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            const squashed = Cause.squash(exit.cause);
            expect(isEffectCliExit(squashed) ? squashed.exitCode : undefined).toBe(2);
          }
          const lines = painted(rendererState);
          expect(lines).toContain(
            " !!  @acme/skills/review           1.0.0     blocked   1 path differs from HEAD",
          );
          expect(lines).toContain(
            " !!  Publish is blocked — an explicit override is required   1 blocked, exit 2",
          );
          expect(
            rendererState.suggestions.some((suggestion) =>
              suggestion.cmd?.includes("--accept-warnings"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("names the source state once as a field when the override is accepted", () => {
      writeReviewSkill();
      const { provide, rendererState } = makeContext(false);
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl, { acceptWarnings: true })).pipe(
            differsFromHead,
          );

          expect(painted(rendererState)).toContain(
            "     Source                        differs from Git HEAD 0123456",
          );
        }),
      );
    });

    it.effect("renders an explicit empty-selection outcome", () => {
      const { provide, rendererState } = makeContext(false);
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl, { preview: false }));

          expect(painted(rendererState)).toEqual([" ok  No extensions selected for publishing"]);
        }),
      );
    });

    const publishedReview = normalizePublishResult({
      mode: "apply",
      results: [
        {
          id: "@acme/skills/review",
          owner: handle("@acme"),
          type: "skill",
          name: extensionName("review"),
          version: exactVersion("1.0.0"),
          action: "publish",
          phase: "upload_execution",
          status: "success",
          reason: "selected",
          visibility: { value: "public", disposition: "establish", source: "manifest" },
          links: { html: "https://agentxm.ai/acme/skills/review" },
        },
      ],
    });

    it.effect("prints the registry page as a copyable line beneath the verdict", () => {
      const { provide, rendererState } = makeContext(false);

      return provide(
        Effect.gen(function* () {
          yield* emitPublishResult(publishedReview, { exitCode: 0, elapsedMs: 1_200 });

          expect(painted(rendererState).slice(-2)).toEqual([
            "Published 1 extension  public - 1.2s",
            "https://agentxm.ai/acme/skills/review",
          ]);
          // The page is already on screen, so the next steps do not repeat it.
          expect(rendererState.suggestions).toEqual([]);
        }),
      );
    });

    it.effect("keeps the browser suggestion in the machine document", () => {
      const { provide, rendererState } = makeContext(true);

      return provide(
        Effect.gen(function* () {
          yield* emitPublishResult(publishedReview, { exitCode: 0 });

          expect(rendererState.suggestions).toContainEqual({
            description: "View in browser",
            url: "https://agentxm.ai/acme/skills/review",
          });
        }),
      );
    });

    it.effect("renders a retryable upload failure and an exact continuation", () => {
      const { provide, rendererState } = makeContext(false);
      const retryableCause = publishCause(
        new RegistryProblem({
          category: "unavailable",
          detail: "Registry upload is temporarily unavailable.",
          cause: new Error("registry upload unavailable"),
          metadata: {
            response: { status: 503, requestId: "req_retry" },
            requestPolicy: {
              retryable: true,
              attemptCount: 1,
              maxAttempts: 1,
              exhausted: true,
              stoppedBy: "replay-unsafe",
              replaySafety: "mutation",
            },
          },
        }),
      );

      return provide(
        Effect.gen(function* () {
          yield* emitPublishResult(
            normalizePublishResult({
              mode: "apply",
              results: [
                {
                  id: "@acme/skills/review",
                  owner: handle("@acme"),
                  type: "skill",
                  name: extensionName("review"),
                  version: exactVersion("1.0.0"),
                  action: "error",
                  phase: "upload_execution",
                  status: "failed",
                  reason: "upload_failed",
                  message: "Registry upload is temporarily unavailable.",
                  cause: retryableCause,
                },
              ],
              recovery: {
                description: "Continue the failed items and their blocked dependents",
                cmd: "axm publish --on-existing verify @acme/skills/review",
                remainingItems: ["@acme/skills/review"],
                blockedDependents: [],
              },
            }),
            { exitCode: 8 },
          );

          expect(painted(rendererState)).toEqual([
            "Publishing  as @acme - to unknown",
            "",
            "     Extension                     Version   Status   Detail",
            " xx  @acme/skills/review           1.0.0     failed   upload failed, retryable",
            "     Registry upload is temporarily unavailable.",
            "     request req_retry",
            "",
            "Publish failed for 1 extension  1 failed - exit 8",
            "",
            "Next",
            "     axm publish --on-existing verify @acme/skills/review   Continue the failed items and their blocked dependents",
          ]);
        }),
      );
    });

    it.effect("states the attempts and message behind a failure with --verbose", () => {
      const { provide, rendererState } = makeContext(false, { verbose: true });

      return provide(
        Effect.gen(function* () {
          yield* emitPublishResult(
            normalizePublishResult({
              mode: "apply",
              results: [
                {
                  id: "@acme/skills/review",
                  owner: handle("@acme"),
                  type: "skill",
                  name: extensionName("review"),
                  version: exactVersion("1.0.0"),
                  action: "error",
                  phase: "upload_execution",
                  status: "failed",
                  reason: "upload_failed",
                  message: "Registry upload is temporarily unavailable.",
                  cause: {
                    code: "unavailable",
                    class: "external",
                    message: "Registry upload is temporarily unavailable.",
                    retryable: true,
                    attemptCount: 1,
                    maxAttempts: 1,
                    requestId: "req_retry",
                  },
                },
              ],
            }),
            { exitCode: 8 },
          );

          expect(painted(rendererState)).toEqual(
            expect.arrayContaining([
              "     failed during upload, attempts exhausted at 1 of 1",
              "     Registry upload is temporarily unavailable.",
              "     request req_retry",
            ]),
          );
        }),
      );
    });

    it.effect("reports an apply that confirmed nothing as an unsettled outcome", () => {
      const { provide, rendererState } = makeContext(false);
      const unknownItem = (name: string): PublishResultItem => ({
        id: `@acme/skills/${name}`,
        owner: handle("@acme"),
        type: "skill",
        name: extensionName(name),
        version: exactVersion("1.0.0"),
        action: "publish",
        phase: "upload_execution",
        status: "unknown",
        reason: "settlement_unresolved",
        settlement: "unresolved",
        message:
          "The Registry may have committed this version, but bounded readback and one exact replay could not prove the outcome.",
      });

      return provide(
        Effect.gen(function* () {
          yield* emitPublishResult(
            normalizePublishResult({
              mode: "apply",
              results: [unknownItem("review"), unknownItem("triage")],
            }),
            { exitCode: 3 },
          );

          const lines = painted(rendererState);
          for (const name of ["review", "triage"]) {
            expect(lines).toContain(
              ` !!  @acme/skills/${name}           1.0.0     unconfirmed   registry settlement could not be verified`,
            );
          }
          expect(lines).toContain("Publish did not confirm 2 extensions  2 unconfirmed - exit 3");
          expect(lines.join("\n")).not.toContain("No extensions published");
        }),
      );
    });

    it.effect("keeps the settled verdict under --quiet", () => {
      const context = makeWorkspaceHandlerTestContext({
        machine: false,
        wsOptions: { projectRoot: tempDir },
        flags: { quiet: true },
      });

      return Effect.provide(
        Effect.gen(function* () {
          yield* emitPublishResult(publishedReview, { exitCode: 0 });
          expect(painted(context.rendererState)).toContain("Published 1 extension  public");
          expect(painted(context.rendererState).join("\n")).not.toContain("Publishing");
        }),
        context.fullLayer,
      );
    });
  });

  describe("existing version policy", () => {
    const writeSkill = (name: string, version: string) => {
      const skillDir = path.join(tempDir, "skills", name);
      fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "skill.json"),
        JSON.stringify({ owner: "@acme", type: "skill", name, version }),
      );
      fs.writeFileSync(
        path.join(skillDir, "src", "SKILL.md"),
        `---\nname: ${name}\ndescription: Review code\n---\n\n# ${name}\n`,
      );
    };

    const writeSkillSettings = (names: ReadonlyArray<string>) => {
      fs.writeFileSync(
        path.join(tempDir, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: Object.fromEntries(names.map((name) => [name, "workspace"])),
        }),
      );
      for (const name of names) writeSkill(name, "1.0.0");
    };

    it.effect("publishes one new version while verifying nineteen existing versions", () => {
      const existing = Array.from({ length: 19 }, (_, index) => `existing-${index + 1}`);
      writeSkillSettings(["new-release", ...existing]);
      const { provide, rendererState } = makeContext(false);
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl, { preview: false }));
          writeSkill("new-release", "1.1.0");
          yield* handleRootPublish(args(registryUrl, { preview: false }));

          const result = expectPublishResult(at(rendererState.results, 1).data, {
            mode: "apply",
            count: 20,
          });
          const counts = expectRecord(property(result, "counts"));
          expect(counts).toMatchObject({
            selected: 20,
            published: 1,
            alreadyPublished: 19,
            blocked: 0,
            failed: 0,
          });
        }),
      );
    });
  });

  describe("publish safety gates", () => {
    const skillDir = () => path.join(tempDir, "skills", "review");

    const writeReviewSkill = (version: string) => {
      fs.mkdirSync(path.join(skillDir(), "src"), { recursive: true });
      fs.writeFileSync(
        path.join(skillDir(), "skill.json"),
        JSON.stringify({ owner: "@acme", type: "skill", name: "review", version }),
      );
      fs.writeFileSync(
        path.join(skillDir(), "src", "SKILL.md"),
        "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
      );
      fs.writeFileSync(
        path.join(tempDir, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: { review: "workspace" },
        }),
      );
    };

    const explicit = (registryUrl: string, overrides?: Partial<RootPublishHandlerArgs>) =>
      args(registryUrl, {
        selectors: ["@acme/skills/review"],
        preview: false,
        ...overrides,
      });

    describe("version monotonicity", () => {
      it.effect("rejects a version below the highest published version", () => {
        const { provide, rendererState } = makeContext(false);
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            writeReviewSkill("1.1.0");
            yield* handleRootPublish(args(registryUrl, { preview: false }));

            writeReviewSkill("1.0.5");
            const exit = yield* handleRootPublish(explicit(registryUrl)).pipe(Effect.exit);

            // The reported outcome carries the failure's recoveries and ends
            // with the conflict's exit code.
            expect(Exit.isFailure(exit)).toBe(true);
            if (Exit.isFailure(exit)) {
              const squashed = Cause.squash(exit.cause);
              expect(isEffectCliExit(squashed) ? squashed.exitCode : undefined).toBe(
                exitCodeFor("conflict"),
              );
            }
            const reported = rendererState.docs
              .flatMap((entry) => paintText(entry.doc, { width: "unbounded", colors: false }))
              .join("\n");
            expect(reported).toContain("lower than the highest published version 1.1.0");
            expect(
              rendererState.suggestions.some(
                (suggestion) => suggestion.cmd === "axm version @acme/skills/review patch",
              ),
            ).toBe(true);
            expect(
              rendererState.suggestions.some((suggestion) =>
                suggestion.description.includes("--backfill"),
              ),
            ).toBe(true);
          }),
        );
      });
    });
  });

  describe("result versions", () => {
    const writeExternallySourcedExtensions = () => {
      fs.writeFileSync(
        path.join(tempDir, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: { review: "@acme/skills/review@^1" },
          mcpServers: { review: "@acme/mcps/review@^1" },
          subagents: { review: "@acme/subagents/review@^1" },
          rules: { review: "@acme/rules/review@^1" },
          hooks: { review: "@acme/hooks/review@^1" },
          knowledge: { review: "@acme/knowledge/review@^1" },
          packs: { review: "@acme/packs/review@^1" },
        }),
      );
    };

    it.effect(
      "rejects every explicitly selected Registry extension before archive construction",
      () => {
        writeExternallySourcedExtensions();
        const { provide, rendererState } = makeContext();
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            const selectors = extensionTypes.map(
              (type) => `@acme/${extensionTypeToPlural[type]}/review`,
            );
            for (const [index, selector] of selectors.entries()) {
              const exit = yield* handleRootPublish(
                args(registryUrl, { preview: false, selectors: [selector] }),
              ).pipe(Effect.exit);

              const data = at(rendererState.results, index).data;
              const result = expectPublishResult(data, { mode: "apply", count: 1 });
              const results = property(result, "results");
              if (!Array.isArray(results)) throw new Error("Expected publish results");
              const item = expectRecord(at(results, 0));
              expect(property(item, "action")).toBe("error");
              expect(property(item, "reason")).toBe("not_authored");
              expect(property(item, "message")).toContain(`axm adopt ${selector}`);
              expect(property(item, "message")).toContain(`axm fork ${selector}`);
              expect(Object.keys(item)).not.toContain("version");
              expect(JSON.stringify(data)).not.toContain("0.0.0");
              expect(rendererState.results[index]?.ok).toBe(false);
              expect(Exit.isFailure(exit)).toBe(true);
              if (Exit.isFailure(exit)) {
                expect(isEffectCliExit(Cause.squash(exit.cause))).toBe(true);
              }
            }
            expect(rendererState.results).toHaveLength(selectors.length);
          }),
        );
      },
    );
  });

  describe("command telemetry", () => {
    const writeReviewSkill = (settings: Record<string, unknown> = {}) => {
      fs.writeFileSync(
        path.join(tempDir, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: { review: "workspace" },
          ...settings,
        }),
      );
      const skillDir = path.join(tempDir, "skills", "review");
      fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "skill.json"),
        JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
      );
      fs.writeFileSync(
        path.join(skillDir, "src", "SKILL.md"),
        "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
      );
    };

    const semanticProperties = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        yield* effect;
        return yield* getCommandSemanticProperties;
      }).pipe(Effect.provide(CommandSemanticPropertiesLive));

    it.effect("reports a previewed outcome and the selected subject type", () => {
      writeReviewSkill();
      const { provide } = makeContext();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          const properties = yield* semanticProperties(handleRootPublish(args(registryUrl)));

          expect(properties["cli.outcome"]).toBe("previewed");
          expect(properties["cli.subject_type"]).toBe("skill");
          expect(properties["cli.source_kind"]).toBe("workspace");
          expect(properties["cli.applied_count"]).toBe(0);
          expect(properties["cli.failed_count"]).toBe(0);
        }),
      );
    });

    it.effect("reports an applied outcome with the published count", () => {
      writeReviewSkill();
      const { provide } = makeContext();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          const properties = yield* semanticProperties(
            handleRootPublish(args(registryUrl, { preview: false })),
          );

          expect(properties["cli.outcome"]).toBe("applied");
          expect(properties["cli.subject_type"]).toBe("skill");
          expect(properties["cli.applied_count"]).toBe(1);
          expect(properties["cli.failed_count"]).toBe(0);
        }),
      );
    });

    it.effect("reports a no-op outcome for an empty selection", () => {
      const { provide } = makeContext();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          const properties = yield* semanticProperties(
            handleRootPublish(args(registryUrl, { preview: false })),
          );

          expect(properties["cli.outcome"]).toBe("no-op");
          expect(properties["cli.subject_type"]).toBe("unknown");
          expect(properties["cli.applied_count"]).toBe(0);
        }),
      );
    });

    it.effect("does not report an unsettled apply as a no-op", () => {
      const { provide } = makeContext();

      return provide(
        Effect.gen(function* () {
          const properties = yield* semanticProperties(
            emitPublishResult(
              normalizePublishResult({
                mode: "apply",
                results: [
                  {
                    id: "@acme/skills/review",
                    owner: handle("@acme"),
                    type: "skill",
                    name: extensionName("review"),
                    version: exactVersion("1.0.0"),
                    action: "publish",
                    phase: "upload_execution",
                    status: "unknown",
                    reason: "settlement_unresolved",
                    settlement: "unresolved",
                  },
                ],
              }),
              { exitCode: 1 },
            ),
          );

          expect(properties["cli.outcome"]).not.toBe("no-op");
          expect(properties["cli.outcome"]).toBe("failed");
          expect(properties["cli.applied_count"]).toBe(0);
          expect(properties["cli.failed_count"]).toBe(1);
        }),
      );
    });

    it.effect("reports mixed subject types across a multi-type selection", () => {
      writeReviewSkill({ rules: { style: "workspace" } });
      const ruleDir = path.join(tempDir, "rules", "style");
      fs.mkdirSync(path.join(ruleDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(ruleDir, "rule.json"),
        JSON.stringify({ owner: "@acme", type: "rule", name: "style", version: "1.0.0" }),
      );
      fs.writeFileSync(path.join(ruleDir, "src", "RULE.md"), "# Style\n\nUse tabs.\n");
      const { provide } = makeContext();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          const properties = yield* semanticProperties(
            handleRootPublish(args(registryUrl, { preview: false })),
          );

          expect(properties["cli.subject_type"]).toBe("mixed");
          expect(properties["cli.applied_count"]).toBe(2);
        }),
      );
    });
  });
});

describe("publish recovery", () => {
  it("replays the exact admitted identities through the generic root command", () => {
    const recovery = makeExactPublishRecovery(
      {
        registry: Option.some("private"),
        registryUrl: Option.none(),
        backfill: false,
        acceptWarnings: false,
        visibility: Option.some("private"),
      },
      ["@acme/skills/review", "@acme/packs/toolkit"],
    );

    expect(renderConfirmationRecoveryCommand(recovery, { approval: "none" })).toBe(
      "axm publish --registry private --on-existing verify --visibility private @acme/skills/review @acme/packs/toolkit",
    );
  });

  it("selects only failed items and dependents blocked by them", () => {
    const base = {
      owner: handle("@acme"),
      type: "skill" as const,
      sourceType: "workspace" as const,
      authored: true,
      phase: "upload_execution" as const,
    };
    const items: ReadonlyArray<PublishResultItem> = [
      {
        ...base,
        id: "@acme/skills/published",
        name: extensionName("published"),
        action: "publish",
        reason: "selected",
        status: "success",
      },
      {
        ...base,
        id: "@acme/skills/review",
        name: extensionName("review"),
        action: "error",
        reason: "upload_failed",
        status: "failed",
      },
      {
        ...base,
        id: "@acme/packs/toolkit",
        type: "pack",
        name: extensionName("toolkit"),
        action: "error",
        phase: "dependency_execution",
        reason: "blocked_by_dependency",
        status: "blocked",
        blockedBy: ["@acme/skills/review"],
      },
    ];
    const selection = publishRecoverySelection(items);

    expect(selection).toEqual({
      remainingItems: ["@acme/skills/review", "@acme/packs/toolkit"],
      blockedDependents: ["@acme/packs/toolkit"],
    });
    expect(
      renderConfirmationRecoveryCommand(
        makeExactPublishRecovery(
          {
            registry: Option.some("private"),
            registryUrl: Option.none(),
            backfill: false,
            acceptWarnings: false,
            visibility: Option.none(),
          },
          selection.remainingItems,
        ),
        { approval: "none" },
      ),
    ).toBe(
      "axm publish --registry private --on-existing verify @acme/skills/review @acme/packs/toolkit",
    );
  });
});

describe("root publish dependency planning", () => {
  const success: JobStepResult = { result: "success", message: "Published" };
  const stepFor = (candidate: { readonly fqn: string }) => ({
    readiness: "ready" as const,
    label: `Publish ${candidate.fqn}`,
    run: Effect.succeed(success),
  });

  it("records selected pack dependencies as causal execution edges", () => {
    const dependency = {
      fqn: "@acme/skills/review",
      type: "skill",
    } as const;
    const pack = {
      fqn: "@acme/packs/toolkit",
      type: "pack",
      dependencies: { "@acme/skills/review": "^1.0.0" },
    } as const;

    const jobs = buildPublishJobs([dependency, pack], stepFor);

    expect(jobs).toHaveLength(1);
    expect(at(jobs, 0)).toMatchObject({
      concurrency: 4,
      executionPolicy: "best-effort",
    });
    expect(at(jobs, 0).steps.map((step) => step.label)).toEqual([
      "Publish @acme/skills/review",
      "Publish @acme/packs/toolkit",
    ]);
    expect(at(at(jobs, 0).steps, 1).dependsOn).toEqual(["@acme/skills/review"]);
  });

  it("does not broaden a pack-only selection", () => {
    const pack = {
      fqn: "@acme/packs/toolkit",
      type: "pack",
      dependencies: { "@acme/skills/review": "^1.0.0" },
    } as const;

    const jobs = buildPublishJobs([pack], stepFor);

    expect(jobs).toHaveLength(1);
    expect(at(jobs, 0).steps.map((step) => step.label)).toEqual(["Publish @acme/packs/toolkit"]);
  });

  it.effect("blocks packs when a selected dependency fails", () =>
    Effect.gen(function* () {
      const dependency = {
        fqn: "@acme/skills/review",
        type: "skill",
      } as const;
      const pack = {
        fqn: "@acme/packs/toolkit",
        type: "pack",
        dependencies: { "@acme/skills/review": "^1.0.0" },
      } as const;
      const jobs = buildPublishJobs([dependency, pack], (candidate) => ({
        readiness: "ready",
        label: `Publish ${candidate.fqn}`,
        run:
          candidate.type === "skill"
            ? Effect.fail(new StepFailure({ category: "conflict", detail: "Dependency failed" }))
            : Effect.succeed(success),
      }));

      const executed = yield* applyPlan({
        _tag: "Plan",
        name: "Publish extensions",
        description: Option.none(),
        jobs,
      });

      expect(at(at(executed.jobs, 0).steps, 0).result.result).toBe("error");
      expect(at(at(executed.jobs, 0).steps, 1)).toMatchObject({
        blockedBy: ["@acme/skills/review"],
        result: {
          result: "error",
          message: "blocked by failed dependency: @acme/skills/review",
        },
      });
    }),
  );

  it.effect("continues independent candidates after a dependency failure", () =>
    Effect.gen(function* () {
      const dependency = { fqn: "@acme/skills/review", type: "skill" } as const;
      const independent = { fqn: "@acme/skills/format", type: "skill" } as const;
      const pack = {
        fqn: "@acme/packs/toolkit",
        type: "pack",
        dependencies: { "@acme/skills/review": "^1.0.0" },
      } as const;
      const jobs = buildPublishJobs([dependency, pack, independent], (candidate) => ({
        readiness: "ready",
        label: `Publish ${candidate.fqn}`,
        run:
          candidate.fqn === dependency.fqn
            ? Effect.fail(new StepFailure({ category: "conflict", detail: "Dependency failed" }))
            : Effect.succeed(success),
      }));

      const executed = yield* applyPlan({
        _tag: "Plan",
        name: "Publish extensions",
        description: Option.none(),
        jobs,
      });

      expect(at(at(executed.jobs, 0).steps, 1).blockedBy).toEqual([dependency.fqn]);
      expect(at(at(executed.jobs, 0).steps, 2).result.result).toBe("success");
    }),
  );
});

describe("publish type policy", () => {
  it("covers every extension type; every type is publishable", () => {
    expect(Object.keys(PUBLISHABLE_TYPES).sort()).toEqual([...extensionTypes].sort());
    for (const type of extensionTypes) {
      expect(isPublishableType(type)).toBe(true);
    }
  });
});
