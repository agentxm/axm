import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

type Fixture = {
  gitLog: string;
  remoteTagOutput: string;
  ciRuns: ReadonlyArray<{
    databaseId: number;
    status: string;
    conclusion: string | null;
    url: string;
  }>;
  releaseView: { ok: true; stdout: string } | { ok: false; stderr: string };
};

const tempDirs: string[] = [];

const writeExecutable = (path: string, contents: string) => {
  writeFileSync(path, contents, { encoding: "utf8" });
  chmodSync(path, 0o755);
};

const createStubBin = (fixture: Fixture): { binDir: string; fixturePath: string } => {
  const tempDir = mkdtempSync(join(tmpdir(), "release-status-"));
  tempDirs.push(tempDir);

  const fixturePath = join(tempDir, "fixture.json");
  writeFileSync(fixturePath, JSON.stringify(fixture), { encoding: "utf8" });

  writeExecutable(
    join(tempDir, "git"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const fixture = JSON.parse(fs.readFileSync(process.env.RELEASE_STATUS_FIXTURE, "utf8"));
const args = process.argv.slice(2);

if (args[0] === "fetch" && args[1] === "origin" && args[2] === "main") {
  process.exit(0);
}

if (args[0] === "log" && args[1] === "origin/main") {
  process.stdout.write(fixture.gitLog);
  process.exit(0);
}

if (args[0] === "ls-remote" && args[1] === "--tags" && args[2] === "origin") {
  process.stdout.write(fixture.remoteTagOutput);
  process.exit(0);
}

console.error("unexpected git args: " + args.join(" "));
process.exit(1);
`,
  );

  writeExecutable(
    join(tempDir, "gh"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const fixture = JSON.parse(fs.readFileSync(process.env.RELEASE_STATUS_FIXTURE, "utf8"));
const args = process.argv.slice(2);

if (args[0] === "run" && args[1] === "list") {
  process.stdout.write(JSON.stringify(fixture.ciRuns));
  process.exit(0);
}

if (args[0] === "release" && args[1] === "view") {
  if (fixture.releaseView.ok) {
    process.stdout.write(fixture.releaseView.stdout);
    process.exit(0);
  }

  console.error(fixture.releaseView.stderr);
  process.exit(1);
}

console.error("unexpected gh args: " + args.join(" "));
process.exit(1);
`,
  );

  return { binDir: tempDir, fixturePath };
};

const runReleaseStatus = (fixture: Fixture): string => {
  const { binDir, fixturePath } = createStubBin(fixture);

  return execFileSync("bun", ["scripts/release-status.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_REPOSITORY: "agentxm/axm",
      PATH: `${binDir}:${process.env["PATH"] ?? ""}`,
      RELEASE_STATUS_FIXTURE: fixturePath,
    },
  });
};

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir !== undefined) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

describe("release status", () => {
  it("reports a prepared release that is ready to publish", () => {
    const output = runReleaseStatus({
      gitLog: "abc123\trelease: cli-v0.0.37",
      remoteTagOutput: "",
      ciRuns: [
        {
          databaseId: 1,
          status: "completed",
          conclusion: "success",
          url: "https://example.test/runs/1",
        },
      ],
      releaseView: {
        ok: false,
        stderr: "release not found",
      },
    });

    expect(output).toContain("Latest prepared release: cli-v0.0.37");
    expect(output).toContain("Commit: abc123");
    expect(output).toContain("CI: success https://example.test/runs/1");
    expect(output).toContain("Tag on origin: missing");
    expect(output).toContain("GitHub release: missing");
    expect(output).toContain("Status: ready to publish");
  });

  it("reports a published release when the GitHub release already exists", () => {
    const output = runReleaseStatus({
      gitLog: "def456\trelease: cli-v0.0.38",
      remoteTagOutput: "def456\trefs/tags/cli-v0.0.38\n",
      ciRuns: [
        {
          databaseId: 2,
          status: "completed",
          conclusion: "success",
          url: "https://example.test/runs/2",
        },
      ],
      releaseView: {
        ok: true,
        stdout: JSON.stringify({
          tagName: "cli-v0.0.38",
          url: "https://example.test/releases/cli-v0.0.38",
          isDraft: false,
          isPrerelease: false,
          publishedAt: "2026-03-31T00:00:00Z",
        }),
      },
    });

    expect(output).toContain("Latest prepared release: cli-v0.0.38");
    expect(output).toContain("Tag on origin: present");
    expect(output).toContain("GitHub release: present https://example.test/releases/cli-v0.0.38");
    expect(output).toContain("Status: published");
  });
});
