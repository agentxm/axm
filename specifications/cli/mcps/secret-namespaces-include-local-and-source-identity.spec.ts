import { describe, expect, it } from "@effect/vitest";

import { mcpSecretAccount } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "cli/mcps/secret-namespaces-include-local-and-source-identity",
  title: "MCP secret accounts isolate workspace, local connection, source, and input identity",
  statement:
    "The account under which AXM stores an MCP secret shall be derived deterministically from the workspace root, the local connection name, the source identity, and the input name, so that changing any one of those yields a different account.",
  class: "quality",
  characteristic: "security",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  status: "accepted",
  methods: ["property"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "The derivation encodes the four namespace components unambiguously, so distinct component combinations cannot collide except through the underlying hash.",
  ],
  openQuestions: [],
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
