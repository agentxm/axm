/**
 * The argv a refused targeted update tells a person to type.
 *
 * The refusal and its blocker are the lifecycle feature's — stated by
 * `cli/update/bundled-source-routes-to-recovery` and the ownership rules
 * beside it. What a person types to recover is this adapter's, because only
 * the adapter knows how its own routes are spelled, so the exact commands are
 * asserted here beside the table that renders them.
 */

import { describe, expect, it } from "@effect/vitest";

import {
  AXM_SKILL_BUNDLED_APPLY_COMMAND,
  type TargetedUpdateBlocker,
  type TargetedUpdatePublicContext,
} from "@agentxm/extension-resolution";

import { blockerSuggestions } from "./handler.js";

const contextFor = (
  blocker: TargetedUpdateBlocker,
  overrides: Partial<TargetedUpdatePublicContext> = {},
): TargetedUpdatePublicContext => ({
  target: { type: "skill", name: "axm", fqn: "@agentxm/skills/axm" },
  ownership: "direct-only",
  activation: "enabled",
  authority: "blocked",
  packs: [],
  memberClosure: [],
  effects: {
    settings: "unchanged",
    acceptedResolution: "unchanged",
    canonical: "unchanged",
    projection: "unchanged",
    packRoot: "unchanged",
    packManifest: "unchanged",
  },
  relevantProblems: [],
  blocker,
  ...overrides,
});

describe("targeted update blocker suggestions", () => {
  it("offers the bundled reinstall for a source embedded in the executable", () => {
    expect(blockerSuggestions(contextFor("bundled-source"))).toEqual([
      {
        description: "Reinstall the compatible skill embedded in this AXM executable",
        cmd: AXM_SKILL_BUNDLED_APPLY_COMMAND,
      },
    ]);
    expect(AXM_SKILL_BUNDLED_APPLY_COMMAND).toBe(
      "axm skills install @agentxm/skills/axm --bundled",
    );
  });

  it.each([
    { blocker: "not-desired", cmd: "axm install @agentxm/skills/axm" },
    { blocker: "disabled", cmd: "axm skills enable axm" },
    { blocker: "pack-owned-constraint", cmd: "axm update @agentxm/skills/axm" },
    { blocker: "incomplete-graph", cmd: "axm sync --preview" },
    { blocker: "source-authority", cmd: "axm sync @agentxm/skills/axm --preview" },
    { blocker: "stale-plan", cmd: "axm update @agentxm/skills/axm" },
  ] as const)("offers `$cmd` for the $blocker blocker", ({ blocker, cmd }) => {
    expect(blockerSuggestions(contextFor(blocker)).map((action) => action.cmd)).toEqual([cmd]);
  });

  it("offers nothing when the refusal carries no classified blocker", () => {
    expect(blockerSuggestions(undefined)).toEqual([]);
  });
});
