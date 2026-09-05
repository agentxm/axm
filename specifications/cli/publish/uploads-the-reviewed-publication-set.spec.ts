import * as crypto from "node:crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  publicationDescriptorDigest,
  publicationSetDigest,
} from "@agentxm/registry-protocol/unstable/registry";
import { archiveContents } from "../../support/publication-evidence-harness.js";
import { writeAuthoredSkill } from "../../support/publish-harness.js";
import {
  makeRemotePublicationContext,
  publicationCapability,
  publicationCondition,
} from "../../support/remote-publication-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/uploads-the-reviewed-publication-set",
  title: "Publication uploads are bound to the reviewed source and visibility",
  statement:
    "For a remotely authorized publication, AXM shall bind each actual archive upload to its reviewed publication-set-v2 candidate using the granted capability, condition, publication-set digest, descriptor digest, and resolved visibility, and report the Registry's acknowledged outcome.",
  class: "external-conformance",
  role: "interface",
  goals: ["trustworthy-distribution"],
  methods: ["example", "contract"],
  derivedFrom: [
    "AgentXM Registry API 0.1.0",
    "packages/cli/src/root/publish/command.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Reviewed publication upload", () => {
  it.live(
    "uploads the exact reviewed bytes with every conditional binding and the resolved visibility",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makeRemotePublicationContext({
            workspace: { settings: { skills: { review: "workspace" } } },
          });
          writeAuthoredSkill(context.workspace.root, { name: "review" });
          yield* context.run();
          expect(context.callbackErrors).toEqual([]);
          expect(context.uploads).toHaveLength(1);
          const upload = context.uploads[0];
          const request = context.authorized().publicationSet;
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
          const result = yield* context.result();
          expect(result.execution.outcomes).toEqual([
            expect.objectContaining({
              id: "@acme/skills/review",
              status: "success",
              settlement: "response",
              visibility: { value: "private", disposition: "establish", source: "explicit" },
            }),
          ]);
          expect(result.counts.published).toBe(1);
          expect(
            context.requests.filter(
              (request) => request.method === "GET" && request.url.includes("/v1/extensions/"),
            ),
          ).toHaveLength(1);
        }),
      ),
  );
});
