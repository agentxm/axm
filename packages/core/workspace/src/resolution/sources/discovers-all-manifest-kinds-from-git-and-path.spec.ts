// Raw node filesystem and Git subprocesses construct the two real source-family fixtures.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { defineSpecification } from "@agentxm/specification-metadata";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";

import { findExtensionPackagesFromSource } from "./package-sources.js";
import {
  SourceHostProviders,
  getOriginFromSource,
  type SourceHostProvidersService,
} from "./service.js";

export const specification = defineSpecification({
  requirement: "extension-discovery/all-manifest-kinds-from-git-and-path",
  title: "Git and path discovery recognize every extension manifest",
  statement:
    "Git and path source discovery shall find every extension type defined by the manifest policy, shall keep portable SKILL.md as the only manifest-free convention, and shall refuse duplicate declared identities.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  boundary: "process",
  boundaryRationale:
    "The Git case clones a real committed repository through the production acquisition boundary, while the path case reads the same fixture directly; both then use the shared manifest finder.",
  methods: ["decision-table", "example"],
  derivedFrom: ["extension-installability/source-family-policy-is-total"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const providers: SourceHostProvidersService = {
  resolveNamedRegistry: () => Effect.die("not used"),
  find: () => Effect.die("not used"),
  fetch: () => Effect.die("not used"),
  cloneUrl: () => Option.none(),
  origin: getOriginFromSource,
};

const writeManifest = (root: string, directory: string, fileName: string, manifest: unknown) => {
  const packageDirectory = path.join(root, directory);
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.writeFileSync(path.join(packageDirectory, fileName), `${JSON.stringify(manifest, null, 2)}\n`);
};

const writeEveryManifest = (root: string): void => {
  writeManifest(root, "skill", "skill.json", {
    owner: "@acme",
    type: "skill",
    name: "review",
    version: "1.0.0",
  });
  writeManifest(root, "mcp", "mcp.json", {
    owner: "@acme",
    type: "mcp-server",
    name: "browser",
    version: "1.0.0",
    server: { name: "io.acme/browser", description: "Browser tools", version: "1.0.0" },
  });
  writeManifest(root, "subagent", "subagent.json", {
    owner: "@acme",
    type: "subagent",
    name: "researcher",
    version: "1.0.0",
  });
  writeManifest(root, "rule", "rule.json", {
    owner: "@acme",
    type: "rule",
    name: "policy",
    version: "1.0.0",
  });
  writeManifest(root, "hook", "hook.json", {
    owner: "@acme",
    type: "hook",
    name: "audit",
    version: "1.0.0",
    runtime: "bash",
    entrypoint: "src/hook.sh",
    bindings: [{ on: "turn.end", requires: { decision: { kind: "block" } } }],
  });
  writeManifest(root, "knowledge", "knowledge.json", {
    owner: "@acme",
    type: "knowledge",
    name: "handbook",
    version: "1.0.0",
    format: { name: "okf", version: "0.2" },
    bundleRoot: "src",
  });
  writeManifest(root, "pack", "pack.json", {
    owner: "@acme",
    type: "pack",
    name: "starter",
    version: "1.0.0",
    dependencies: {},
  });
};

const git = (root: string, args: ReadonlyArray<string>): void => {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
};

describe("Git and path manifest discovery", () => {
  const roots: Array<string> = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it.effect("finds all seven manifest kinds from both source families", () =>
    Effect.gen(function* () {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-all-manifests-"));
      roots.push(root);
      writeEveryManifest(root);
      git(root, ["init", "--quiet", "--initial-branch=main"]);
      git(root, ["config", "user.email", "test@example.com"]);
      git(root, ["config", "user.name", "Test"]);
      git(root, ["add", "."]);
      git(root, ["commit", "--quiet", "-m", "fixture"]);

      const sources: ReadonlyArray<Source> = [
        { type: "local", path: root },
        { type: "git", url: pathToFileURL(root), ref: Option.none(), subPath: Option.none() },
      ];
      const discovered = yield* Effect.forEach(
        sources,
        (source) =>
          findExtensionPackagesFromSource(source, {
            names: [],
            owner: Option.none(),
            type: "*",
          }).pipe(
            Effect.provideService(SourceHostProviders, providers),
            Effect.provide(NodeServices.layer),
            Effect.scoped,
          ),
        { concurrency: 1 },
      );

      const expected = ["hook", "knowledge", "mcp-server", "pack", "rule", "skill", "subagent"];
      for (const packages of discovered) {
        expect(packages.map((candidate) => candidate.identity.type).sort()).toStrictEqual(expected);
      }
    }),
  );
});
