import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parse } from "yaml";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("detects new findings and permits only the reviewed historical fingerprint", () => {
  const toolDirectory = execFileSync("mise", ["where", "gitleaks"], {
    cwd: repository,
    encoding: "utf8",
  }).trim();
  const binary = join(toolDirectory, process.platform === "win32" ? "gitleaks.exe" : "gitleaks");
  const fixture = mkdtempSync(join(tmpdir(), "axm-secret-scan-"));
  const git = (...args) =>
    execFileSync(
      "git",
      [
        "-c",
        `core.hooksPath=${join(fixture, "no-hooks")}`,
        "-c",
        "commit.gpgSign=false",
        "-c",
        "user.name=Scanner contract",
        "-c",
        "user.email=scanner@example.invalid",
        ...args,
      ],
      { cwd: fixture, stdio: "pipe" },
    );
  const reportPath = join(fixture, "scan-report.json");
  // Locally generated provider-shaped strings have never been issued as credentials.
  const first = `ghp_${randomBytes(18).toString("hex")}`;
  const second = `ghp_${randomBytes(18).toString("hex")}`;
  const scan = (mode) => {
    const result = spawnSync(
      binary,
      [
        "git",
        "--config",
        ".gitleaks.toml",
        "--redact=100",
        "--no-banner",
        "--no-color",
        "--ignore-gitleaks-allow",
        "--report-format=json",
        `--report-path=${reportPath}`,
        mode,
        ".",
      ],
      { cwd: fixture, encoding: "utf8" },
    );
    if (result.error) throw result.error;
    const report = readFileSync(reportPath, "utf8");
    const output = `${result.stdout}${result.stderr}${report}`;
    assert.equal(
      output.includes(first),
      false,
      "the scanner must redact the complete first fixture",
    );
    assert.equal(
      output.includes(second),
      false,
      "the scanner must redact the complete second fixture",
    );
    return { status: result.status, findings: JSON.parse(report) };
  };

  try {
    copyFileSync(join(repository, ".gitleaks.toml"), join(fixture, ".gitleaks.toml"));
    copyFileSync(join(repository, ".gitleaksignore"), join(fixture, ".gitleaksignore"));
    git("init", "--quiet");
    git("add", ".gitleaks.toml", ".gitleaksignore");
    git("commit", "--quiet", "-m", "Initialize scanner contract");
    writeFileSync(join(fixture, "fixture.txt"), `api_key = "${first}" # gitleaks:allow\n`);
    git("add", "fixture.txt");
    assert.equal(
      scan("--staged").status,
      1,
      "staged findings and inline bypass comments must fail",
    );
    git("commit", "--quiet", "-m", "Synthetic scanner positive");
    const historical = scan("--log-opts=HEAD");
    assert.equal(historical.status, 1, "new committed findings must fail");
    const finding = historical.findings.find((row) => row.RuleID === "github-pat");
    assert.ok(finding, "the complete provider rule set must detect the synthetic PAT");
    writeFileSync(join(fixture, ".gitleaksignore"), `${finding.Fingerprint}\n`);
    assert.equal(
      scan("--log-opts=HEAD").status,
      0,
      "the exact reviewed fingerprint may be excluded",
    );
    writeFileSync(join(fixture, "fixture.txt"), `api_key = "${second}"\n`);
    assert.equal(scan("--pre-commit").status, 1, "tracked working changes must be scanned");
    git("add", "fixture.txt");
    assert.equal(
      scan("--staged").status,
      1,
      "an exception must not suppress later changes on the same line",
    );
    git("commit", "--quiet", "-m", "A different synthetic scanner positive");
    assert.equal(scan("--log-opts=HEAD").status, 1, "an exception must not suppress later commits");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("Required CI rejects failed, cancelled, skipped, and missing secret evidence", () => {
  const workflow = parse(readFileSync(join(repository, ".github/workflows/ci.yml"), "utf8"));
  const required = workflow.jobs.required;
  assert.ok(
    required.needs.includes("secrets"),
    "secret scanning must participate in the required rollup",
  );
  const step = required.steps.find((entry) => entry.name === "Require every applicable check");
  assert.equal(typeof step?.run, "string");
  const fixture = mkdtempSync(join(tmpdir(), "axm-security-rollup-"));
  try {
    for (const state of ["success", "failure", "cancelled", "skipped", "missing"]) {
      const results = Object.fromEntries(
        required.needs.map((name) => [name, { result: "success" }]),
      );
      if (state === "missing") delete results.secrets;
      else results.secrets.result = state;
      const result = spawnSync("bash", ["-c", step.run], {
        cwd: fixture,
        encoding: "utf8",
        env: {
          ...process.env,
          RESULTS: JSON.stringify(results),
          EVENT_NAME: "pull_request",
          SELECTED_RUNNER: "",
          DOCS_CHANGED: "false",
          IMAGE_CHANGED: "false",
          WORKFLOW_CHANGED: "false",
          GITHUB_STEP_SUMMARY: join(fixture, "summary.md"),
        },
      });
      if (result.error) throw result.error;
      assert.equal(
        result.status,
        state === "success" ? 0 : 1,
        `required rollup with ${state} secret evidence`,
      );
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
