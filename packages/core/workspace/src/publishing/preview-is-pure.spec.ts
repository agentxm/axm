import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  PUBLISH_PROTECTED_STATE,
  makePublishWorld,
  publishDocument,
  requestFor,
  runPublish,
  type ProtectedStateSnapshot,
  type PublishWorld,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/preview-is-pure",
  title: "Publish preview reports the admitted publication set without distributing anything",
  statement:
    "When publish runs in preview mode, AXM shall report the admitted publication set or identify missing exact-publication authorization with a next action for the same selection, without creating authorization, uploading anything to the target registry, or changing settings, the lockfile, or authored content.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "trustworthy-distribution"],
  methods: ["example"],
  // The gate decision itself — blocked in preview and apply alike, with the
  // violated rule named — belongs to cli/publish/publication-gate-is-fixed;
  // the refused preview here is a witness of the purity clause only.
  derivedFrom: [
    "cli/publish/preview-is-pure-and-gate-is-fixed",
    "cli/publish/publication-gate-is-fixed",
    "cli/hooks/publish/preview-is-pure",
    "cli/knowledge/publish/preview-is-pure",
    "cli/mcps/publish/preview-is-pure",
    "cli/packs/publish/preview-is-pure",
    "cli/rules/publish/preview-is-pure",
    "cli/skills/publish/preview-is-pure",
    "cli/subagents/publish/preview-is-pure",
  ],
  supersedes: [
    "cli/publish/preview-is-pure-and-gate-is-fixed",
    // Publishing means one thing for every authored type, so the rule is
    // stated once and demonstrated across the seven-type table below.
    "cli/hooks/publish/preview-is-pure",
    "cli/knowledge/publish/preview-is-pure",
    "cli/mcps/publish/preview-is-pure",
    "cli/packs/publish/preview-is-pure",
    "cli/rules/publish/preview-is-pure",
    "cli/skills/publish/preview-is-pure",
    "cli/subagents/publish/preview-is-pure",
  ],
  assumptions: [
    "Which routes accept --preview and refuse --yes is command grammar, asserted over every route by cli/preview-uses-the-canonical-flag rather than per type here.",
  ],
  openQuestions: [],
});

/** A remote Registry that answers reads and dies on anything that would write. */
const readOnlyRegistry = HttpClient.make((request) => {
  if (request.method !== "GET") {
    return Effect.die(new Error("Preview must not create authority or upload"));
  }
  const ownerRead = new URL(request.url).pathname === "/v1/owners/%40acme";
  return Effect.succeed(
    HttpClientResponse.fromWeb(
      request,
      new Response(
        JSON.stringify(
          ownerRead
            ? { displayName: "Acme" }
            : {
                type: "about:blank",
                title: "Not Found",
                status: 404,
                detail: "Extension not found",
                code: "not_found",
              },
        ),
        { status: ownerRead ? 200 : 404, headers: { "content-type": "application/json" } },
      ),
    ),
  );
});

