import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { ArtifactHttpClient, downloadHttpArtifact, httpArtifactDigest } from "./index.js";

export const specification = defineSpecification({
  requirement: "extensions/acquisition/http-artifacts-verify-content",
  title: "HTTP artifacts are bounded and verified against accepted bytes",
  statement:
    "AXM shall download public source artifacts over credential-free HTTPS, validate each bounded redirect without protocol downgrade, enforce a finite response-body limit even without Content-Length, and reject a digest mismatch before returning content for acquisition.",
  class: "functional",
  role: "supporting",
  goals: ["trustworthy-distribution", "safe-repetition"],
  methods: ["example", "boundary-value"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const original = new TextEncoder().encode("# Original bytes\r\n");

describe("HTTP artifact download", () => {
  it.effect("preserves bytes and verifies the final response across an HTTPS redirect", () =>
    Effect.gen(function* () {
      const seen: string[] = [];
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          seen.push(request.url);
          return HttpClientResponse.fromWeb(
            request,
            seen.length === 1
              ? new Response(null, {
                  status: 302,
                  headers: { location: "https://cdn.example.com/SKILL.md" },
                })
              : new Response(original, { headers: { "content-type": "text/markdown" } }),
          );
        }),
      );
      const result = yield* downloadHttpArtifact(new URL("https://example.com/skill"), {
        digest: httpArtifactDigest(original),
      }).pipe(Effect.provideService(ArtifactHttpClient, client));
      expect(Array.from(result.bytes)).toEqual(Array.from(original));
      expect(result.url.href).toBe("https://cdn.example.com/SKILL.md");
      expect(result.digest).toBe(httpArtifactDigest(original));
      expect(seen).toEqual(["https://example.com/skill", "https://cdn.example.com/SKILL.md"]);
    }),
  );

  it.effect("rejects changed bytes and oversized bodies without a declared length", () =>
    Effect.gen(function* () {
      const client = HttpClient.make((request) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, new Response(original))),
      );
      const mismatch = yield* downloadHttpArtifact(new URL("https://example.com/SKILL.md"), {
        digest: httpArtifactDigest(new Uint8Array()),
      }).pipe(Effect.provideService(ArtifactHttpClient, client), Effect.flip);
      expect(mismatch).toMatchObject({ _tag: "SourceNotResolvable", category: "validation" });
      const oversized = yield* downloadHttpArtifact(new URL("https://example.com/SKILL.md"), {
        maxBytes: 2,
      }).pipe(Effect.provideService(ArtifactHttpClient, client), Effect.flip);
      expect(oversized._tag).toBe("SourceNetworkFailure");
    }),
  );

  for (const target of [
    "http://example.com/SKILL.md",
    "https://user:password@example.com/SKILL.md",
  ]) {
    it.effect(`refuses an unsafe source URL before transport: ${new URL(target).protocol}`, () =>
      Effect.gen(function* () {
        const client = HttpClient.make(() => Effect.die("Unsafe URL reached transport"));
        const failure = yield* downloadHttpArtifact(new URL(target)).pipe(
          Effect.provideService(ArtifactHttpClient, client),
          Effect.flip,
        );
        expect(failure).toMatchObject({ _tag: "SourceNotResolvable", category: "validation" });
      }),
    );
  }

  it.effect("refuses redirect downgrades and redirect loops", () =>
    Effect.gen(function* () {
      for (const location of ["http://example.com/unsafe", "https://example.com/loop"]) {
        let calls = 0;
        const client = HttpClient.make((request) =>
          Effect.sync(() => {
            calls++;
            return HttpClientResponse.fromWeb(
              request,
              new Response(null, { status: 302, headers: { location } }),
            );
          }),
        );
        const failure = yield* downloadHttpArtifact(new URL("https://example.com/start")).pipe(
          Effect.provideService(ArtifactHttpClient, client),
          Effect.flip,
        );
        expect(["SourceNotResolvable", "SourceNetworkFailure"]).toContain(failure._tag);
        expect(calls).toBe(location.startsWith("http:") ? 1 : 11);
      }
    }),
  );
});
