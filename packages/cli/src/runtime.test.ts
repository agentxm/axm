import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { resolveBuiltInRegistryLocation, withAxmUserAgent } from "./runtime.js";

describe("resolveBuiltInRegistryLocation", () => {
  it("prefers AXM_REGISTRY_LOCATION when set to a remote URL", () => {
    const location = resolveBuiltInRegistryLocation(
      { AXM_REGISTRY_LOCATION: "https://registry.example.test" },
      "https://registry.agentxm.ai",
    );

    expect(location).toBe("https://registry.example.test/");
  });

  it("normalizes filesystem paths to file URLs", () => {
    const registryPath = path.join(process.cwd(), "tmp", "registry");
    const location = resolveBuiltInRegistryLocation(
      { AXM_REGISTRY_LOCATION: registryPath },
      "https://registry.agentxm.ai",
    );

    expect(location).toBe(pathToFileURL(registryPath).href);
  });

  it("falls back to AXM_REGISTRY_URL when AXM_REGISTRY_LOCATION is unset", () => {
    const location = resolveBuiltInRegistryLocation({}, "https://registry.example.test");

    expect(location).toBe("https://registry.example.test/");
  });

  it("treats an empty AXM_REGISTRY_LOCATION as unset", () => {
    const location = resolveBuiltInRegistryLocation(
      { AXM_REGISTRY_LOCATION: "" },
      "https://registry.example.test",
    );

    expect(location).toBe("https://registry.example.test/");
  });
});

describe("withAxmUserAgent", () => {
  it("adds the CLI name and version to every request", async () => {
    let observedUserAgent: string | undefined;
    const client = withAxmUserAgent(
      HttpClient.make((request) =>
        Effect.sync(() => {
          observedUserAgent = request.headers["user-agent"];
          return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }));
        }),
      ),
      "1.2.3",
    );

    await Effect.runPromise(client.execute(HttpClientRequest.get("https://registry.example.test")));

    expect(observedUserAgent).toBe("axm-cli/1.2.3");
  });
});
