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
            location: "agent_extensions/agentxm/@acme/packs/one/pack.json",
          },
          {
            source: "pack",
            dependingPack: "@acme/packs/two",
            range: "^2.0.0",
            location: "agent_extensions/agentxm/@acme/packs/two/pack.json",
          },
        ],
      }),
    ).toBe(
      "skill review: incompatible constraints @acme/packs/one range=^1.0.0 location=agent_extensions/agentxm/@acme/packs/one/pack.json, @acme/packs/two range=^2.0.0 location=agent_extensions/agentxm/@acme/packs/two/pack.json; decision=blocked; reason=no-satisfying-version",
    );
  });

  it("does not expose the absolute path of an unavailable Pack manifest", () => {
    const text = desiredStateProblemText({
      type: "pack-manifest-unavailable",
      pack: "@acme/packs/missing",
      path: "/secret/workspace/agent_extensions/agentxm/@acme/packs/missing/pack.json",
    });
    expect(text).toBe("@acme/packs/missing: installed pack manifest is unavailable");
    expect(text).not.toContain("/secret/workspace");
  });
});
