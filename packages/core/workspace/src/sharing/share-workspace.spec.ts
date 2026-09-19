// Raw node filesystem and Git subprocesses construct the real read-only repository fixtures.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { defineSpecification } from "@agentxm/specification-metadata";
import { WorkspaceStateLive } from "../desired-state/live.js";
import { discoverExtensionPackages } from "../resolution/sources/index.js";
import { ShareFailed, ShareWorkspace } from "./share-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/share-prints-live-install-command",
  title: "Share prints the live origin install command without writing",
  statement:
    "Share shall refuse a checkout without an origin remote and otherwise shall report origin availability and print one install command whose typed selectors exactly name the distributable authored extensions found from that repository, without writing workspace state.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "The examples read real workspace files, inspect a real Git remote, and use the production repository finder while comparing the checkout before and after the query.",
  methods: ["example", "snapshot"],
  derivedFrom: ["extension-discovery/all-manifest-kinds-from-git-and-path"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const git = (root: string, args: ReadonlyArray<string>): void => {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
};

const writeSkill = (root: string, directory: string, name: string): void => {
  fs.mkdirSync(path.join(root, directory), { recursive: true });
  fs.writeFileSync(
    path.join(root, directory, "skill.json"),
    `${JSON.stringify({ owner: "@acme", type: "skill", name, version: "1.0.0" })}\n`,
  );
};

const snapshot = (root: string): ReadonlyArray<readonly [string, string]> => {
  const visit = (directory: string): ReadonlyArray<readonly [string, string]> =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === ".git") return [];
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory()
        ? visit(absolute)
        : [[path.relative(root, absolute), fs.readFileSync(absolute, "utf8")]];
    });
  return [...visit(root)].sort(([left], [right]) => left.localeCompare(right));
};

const makeWorkspace = (withOrigin: boolean) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-share-")));
  fs.writeFileSync(
    path.join(root, "axm.json"),
    `${JSON.stringify({
      owner: "@acme",
      agents: [],
      skills: {
        shared: "workspace",
        private: { source: "workspace", distribute: false },
      },
    })}\n`,
  );
  fs.writeFileSync(
    path.join(root, "axm-lock.yaml"),
    JSON.stringify({ lockfileVersion: 8, skills: {} }),
  );
  writeSkill(root, "extensions/shared", "shared");
  writeSkill(root, "extensions/private", "private");
  writeSkill(root, "extensions/undeclared", "undeclared");
  git(root, ["init", "--quiet", "--initial-branch=main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "fixture"]);
  if (withOrigin) git(root, ["remote", "add", "origin", pathToFileURL(root).href]);
  return root;
};

describe("Share workspace", () => {
  const roots: Array<string> = [];
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("prints exactly the finder set with live availability and writes nothing", () =>
    Effect.gen(function* () {
      const root = makeWorkspace(true);
      roots.push(root);
      const before = snapshot(root);
      const layer = Layer.provideMerge(
        WorkspaceStateLive({ scope: "project", projectRoot: decodeAbsolutePathSync(root) }),
        NodeServices.layer,
      );
      const result = yield* ShareWorkspace.query().pipe(Effect.provide(layer));
      const discovered = yield* discoverExtensionPackages(root, {
        names: [],
        owner: Option.none(),
        type: "*",
      }).pipe(Effect.provide(NodeServices.layer));

      expect(result.extensions).toEqual(
        discovered.map((candidate) => ({
          type: candidate.kind === "manifest" ? candidate.identity.type : "skill",
          name: candidate.kind === "manifest" ? candidate.identity.name : candidate.name,
        })),
      );
      expect(result).toMatchObject({
        command: "share",
        availability: "available",
        extensions: [
          { type: "skill", name: "shared" },
          { type: "skill", name: "undeclared" },
        ],
      });
      expect(result.installCommand.replaceAll(root, "<workspace>")).toMatchInlineSnapshot(
        `"axm install --skill shared --skill undeclared file://<workspace>"`,
      );
      expect(result.installCommand).not.toContain("private");
      expect(snapshot(root)).toEqual(before);
    }),
  );

  it.effect("refuses a repository without origin and writes nothing", () =>
    Effect.gen(function* () {
      const root = makeWorkspace(false);
      roots.push(root);
      const before = snapshot(root);
      const layer = Layer.provideMerge(
        WorkspaceStateLive({ scope: "project", projectRoot: decodeAbsolutePathSync(root) }),
        NodeServices.layer,
      );
      const result = yield* ShareWorkspace.query().pipe(Effect.provide(layer), Effect.result);

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(ShareFailed);
        expect(result.failure).toMatchObject({
          detail: "Cannot share this workspace because its Git repository has no origin remote.",
        });
      }
      expect(snapshot(root)).toEqual(before);
    }),
  );
});
