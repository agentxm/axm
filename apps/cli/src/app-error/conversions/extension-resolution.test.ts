/**
 * Byte-for-byte conversion table for the extension-resolution typed failure family.
 * Each row travels the real `toAppError` path and pins the envelope its
 * construction site rendered before decoupling; a wording change in the
 * producing module fails here rather than silently reaching the terminal.
 */

import { describe, expect, it } from "vitest";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { AppError, type AppErrorCode } from "../app-error.js";
import { isKnownFailure, toAppError, type KnownFailure } from "../conversions.js";
import {
  type AxmSkillCompatibility,
  AxmSkillIncompatible,
} from "@agentxm/cli-maintenance/official-skill/domain";
import { AxmSkillCompatibilityUnavailable } from "@agentxm/cli-maintenance/official-skill/application";
import {
  PackConstraintShadowed,
  PackDependencyConflict,
  PackDependencyInvalid,
  PackDependencyMissing,
  PackDependencyUnsatisfied,
  SourceAuthorityBlocked,
} from "@agentxm/extension-resolution";

const incompatibleAxmSkill: AxmSkillCompatibility = {
  status: "incompatible",
  cliVersion: "1.0.0",
  skillVersion: "0.9.0",
  source: null,
  declaredCliVersion: null,
  declaredCliVersionRange: "^2.0.0",
  reasonCode: "cli-version-incompatible",
  detail: "Official AXM skill 0.9.0 requires AXM CLI ^2.0.0.",
  recovery: {
    action: "upgrade-cli",
    targetCliVersion: "2.0.0",
    targetSkillVersion: "0.9.0",
  },
};

interface ConversionCase {
  readonly name: string;
  readonly failure: KnownFailure;
  readonly code: AppErrorCode;
  readonly detail: string;
  readonly title?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  /** Expected `cause`; "self" pins the typed failure itself as the cause. */
  readonly cause?: unknown | "self";
}

const cases: ReadonlyArray<ConversionCase> = [
  {
    name: "SourceAuthorityBlocked",
    failure: new SourceAuthorityBlocked({
      detail: "skill demo is workspace-authored",
      recovery: [{ description: "Fork the package first" }],
    }),
    code: "conflict",
    detail: "skill demo is workspace-authored",
    suggestions: [{ description: "Fork the package first" }],
  },
  {
    name: "AxmSkillCompatibilityUnavailable",
    failure: new AxmSkillCompatibilityUnavailable(),
    code: "internal",
    detail: "AXM compatibility policy did not evaluate the official AXM skill",
  },
  {
    name: "AxmSkillIncompatible",
    failure: new AxmSkillIncompatible({ compatibility: incompatibleAxmSkill }),
    code: "conflict",
    detail: "Official AXM skill 0.9.0 requires AXM CLI ^2.0.0.",
    suggestions: [
      {
        description:
          "Converge to AXM CLI 2.0.0 + official AXM skill 0.9.0 with the upgrade-cli recovery plan",
        cmd: "axm upgrade",
      },
    ],
  },
  {
    name: "PackDependencyInvalid",
    failure: new PackDependencyInvalid({
      detail: "Unable to resolve pack dependency @owner/skills/demo@^1.0.0",
    }),
    code: "usage",
    detail: "Unable to resolve pack dependency @owner/skills/demo@^1.0.0",
  },
  {
    name: "PackDependencyConflict",
    failure: new PackDependencyConflict({
      detail: "Configured workspace authority does not match pack dependency @owner/skills/demo",
    }),
    code: "conflict",
    detail: "Configured workspace authority does not match pack dependency @owner/skills/demo",
  },
  {
    name: "PackConstraintShadowed workspace",
    failure: new PackConstraintShadowed({
      packSource: "workspace",
      packFqn: "@owner/packs/demo",
      memberFqn: "@owner/skills/member",
      constraint: "^1.0.0",
      workspaceVersion: "2.0.0",
    }),
    code: "conflict",
    detail:
      "Workspace-authored pack @owner/packs/demo requires @owner/skills/member@^1.0.0, but workspace authority provides @owner/skills/member@2.0.0.",
    suggestions: [
      {
        description: "Replace the authored pack constraint with the current workspace version",
        cmd: "axm packs add @owner/packs/demo @owner/skills/member",
      },
    ],
  },
  {
    name: "PackConstraintShadowed registry",
    failure: new PackConstraintShadowed({
      packSource: "registry",
      packFqn: "@owner/packs/demo",
      memberFqn: "@owner/skills/member",
      constraint: "^1.0.0",
      workspaceVersion: "2.0.0",
    }),
    code: "conflict",
    detail:
      "Registry pack @owner/packs/demo requires @owner/skills/member@^1.0.0, but workspace authority shadows that member with @owner/skills/member@2.0.0.",
    suggestions: [
      {
        description:
          "Update the pack if its owner has published a constraint that includes the workspace version",
        cmd: "axm update @owner/packs/demo",
      },
      {
        description: "Otherwise stop workspace authority from shadowing @owner/skills/member",
      },
    ],
  },
  {
    name: "PackDependencyMissing",
    failure: new PackDependencyMissing({ dependencyTarget: "@owner/skills/demo" }),
    code: "not_found",
    detail: "Pack dependency @owner/skills/demo was not found",
  },
  {
    name: "PackDependencyUnsatisfied",
    failure: new PackDependencyUnsatisfied({
      dependencyTarget: "@owner/skills/demo",
      constraint: "^1.0.0",
    }),
    code: "conflict",
    title: "No compatible version",
    detail: "Pack dependency @owner/skills/demo has no visible version satisfying ^1.0.0",
  },
];

describe("extension-resolution conversions", () => {
  it.each(cases.map((entry) => [entry.name, entry] as const))(
    "converts %s byte-identically",
    (_name, entry) => {
      const converted = toAppError(entry.failure);
      expect(converted).toBeInstanceOf(AppError);
      expect(converted.code).toBe(entry.code);
      expect(converted.detail).toBe(entry.detail);
      if (entry.title !== undefined) {
        expect(converted.title).toBe(entry.title);
      }
      if (entry.suggestions === undefined) {
        expect(converted.suggestions).toBeUndefined();
      } else {
        expect(converted.suggestions).toEqual(entry.suggestions);
      }
      if (entry.cause === "self") {
        expect(converted.cause).toBe(entry.failure);
      } else {
        expect(converted.cause).toEqual(entry.cause);
      }
    },
  );

  it("registers every table row as a known failure", () => {
    for (const entry of cases) {
      expect(isKnownFailure(entry.failure)).toBe(true);
    }
  });
});
