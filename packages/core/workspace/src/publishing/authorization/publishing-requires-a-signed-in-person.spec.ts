import * as crypto from "node:crypto";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import {
  publicationDescriptorDigest,
  publicationSetDigest,
} from "@agentxm/registry-protocol/unstable/registry";

import {
  archiveContents,
  makeRemotePublishWorld,
  publicationCondition,
  publicationSessionToken,
  publishDocument,
  remoteRequest,
  runPublish,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/requires-a-signed-in-person",
  title: "Publishing is a write the publisher makes as themselves",
  statement:
    "AXM shall publish with the credential the invocation already holds — binding each archive upload to its previewed publication-set-v2 candidate through that credential, with the condition, publication-set digest, descriptor digest and resolved visibility, and reporting the Registry's acknowledged outcome — and, with no credential, shall report that the person is signed out, offer sign-in, dispatch no upload and create no server state.",
  class: "external-conformance",
  role: "interface",
  goals: ["trustworthy-distribution"],
  methods: ["example", "contract"],
  derivedFrom: ["AgentXM Registry API 0.1.0", "apps/cli/src/root/publish/command.test.ts"],
  supersedes: ["cli/publish/uploads-the-reviewed-publication-set"],
  assumptions: [],
  openQuestions: [
    "If local source changes after the authoritative preview, must AXM abort or may it upload the previewed archive? The current implementation aborts; the accepted requirement binds actual upload bytes to the previewed set without choosing an enforcement strategy.",
  ],
});

describe("Publishing requires a signed-in person", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "uploads the exact previewed bytes under the publisher's own session with every conditional binding",
    () =>
      Effect.gen(function* () {
        const remote = makeRemotePublishWorld({
          settings: { skills: { review: "workspace" } },
        });
        cleanups.push(remote.cleanup);
        remote.write("skill", { name: "review" });

        const outcome = yield* remote.provide(runPublish(remoteRequest()));

        expect(remote.uploads).toHaveLength(1);
        const upload = remote.uploads[0];
        const request = remote.previewed();
        const descriptor = request.candidates[0];
        if (upload === undefined || descriptor === undefined || upload.body._tag !== "Uint8Array")
          throw new Error("Expected the previewed archive upload");
        expect(request.contract).toBe("publication-set-v2");
        expect(descriptor.visibility).toEqual({ intent: null, request: "private" });
        expect(descriptor.archiveSha256Hex).toBe(
          crypto.createHash("sha256").update(upload.body.body).digest("hex"),
        );
        expect(upload.headers["authorization"]).toBe(`Bearer ${publicationSessionToken}`);
        expect(upload.headers["if-match"]).toBe(publicationCondition);
        expect(upload.headers["x-axm-publication-set-digest"]).toBe(
          publicationSetDigest(request.candidates),
        );
        expect(upload.headers["x-axm-publication-descriptor-digest"]).toBe(
          publicationDescriptorDigest(descriptor),
        );
        expect(upload.headers["content-digest"]).toBe(
          `sha-512=:${crypto.createHash("sha512").update(upload.body.body).digest("base64")}:`,
        );
        expect(
          Option.getOrThrow(HttpClientRequest.toUrl(upload)).searchParams.get("visibility"),
        ).toBe("private");
        expect(Object.keys(yield* archiveContents(upload.body.body)).sort()).toEqual([
          "skill.json",
          "src/SKILL.md",
        ]);
        const document = publishDocument(outcome);
        expect(document.execution.outcomes).toEqual([
          expect.objectContaining({
            id: "@acme/skills/review",
            status: "success",
            settlement: "response",
            visibility: { value: "private", disposition: "establish", source: "explicit" },
          }),
        ]);
        expect(document.counts.published).toBe(1);
      }),
  );

  it.effect("reports a signed-out publish, offers sign-in, and dispatches nothing", () =>
    Effect.gen(function* () {
      const remote = makeRemotePublishWorld({
        settings: { skills: { review: "workspace" } },
        signedOut: true,
      });
      cleanups.push(remote.cleanup);
      remote.write("skill", { name: "review" });

      const failure = yield* remote.provide(runPublish(remoteRequest())).pipe(Effect.flip);

      expect(failure._tag).toBe("AuthLoginRequired");
      // Nothing about the publication reached the Registry: no authoritative
      // preview was requested and no archive left the process.
      expect(remote.previewCount()).toBe(0);
      expect(remote.uploads).toEqual([]);
    }),
  );
});
