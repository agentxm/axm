/**
 * Desired-route fixture for reachability specifications.
 *
 * Builds a workspace whose skill is desired through two routes at once — a
 * direct configuration entry and an installed Registry Pack that declares the
 * skill as a dependency — mirroring the accepted lock rows, canonical content,
 * and agent projection a completed install leaves behind.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { computePackManifestContentIdentity } from "@agentxm/extension-management/unstable/workspace";

import { makeSpecWorkspace } from "./install-harness.js";

export interface PackRetainedSkillWorkspace {
  readonly workspace: ReturnType<typeof makeSpecWorkspace>;
  /** Fully qualified name of the skill desired directly and through the pack. */
  readonly skillFqn: string;
  /** Workspace-relative canonical content directory of the skill. */
  readonly canonicalSkillPath: string;
  /** Workspace-relative agent projection path of the skill. */
  readonly projectionPath: string;
}

export const makePackRetainedSkillWorkspace = (): PackRetainedSkillWorkspace => {
  const skillFqn = "@acme/skills/review-helper";
  const manifest = {
    owner: "@acme",
    type: "pack",
    name: "review-pack",
    version: "1.0.0",
    dependencies: { [skillFqn]: "1.0.0" },
  } as const;
  const workspace = makeSpecWorkspace({
    machine: true,
    flags: { json: true },
    settings: {
      skills: { "review-helper": skillFqn },
      packs: { "review-pack": "@acme/packs/review-pack" },
      lockfileSkills: {
        "review-helper": {
          type: "registry",
          owner: "@acme",
          name: "review-helper",
          resolvedVersion: "1.0.0",
          integrity: "sha256-abc",
          sourceName: "agentxm",
          publisherBindingId: "hbnd_test",
        },
      },
      lockfilePacks: {
        "review-pack": {
          type: "registry",
          owner: "@acme",
          name: "review-pack",
          resolvedVersion: "1.0.0",
          integrity: "sha256-abc",
          sourceName: "agentxm",
          publisherBindingId: "hbnd_test",
          manifestContentIdentity: computePackManifestContentIdentity(manifest),
        },
      },
    },
  });

  const packDir = path.join(
    workspace.root,
    "agent_extensions",
    "agentxm",
    "@acme",
    "packs",
    "review-pack",
  );
  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify(manifest));

  const canonicalSkillPath = path.join(
    "agent_extensions",
    "agentxm",
    "@acme",
    "skills",
    "review-helper",
  );
  const skillDir = path.join(workspace.root, canonicalSkillPath);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# review-helper\n");

  const agentSkillsDir = path.join(workspace.root, ".claude", "skills");
  fs.mkdirSync(agentSkillsDir, { recursive: true });
  fs.symlinkSync(skillDir, path.join(agentSkillsDir, "review-helper"));

  return {
    workspace,
    skillFqn,
    canonicalSkillPath,
    projectionPath: path.join(".claude", "skills", "review-helper"),
  };
};
