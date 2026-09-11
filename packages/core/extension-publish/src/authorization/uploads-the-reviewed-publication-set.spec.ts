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
  publicationCapability,
  publicationCondition,
  publishDocument,
  remoteRequest,
  runPublish,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/uploads-the-reviewed-publication-set",
  title: "Publication uploads are bound to the reviewed source and visibility",
  statement:
    "For a remotely authorized publication, AXM shall bind each actual archive upload to its reviewed publication-set-v2 candidate using the granted capability, condition, publication-set digest, descriptor digest, and resolved visibility, and report the Registry's acknowledged outcome.",
  class: "external-conformance",
  role: "interface",
  goals: ["trustworthy-distribution"],
  methods: ["example", "contract"],
  derivedFrom: ["AgentXM Registry API 0.1.0", "apps/cli/src/root/publish/command.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "If local source changes after publication review, must AXM abort and revoke unused grants, or may it upload the frozen reviewed archive? The current implementation aborts; the accepted requirement binds actual upload bytes to the reviewed set without choosing an enforcement strategy.",
  ],
});

describe("Reviewed publication upload", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "uploads the exact reviewed bytes with every conditional binding and the resolved visibility",
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
        const request = remote.authorized().publicationSet;
        const descriptor = request.candidates[0];
        if (upload === undefined || descriptor === undefined || upload.body._tag !== "Uint8Array")
          throw new Error("Expected the reviewed archive upload");
        expect(request.contract).toBe("publication-set-v2");
        expect(descriptor.visibility).toEqual({ intent: null, request: "private" });
        expect(descriptor.archiveSha256Hex).toBe(
          crypto.createHash("sha256").update(upload.body.body).digest("hex"),
        );
        expect(upload.headers["authorization"]).toBe(`Bearer ${publicationCapability}`);
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
        expect(
          remote.requests.filter(
            (observed) => observed.method === "GET" && observed.url.includes("/v1/extensions/"),
          ),
        ).toHaveLength(1);
      }),
  );
});
