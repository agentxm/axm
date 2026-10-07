import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeEnvironmentProcessFixture } from "./test-support/environment-process-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/publish/existing-directory-needs-no-workspace-setup",
  title: "Creators can publish an existing directory without creating an AXM workspace",
  statement:
    "The publish command shall accept an explicit existing-directory source and separate publisher identity/version without setup or an upstream AXM manifest. Preview and publication shall leave the creator directory and scope configuration unchanged. The resulting skill shall be installable through the ordinary Registry lifecycle with its selected original metadata, supporting files, and executable modes. Repeated source-relative include and exclude flags shall override inherited Git ignores without changing the creator source.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "trustworthy-distribution"],
  boundary: "process",
  boundaryRationale:
    "The built command owns first-use flags and runtime workspace resolution; a separate consumer process proves the archive can be installed.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publishing an existing directory", () => {
  it("previews, publishes, and installs without converting the creator source", async () => {
    const creator = makeEnvironmentProcessFixture();
    const consumer = makeEnvironmentProcessFixture();
    try {
      const body =
        "---\r\nname: Upstream Display\r\nallowed-tools: [Read, Bash]\r\n---\r\n# Review\r\n";
      fs.writeFileSync(path.join(creator.invoking, "SKILL.md"), body);
      fs.writeFileSync(path.join(creator.invoking, "metadata.json"), '{"unchanged":true}\n');
      fs.writeFileSync(path.join(creator.invoking, ".gitignore"), "run.sh\n");
      fs.writeFileSync(path.join(creator.invoking, "notes.txt"), "workspace only\n");
      fs.writeFileSync(path.join(creator.invoking, "run.sh"), "#!/bin/sh\necho review\n");
      fs.chmodSync(path.join(creator.invoking, "run.sh"), 0o755);
      const registry = path.join(creator.root, "registry");
      fs.mkdirSync(registry);
      const location = pathToFileURL(registry).href;
      const command = [
        "publish",
        "@acme/skills/review",
        "--from",
        ".",
        "--package-version",
        "1.0.0",
        "--include-file",
        "**",
        "--exclude-file",
        "/notes.txt",
        "--exclude-file",
        "/.gitignore",
        "--registry-url",
        location,
        "--json",
        "--non-interactive",
      ];
      const preview = await creator.run([...command, "--preview"]);
      expect(preview.exitCode, preview.stdout + preview.stderr).toBe(0);
      expect(fs.readdirSync(registry)).toEqual([]);
      const published = await creator.run(command);
      expect(published.exitCode, published.stdout + published.stderr).toBe(0);
      for (const root of [
        creator.invoking,
        path.join(creator.applicationHome, ".axm", "workspace"),
      ]) {
        for (const name of ["axm.json", "axm-lock.yaml", "skill.json", "AGENTS.md", "CLAUDE.md"])
          expect(fs.existsSync(path.join(root, name))).toBe(false);
      }
      expect(fs.readdirSync(creator.invoking).sort()).toEqual([
        ".gitignore",
        "SKILL.md",
        "metadata.json",
        "notes.txt",
        "run.sh",
      ]);
      expect(fs.readFileSync(path.join(creator.invoking, "SKILL.md"), "utf8")).toBe(body);
      consumer.writeProjectSettings({
        agents: ["claude-code"],
        instructionFiles: false,
        sources: [{ name: "fixture", type: "registry", location }],
        defaultRegistry: "fixture",
        minimumReleaseAge: "0s",
      });
      const installed = await consumer.run([
        "install",
        "@acme/skills/review@1.0.0",
        "--json",
        "--non-interactive",
      ]);
      expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
      const native = path.join(consumer.invoking, ".claude", "skills", "Upstream Display");
      expect(fs.readFileSync(path.join(native, "SKILL.md"), "utf8")).toBe(body);
      expect(fs.readFileSync(path.join(native, "metadata.json"), "utf8")).toBe(
        '{"unchanged":true}\n',
      );
      expect(fs.statSync(path.join(native, "run.sh")).mode & 0o111).toBe(0o111);
      expect(fs.existsSync(path.join(native, "notes.txt"))).toBe(false);
      expect(fs.existsSync(path.join(native, ".gitignore"))).toBe(false);
    } finally {
      consumer.cleanup();
      creator.cleanup();
    }
  });
});
