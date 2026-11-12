import { createHash } from "node:crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import { expect, it } from "@effect/vitest";
import { fixtureArchive, startHttpRegistry } from "@agentxm/client-e2e-utils/registry";

class FixtureRequestFailed extends Data.TaggedError("FixtureRequestFailed")<{
  readonly cause: unknown;
}> {}

const observe = <A>(action: () => Promise<A>) =>
  Effect.tryPromise({ try: action, catch: (cause) => new FixtureRequestFailed({ cause }) });

const Preview = Schema.Struct({
  publicationSetDigest: Schema.String,
  candidates: Schema.Array(
    Schema.Struct({ condition: Schema.String, descriptorDigest: Schema.String }),
  ),
});

it.effect(
  "publication fixture binds uploaded bytes to admission and exposes independent payloads",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const registry = yield* Effect.acquireRelease(
          observe(() => startHttpRegistry()),
          (registry) => observe(registry.close).pipe(Effect.orDie),
        );
        const original = fixtureArchive({ "payload.txt": "original publication" });
        const changed = fixtureArchive({ "payload.txt": "different publication" });
        const preview = yield* HttpClientRequest.post(`${registry.url}/v1/publish-previews`).pipe(
          HttpClientRequest.setHeaders({ authorization: "Bearer disposable-fixture" }),
          HttpClientRequest.bodyJson({
            candidates: [
              {
                target: { owner: "@test", type: "skill", name: "fixture", version: "1.0.0" },
                participation: "publish",
                archiveSha256Hex: createHash("sha256").update(original).digest("hex"),
                visibility: { request: null, intent: null },
              },
            ],
          }),
          Effect.flatMap(HttpClient.execute),
        );
        expect(preview.status).toBe(200);
        const admission = yield* Schema.decodeUnknownEffect(Preview)(yield* preview.json);
        const candidate = admission.candidates[0];
        if (candidate === undefined) throw new Error("Missing fixture preview candidate");
        const upload = (bytes: Uint8Array) =>
          HttpClientRequest.put(`${registry.url}/v1/extensions/@test/skills/fixture/1.0.0`).pipe(
            HttpClientRequest.setHeaders({
              authorization: "Bearer disposable-fixture",
              "if-match": candidate.condition,
              "x-axm-publication-set-digest": admission.publicationSetDigest,
              "x-axm-publication-descriptor-digest": candidate.descriptorDigest,
            }),
            HttpClientRequest.bodyUint8Array(bytes, "application/zip"),
            HttpClient.execute,
          );
        const refused = yield* upload(changed);
        expect(refused.status).toBe(422);
        expect(yield* refused.json).toMatchObject({
          code: "publish_integrity_mismatch",
        });
        expect(registry.publishes).toHaveLength(0);

        const accepted = yield* upload(original);
        expect(accepted.status).toBe(201);
        yield* accepted.arrayBuffer;
        expect(registry.publishes).toHaveLength(1);
        expect(registry.publishes[0]?.integrity).toBe(
          `sha512-${createHash("sha512").update(original).digest("base64")}`,
        );
        const entries = registry.archiveEntries("@test", "skills", "fixture", "1.0.0");
        expect(new TextDecoder().decode(entries["payload.txt"])).toBe("original publication");
        entries["payload.txt"]?.fill(0);
        expect(
          new TextDecoder().decode(
            registry.archiveEntries("@test", "skills", "fixture", "1.0.0")["payload.txt"],
          ),
        ).toBe("original publication");
      }).pipe(Effect.provide(FetchHttpClient.layer)),
    ),
);
