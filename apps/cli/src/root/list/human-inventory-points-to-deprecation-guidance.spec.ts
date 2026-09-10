import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";

import { computeMaterializedTreeIntegritySync, writeWorkspaceFiles } from "../../test-stubs.js";
import { makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { handleList } from "./command.js";

export const specification = defineSpecification({
  requirement: "cli/list/human-inventory-points-to-deprecation-guidance",
  title: "Human inventories point readers at the deprecation guidance command",
  statement:
    "When an ordinary inventory rendered for a person includes a deprecated installation, AXM shall name the command that reports that extension's full deprecation guidance.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "cli/list/ordinary-inventory-identifies-deprecation",
    "apps/cli/src/root/list/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Deprecation guidance in human inventories", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "list-deprecation-guidance-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("names the guidance command for the deprecated row", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({});
    const registryDir = path.join(tempDir, "registry");
    const skillDir = path.join(tempDir, "agent_extensions", "company", "@acme", "skills", "review");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: review\ndescription: Review guidance\n---\n# Review\n",
    );
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      sources: [{ name: "company", type: "registry", location: pathToFileURL(registryDir).href }],
      skills: { review: { source: "company:@acme/skills/review@^1.0.0", enabled: true } },
      lockfileSkills: {
        review: {
          type: "registry",
          sourceType: "registry",
          sourceName: "company",
          endpoint: pathToFileURL(registryDir).href,
          extensionType: "skill",
          workspaceName: "review",
          owner: "@acme",
          name: "review",
          resolvedVersion: "1.0.0",
          integrity: "sha512-AAAA==",
          packageFormat: "agentxm",
          publisherBindingId: "hbnd_test",
          treeIntegrity: computeMaterializedTreeIntegritySync(skillDir),
        },
      },
    });
    const indexDir = path.join(registryDir, "extensions", "@acme", "skills", "review");
    fs.mkdirSync(indexDir, { recursive: true });
    fs.writeFileSync(
      path.join(indexDir, "index.json"),
      JSON.stringify({
        owner: "@acme",
        type: "skill",
        name: "review",
        publisherBindingId: "hbnd_test",
        deprecation: {
          deprecatedAt: "2026-03-01T00:00:00.000Z",
          message: "Use the replacement skill.",
        },
        versions: [
          { version: "1.0.0", published: "2026-01-01T00:00:00.000Z", integrity: "sha512-AAAA==" },
        ],
      }),
    );

    return provide(
      Effect.gen(function* () {
        yield* handleList({ type: Option.none(), outdated: false, deprecated: false });
        const rendered = JSON.stringify(rendererState.docs);
        expect(rendered).toContain("deprecated");
        expect(rendered).toContain("axm view @acme/skills/review deprecation");
      }),
    );
  });
});
