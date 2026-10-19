import { describe, expect, it } from "@effect/vitest";
import { isLoopbackHostname } from "./loopback.js";

describe("isLoopbackHostname", () => {
  it.each([
    { url: "http://localhost:4300", expected: true },
    { url: "https://127.0.0.1:4300", expected: true },
    { url: "http://[::1]:4300", expected: true },
    { url: "https://registry.agentxm.ai", expected: false },
    { url: "http://127.0.0.2:4300", expected: false },
  ])("classifies the hostname of $url", ({ url, expected }) => {
    expect(isLoopbackHostname(new URL(url).hostname)).toBe(expected);
  });
});
