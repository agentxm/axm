import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveBuiltInRegistryLocation } from "./runtime.js";

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
