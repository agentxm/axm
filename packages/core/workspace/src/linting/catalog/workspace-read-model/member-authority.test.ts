import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { buildLintWorkspace } from "./lint-workspace.js";

const rows = [
  {
    label: "matching configured owner",
    workspaceOwner: "@acme",
    manifestOwner: "@acme",
    manifestName: "review",
    version: "1.1.0",
    authoritative: true,
  },
  {
    label: "different manifest owner",
    workspaceOwner: "@acme",
    manifestOwner: "@other",
    manifestName: "review",
    version: "1.1.0",
    authoritative: false,
  },
  {
    label: "missing configured owner",
    workspaceOwner: undefined,
    manifestOwner: "@acme",
    manifestName: "review",
    version: "1.1.0",
    authoritative: false,
  },
  {
    label: "different manifest name",
    workspaceOwner: "@acme",
    manifestOwner: "@acme",
    manifestName: "other",
    version: "1.1.0",
    authoritative: false,
  },
  {
    label: "invalid manifest version",
    workspaceOwner: "@acme",
    manifestOwner: "@acme",
    manifestName: "review",
    version: "not-semver",
    authoritative: false,
  },
] as const;

describe("Workspace pack member authority", () => {
  it.effect.each(rows)("uses only declared package identity: $label", (row) =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-member-authority-" });
        const userHome = path.join(root, "home");
        const settingsPath = path.join(root, "axm.json");
        yield* fs.makeDirectory(path.join(root, "skills", "review", "src"), { recursive: true });
        yield* fs.makeDirectory(path.join(root, "packs", "reviewers"), { recursive: true });
        yield* fs.makeDirectory(userHome, { recursive: true });
        yield* fs.writeFileString(
          settingsPath,
          JSON.stringify({
            ...(row.workspaceOwner === undefined ? {} : { owner: row.workspaceOwner }),
            agents: [],
            skills: { review: "workspace" },
            packs: { reviewers: "workspace" },
          }),
        );
        yield* fs.writeFileString(
          path.join(root, "skills", "review", "skill.json"),
          JSON.stringify({
            owner: row.manifestOwner,
            type: "skill",
            name: row.manifestName,
            version: row.version,
          }),
        );
        yield* fs.writeFileString(
          path.join(root, "skills", "review", "src", "SKILL.md"),
          "---\nname: review\ndescription: Review changes\n---\n# Review\n",
        );
        const memberFqn = `${row.manifestOwner}/skills/review`;
        yield* fs.writeFileString(
          path.join(root, "packs", "reviewers", "pack.json"),
          JSON.stringify({
            owner: "@acme",
            type: "pack",
            name: "reviewers",
            version: "1.0.0",
            dependencies: { [memberFqn]: "^1.0.0" },
          }),
        );
        let settingsReads = 0;
        const observedFs = {
          ...fs,
          readFileString: (...args: Parameters<typeof fs.readFileString>) => {
            if (args[0] === settingsPath) settingsReads += 1;
            return fs.readFileString(...args);
          },
        };
        const workspace = yield* buildLintWorkspace({
          platform: { fs: observedFs, path },
          workspaceRoot: root,
          userHome,
          scope: "project",
        });
        const reachability = workspace.rule.packDependencyReachability;
        if (reachability === undefined) throw new Error("Missing pack dependency observation");
        const members = yield* reachability;
        const member = members.find((entry) => entry.memberFqn === memberFqn);
        if (row.workspaceOwner === undefined) {
          // Without workspace ownership, neither authored package can supply
          // an accepted identity from which to establish a dependency relation.
          expect(members).toEqual([]);
        } else {
          expect(member).toBeDefined();
          expect(member?.classification).toBe(row.authoritative ? "satisfying" : "missing");
          expect(member?.memberVersion).toBe(row.authoritative ? "1.1.0" : undefined);
          expect(member?.memberAuthority).toBe(row.authoritative ? "workspace" : undefined);
        }
        expect(settingsReads).toBe(1);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );
});
