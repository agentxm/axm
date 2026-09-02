import { describe, expect, it } from "@effect/vitest";

import { mcpSecretAccount } from "axm.sh/specification-harness";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/secret-namespaces-include-local-and-source-identity",
  title: "MCP secret accounts isolate workspace, local connection, source, and input identity",
  class: "security",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["property"],
});

describe("MCP secret account identity", () => {
  const base = {
    scopeRoot: "/workspace/project",
    localName: "work-context",
    sourceIdentity: "registry:https%3A%2F%2Fregistry.example:@acme/mcps/context",
    inputName: "API_TOKEN",
  } as const;

  it("is deterministic and changes when any namespace component changes", () => {
    const account = mcpSecretAccount(base);
    expect(account).toMatch(/^[0-9a-f]{64}$/u);
    expect(mcpSecretAccount(base)).toBe(account);

    for (const variant of [
      { ...base, scopeRoot: "/workspace/other" },
      { ...base, localName: "personal-context" },
      { ...base, sourceIdentity: `${base.sourceIdentity}-other` },
      { ...base, inputName: "OTHER_TOKEN" },
    ]) {
      expect(mcpSecretAccount(variant)).not.toBe(account);
    }
  });
});
