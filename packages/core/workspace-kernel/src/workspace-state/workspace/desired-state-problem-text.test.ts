import { describe, expect, it } from "@effect/vitest";

import { desiredStateProblemText } from "./desired-state-problem-text.js";

describe("desiredStateProblemText", () => {
  it("preserves every constraint contributor in terminal text", () => {
    expect(
      desiredStateProblemText({
        type: "constraint-conflict",
        extensionType: "skill",
        name: "review",
        constraints: ["^1.0.0", "^2.0.0"],
        contributors: [
          {
            source: "pack",
            dependingPack: "@acme/packs/one",
            range: "^1.0.0",
            location: "agent_extensions/registry.agentxm.ai/@acme/packs/one/pack.json",
          },
          {
            source: "pack",
            dependingPack: "@acme/packs/two",
            range: "^2.0.0",
            location: "agent_extensions/registry.agentxm.ai/@acme/packs/two/pack.json",
          },
        ],
      }),
    ).toBe(
      "skill review: incompatible constraints @acme/packs/one range=^1.0.0 location=agent_extensions/registry.agentxm.ai/@acme/packs/one/pack.json, @acme/packs/two range=^2.0.0 location=agent_extensions/registry.agentxm.ai/@acme/packs/two/pack.json; decision=blocked; reason=no-satisfying-version",
    );
  });

  it("does not expose the absolute path of an unavailable Pack manifest", () => {
    const text = desiredStateProblemText({
      type: "pack-manifest-unavailable",
      pack: "@acme/packs/missing",
      path: "/secret/workspace/agent_extensions/registry.agentxm.ai/@acme/packs/missing/pack.json",
      reason: "absent",
    });
    expect(text).toBe("@acme/packs/missing: authored Pack manifest is absent");
    expect(text).not.toContain("/secret/workspace");
  });

  it("names the I/O failure that hid a Pack manifest without claiming absence", () => {
    expect(
      desiredStateProblemText({
        type: "pack-manifest-unavailable",
        pack: "@acme/packs/locked",
        path: "/secret/workspace/agent_extensions/registry.agentxm.ai/@acme/packs/locked/pack.json",
        reason: "unreadable",
        cause: "PermissionDenied",
      }),
    ).toBe("@acme/packs/locked: authored Pack manifest is unreadable (PermissionDenied)");
  });

  it("names each schema violation's path but never the value found there", () => {
    expect(
      desiredStateProblemText({
        type: "pack-manifest-invalid",
        pack: "@acme/packs/broken",
        path: "/secret/workspace/agent_extensions/registry.agentxm.ai/@acme/packs/broken/pack.json",
        reason: "schema-invalid",
        issues: [{ path: "dependencies.@acme/skills/review", message: "Expected string" }],
      }),
    ).toBe(
      "@acme/packs/broken: authored Pack manifest does not match the schema (dependencies.@acme/skills/review: Expected string)",
    );
  });
});