describe("Publish preview purity", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  const authoredWorkspace = (
    options: {
      readonly withoutContent?: boolean;
      readonly httpClient?: HttpClient.HttpClient;
    } = {},
  ) => {
    const world = makePublishWorld({
      settings: { skills: { review: "workspace" } },
      ...(options.httpClient === undefined ? {} : { httpClient: options.httpClient }),
    });
    worlds.push(world);
    world.write("skill", {
      name: "review",
      ...(options.withoutContent === true ? { withoutContent: true } : {}),
    });
    const before = world.snapshotProtectedState(PUBLISH_PROTECTED_STATE);
    world.writes.splice(0);
    return { world, before };
  };

  /** Both purity observations: nothing changed, and nothing was even attempted. */
  const expectProtectedStateUntouched = (
    world: PublishWorld,
    before: ProtectedStateSnapshot,
  ): void => {
    expect(world.snapshotProtectedState(PUBLISH_PROTECTED_STATE)).toEqual(before);
    expect(world.protectedWrites(PUBLISH_PROTECTED_STATE)).toEqual([]);
  };

  it.effect("an unauthenticated preview directs the same selection to publication approval", () =>
    Effect.gen(function* () {
      const { world, before } = authoredWorkspace({ httpClient: readOnlyRegistry });

      const outcome = yield* world.provide(
        runPublish(
          requestFor(world, {
            registryUrl: Option.some("https://registry.example.test"),
            selectors: ["@acme/skills/review"],
            visibility: Option.some("private"),
          }),
        ),
      );

      expectProtectedStateUntouched(world, before);
      const document = publishDocument(outcome);
      expect(document).toMatchObject({
        mode: "preview",
        publicationSet: { status: "unavailable" },
        execution: {
          status: "not-run",
          preconditions: [
            {
              status: "unmet",
              blockedOn: "human",
              label: "Publication authorization",
              detail:
                "Apply the same publish selection to request approval for this exact publication set.",
            },
          ],
        },
        counts: { selected: 1, published: 0 },
      });
      expect(JSON.stringify(document)).not.toContain("axm login");
      expect(outcome.disposition._tag).toBe("Completed");
    }),
  );

  it.effect(
    "a preview reports the admitted publication set without uploading or changing state",
    () =>
      Effect.gen(function* () {
        const { world, before } = authoredWorkspace();

        const outcome = yield* world.provide(
          runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: true })),
        );

        expectProtectedStateUntouched(world, before);
        expect(world.target.storedFiles()).toEqual([]);
        expect(world.interactionState().confirmApplyChangesCalls).toEqual([]);
        expect(publishDocument(outcome)).toMatchObject({
          contract: "publish-result-v3",
          mode: "preview",
          publicationSet: { status: "admitted" },
          execution: { status: "not-run" },
          counts: { selected: 1, published: 0 },
        });
      }),
  );

  it.effect("a preview that fails the fixed publication gate reports it and changes nothing", () =>
    Effect.gen(function* () {
      const { world, before } = authoredWorkspace({ withoutContent: true });

      const outcome = yield* world.provide(
        runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: true })),
      );

      expect(outcome.disposition._tag).toBe("Failed");
      expectProtectedStateUntouched(world, before);
      expect(world.target.storedFiles()).toEqual([]);
      expect(world.interactionState().confirmApplyChangesCalls).toEqual([]);
      expect(publishDocument(outcome)).toMatchObject({
        mode: "preview",
        publicationSet: { status: "unavailable", items: [] },
        execution: {
          status: "not-run",
          outcomes: [{ id: "@acme/skills/review", status: "failed", reason: "candidate_invalid" }],
        },
        counts: { selected: 1, published: 0, failed: 1 },
      });
    }),
  );

  /**
   * One row per authored type a publish can distribute. Publishing means the
   * same thing for each of them, so the rule is stated once and demonstrated
   * across the whole table — the evidence the superseded per-type
   * `<type>/publish/preview-is-pure` records carried.
   */
  const authoredTypes = [
    { type: "skill", settingsKey: "skills", name: "review" },
    { type: "subagent", settingsKey: "subagents", name: "reviewer" },
    { type: "rule", settingsKey: "rules", name: "style" },
    { type: "hook", settingsKey: "hooks", name: "audit" },
    { type: "knowledge", settingsKey: "knowledge", name: "platform" },
    { type: "mcp-server", settingsKey: "mcpServers", name: "context" },
    { type: "pack", settingsKey: "packs", name: "starter" },
  ] as const;

  const typeWorld = (row: (typeof authoredTypes)[number], authored: boolean) => {
    const world = makePublishWorld({
      settings: authored ? { [row.settingsKey]: { [row.name]: "workspace" } } : {},
    });
    worlds.push(world);
    if (authored) world.write(row.type, { name: row.name });
    const before = world.snapshotProtectedState(PUBLISH_PROTECTED_STATE);
    world.writes.splice(0);
    return { world, before };
  };

  it.effect.each(authoredTypes)(
    "a previewed $type publish admits the authored $type and changes no protected state",
    (row) =>
      Effect.gen(function* () {
        const { world, before } = typeWorld(row, true);

        const outcome = yield* world.provide(
          runPublish(requestFor(world, { types: [row.type], preview: true })),
        );

        expectProtectedStateUntouched(world, before);
        expect(world.target.storedFiles()).toEqual([]);
        expect(world.interactionState().confirmApplyChangesCalls).toEqual([]);
        expect(publishDocument(outcome)).toMatchObject({
          contract: "publish-result-v3",
          mode: "preview",
          publicationSet: {
            status: "admitted",
            items: [{ type: row.type, name: row.name, participation: "publish" }],
          },
          execution: { status: "not-run", outcomes: [{ type: row.type, name: row.name }] },
          counts: { selected: 1, published: 0 },
        });
      }),
  );

  it.effect.each(authoredTypes)(
    "a previewed $type publish with nothing authored selects nothing and changes nothing",
    (row) =>
      Effect.gen(function* () {
        const { world, before } = typeWorld(row, false);

        const outcome = yield* world.provide(
          runPublish(requestFor(world, { types: [row.type], preview: true })),
        );

        expectProtectedStateUntouched(world, before);
        expect(world.target.storedFiles()).toEqual([]);
        expect(publishDocument(outcome)).toMatchObject({
          mode: "preview",
          counts: { selected: 0, published: 0 },
        });
      }),
  );
});
