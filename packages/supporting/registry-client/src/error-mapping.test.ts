import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import { RegistryRequestFailed } from "./errors.js";
import { isTransientTransportError } from "./error-mapping.js";
import { describe, expect, it } from "@effect/vitest";
import { buildNetworkSuggestions } from "./error-mapping.js";

describe("network diagnostics", () => {
  it.each(["https://localhost:4300", "https://127.0.0.1:4300", "https://[::1]:4300"])(
    "treats %s as a local Registry served over HTTPS",
    (baseUrl) => {
      expect(buildNetworkSuggestions(baseUrl)).toEqual([
        {
          description:
            "Ensure local registry is running with TLS, or switch the source URL to http://localhost:<port>.",
        },
      ]);
    },
  );

  it("suggests checking reachability for a local Registry over HTTP", () => {
    expect(buildNetworkSuggestions("http://[::1]:4300")).toEqual([
      {
        description: "Ensure local registry is running and reachable at the configured host/port.",
      },
    ]);
  });

  it("gives generic guidance for a remote Registry", () => {
    expect(buildNetworkSuggestions("https://registry.agentxm.ai")).toEqual([
      { description: "Check registry URL/network connectivity and retry." },
    ]);
  });
});

it("does not retry an explicit offline refusal as a network outage", () => {
  const error = (reason: "network-required" | "transport") =>
    new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({
        request: HttpClientRequest.get("https://example.test"),
        cause: new RegistryRequestFailed({ category: "network", reason, detail: "Unavailable" }),
      }),
    });
  expect(isTransientTransportError(error("network-required"))).toBe(false);
  expect(isTransientTransportError(error("transport"))).toBe(true);
});
