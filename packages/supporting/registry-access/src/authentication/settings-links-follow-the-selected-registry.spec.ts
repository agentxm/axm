import { describe, expect, it } from "vitest";
import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { defineSpecification } from "@agentxm/specification-metadata";
import { trustedPublisherSettingsUrl, workloadTokenUnavailable } from "./errors.js";
import { webOriginForRegistry } from "./web-origin.js";

export const specification = defineSpecification({
  requirement: "cli/authentication/settings-links-follow-the-selected-registry",
  title: "Authentication settings links follow the selected Registry",
  statement:
    "AXM shall derive authentication and trusted-publisher settings links from the selected Registry's paired web origin, keeping development and custom Registry recoveries on their own web surfaces.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Settings links stay with the Registry", () => {
  it.each([
    ["https://registry.agentxm.ai", "https://agentxm.ai"],
    ["https://registry-dev.agentxm.ai", "https://web-dev.agentxm.ai"],
    ["http://127.0.0.1:4320", "http://127.0.0.1:4220"],
    ["https://registry.example.test", "https://registry.example.test"],
  ])("uses %s's web surface", (registryUrl, webOrigin) => {
    const endpoint = decodeHttpRegistryEndpointSync(registryUrl);
    expect(webOriginForRegistry(endpoint)).toBe(webOrigin);
    expect(trustedPublisherSettingsUrl(endpoint)).toBe(
      `${webOrigin}/u/settings/trusted-publishers`,
    );
    expect(workloadTokenUnavailable("exchange_refused", registryUrl).suggestions).toContainEqual({
      description:
        "Register this repository and workflow as a trusted publisher in AgentXM settings.",
      url: `${webOrigin}/u/settings/trusted-publishers`,
    });
  });
});
