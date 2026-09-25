import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";

import { resolveSource } from "./resolve-source.js";
import { WorkspaceCatalogTest } from "./testing.js";

const catalog = WorkspaceCatalogTest({
  sources: [
    {
      type: "registry",
      name: "agentxm",
      location: new URL("https://registry.example.com"),
    },
    {
      type: "registry",
      name: "company",
      location: new URL("https://registry.company.test"),
    },
  ],
  defaultRegistry: "company",
  desiredExtensionGraph: {
    complete: true,
    problems: [],
    nodes: [
      {
        type: "mcp-server",
        name: "server",
        identity: {
          authority: "registry",
          fqn: "@acme/mcps/server",
          registry: { sourceName: undefined, endpoint: undefined },
        },
        source: "github:acme/extensions//mcps/server",
      },
    ],
  },
});

const http = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, new Response("offline", { status: 503 }))),
  ),
);
const TestLayer = Layer.mergeAll(
  catalog,
  Layer.provideMerge(RegistryTransportTest(http), NodeServices.layer),
);
const resolve = (input: string, expectedType?: "skill" | "mcp-server") =>
  resolveSource(input, expectedType === undefined ? undefined : { expectedType }).pipe(
    Effect.provide(TestLayer),
  );

describe("resolveSource", () => {
  it.effect("resolves an unqualified Registry reference through the configured default", () =>
    Effect.gen(function* () {
      const source = yield* resolve("@acme/skills/review");
      expect(source).toMatchObject({
        type: "registry",
        name: "company",
        location: new URL("https://registry.company.test"),
      });
    }),
  );

  it.effect("resolves a configured entry name through the same Git expansion", () =>
    Effect.gen(function* () {
      const source = yield* resolve("server", "mcp-server");
      expect(source.type).toBe("git");
      if (source.type === "git") {
        expect(source.url.href).toBe("https://github.com/acme/extensions.git");
        expect(Option.getOrNull(source.subPath)).toBe("mcps/server");
      }
    }),
  );

  it.effect("reports the expected extension family for an unknown configured name", () =>
    Effect.gen(function* () {
      const failure = yield* resolve("missing", "mcp-server").pipe(Effect.flip);
      expect(failure._tag).toBe("SourceNotResolvable");
      expect(failure).toMatchObject({ detail: expect.stringContaining("MCP server") });
    }),
  );

  it.effect("rejects empty input with a typed syntax failure", () =>
    Effect.gen(function* () {
      const failure = yield* resolve("   ").pipe(Effect.flip);
      expect(failure._tag).toBe("SourceSyntaxInvalid");
    }),
  );
});
