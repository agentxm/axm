/**
 * The argv a refused targeted update tells a person to type.
 *
 * The refusal and its blocker are the lifecycle feature's — stated by
 * `cli/update/bundled-source-routes-to-recovery` and the ownership rules
 * beside it. What a person types to recover is this adapter's, because only
 * the adapter knows how its own routes are spelled, so the exact commands are
 * asserted here beside the table that renders them.
 */

import { renderSuggestedAction } from "@agentxm/workspace-kernel/operations";

import { describe, expect, it } from "@effect/vitest";

import { suggestionsForScope } from "../shared/scoped-command.js";
import {
  type TargetedUpdateBlocker,
  type TargetedUpdatePublicContext,
} from "@agentxm/workspace-kernel/resolution";

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
    expect(
      suggestionsForScope(
        blockerSuggestions(contextFor("bundled-source")),
        "user",
        new Set(["skills install"]),
      ),
    ).toEqual([
      {
        description: "Reinstall the compatible skill embedded in this AXM executable",
        cmd: "axm skills install --bundled --scope user @agentxm/skills/axm",
      },
    ]);
  });

  it.each([
    { blocker: "not-desired", cmd: "axm install @agentxm/skills/axm" },
    { blocker: "disabled", cmd: "axm skills enable axm" },
    { blocker: "pack-owned-constraint", cmd: "axm update @agentxm/skills/axm" },
    { blocker: "incomplete-graph", cmd: "axm sync --preview" },
    { blocker: "source-authority", cmd: "axm sync --preview @agentxm/skills/axm" },
    { blocker: "stale-plan", cmd: "axm update @agentxm/skills/axm" },
  ] as const)("offers `$cmd` for the $blocker blocker", ({ blocker, cmd }) => {
    expect(
      blockerSuggestions(contextFor(blocker)).map((action) => renderSuggestedAction(action).cmd),
    ).toEqual([cmd]);
  });

  it("offers nothing when the refusal carries no classified blocker", () => {
    expect(blockerSuggestions(undefined)).toEqual([]);
  });
});
