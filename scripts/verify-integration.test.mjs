import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const hook = resolve(root, ".husky/pre-push");
const verifier = resolve(root, "scripts/verify-integration.sh");
const zero = "0".repeat(40);
const localGitVariables = spawnSync("git", ["rev-parse", "--local-env-vars"], {
  encoding: "utf8",
});
assert.equal(localGitVariables.status, 0, localGitVariables.stderr);
const localGitNames = new Set(localGitVariables.stdout.trim().split("\n"));
const fixtureEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !localGitNames.has(name)),
);

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "main-integration-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      env: fixtureEnvironment,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "--initial-branch=main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "core.hooksPath", "/dev/null");
  writeFileSync(join(cwd, "source.txt"), "base");
  git("add", ".");
  git("commit", "-m", "Base");
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(cwd, "source.txt"), "candidate");
  git("commit", "-am", "Candidate");
  const head = git("rev-parse", "HEAD");
  const bin = join(cwd, ".git", "test-bin");
  mkdirSync(bin);
  const log = join(cwd, ".git", "checks");
  writeFileSync(join(bin, "mise"), '#!/bin/sh\nshift; shift; exec "$@"\n', {
    mode: 0o755,
  });
  writeFileSync(
    join(bin, "pnpm"),
    `#!/bin/sh
set -eu
if [ "$2" = verify:integration ]; then exec bash "$VERIFIER"; fi
printf '%s\\n' "$*" >> "$CHECK_LOG"
if [ "$2" = verify:integration:source ] || [ "$2" = test:e2e:affected ]; then
  [ -z "\${GIT_DIR+x}" ] && [ -z "\${GIT_WORK_TREE+x}" ] || exit 9
fi
if [ "$2" = verify:integration:source ]; then
  [ "\${DIRTY_AFTER:-0}" = 0 ] || printf dirty > source.txt
  if [ "\${INIT_DURING_CHECK:-0}" = 1 ]; then
    temporary=$(mktemp -d)
    (cd "$temporary" && git init -q)
    test -d "$temporary/.git"
    rm -rf "$temporary"
  fi
  [ "\${BARE_AFTER:-0}" = 0 ] || git config core.bare true
  exit "\${CHECK_STATUS:-0}"
fi
if [ "$2" = test:e2e:affected ]; then
  [ "\${E2E_DIRTY_AFTER:-0}" = 0 ] || printf dirty > source.txt
  [ "\${E2E_HEAD_AFTER:-0}" = 0 ] || git -c core.hooksPath=/dev/null commit --allow-empty -qm 'Unexpected check commit'
  [ "\${E2E_BARE_AFTER:-0}" = 0 ] || git config core.bare true
  exit "\${E2E_STATUS:-0}"
fi
`,
    { mode: 0o755 },
  );
  const run = (ref = "refs/heads/main", overrides = {}, sha = head, remote = base, runCwd = cwd) =>
    spawnSync(
      "sh",
      [
        "-c",
        'PATH="${HOOK_PATH:-$(cd "$TEST_BIN" && pwd):$PATH}" exec /bin/sh "$@"',
        "hook",
        hook,
        "origin",
        "unused",
      ],
      {
        cwd: runCwd,
        encoding: "utf8",
        input: `refs/heads/handoff ${sha} ${ref} ${remote}\n`,
        env: {
          ...fixtureEnvironment,
          TEST_BIN: bin,
          VERIFIER: verifier,
          CHECK_LOG: log,
          ...overrides,
        },
      },
    );
  return { cwd, base, head, git, bin, log, run };
}

test("commits have no hook and branch/tag handoffs need no toolchain or clean checkout", (t) => {
  assert.equal(existsSync(resolve(root, ".husky/pre-commit")), false);
  const f = fixture(t);
  writeFileSync(join(f.cwd, "unfinished"), "WIP");
  for (const ref of ["refs/heads/handoff", "refs/tags/preview"]) {
    const result = f.run(ref, { HOOK_PATH: "/usr/bin:/bin" });
    assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(existsSync(f.log), false);
});

test("destination main verifies the complete range, then affected E2E, even from a handoff branch", (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(f.log, "utf8").trim().split("\n"), [
    `run check:commit-history -- --base ${f.base} --head ${f.head}`,
    "run verify:integration:source",
    "run test:e2e:affected",
  ]);
});

test("source verification failure blocks integration without running E2E", (t) => {
  const f = fixture(t);
  assert.equal(f.run(undefined, { CHECK_STATUS: "7" }).status, 7);
  assert.doesNotMatch(readFileSync(f.log, "utf8"), /test:e2e:affected/);
});

test("an E2E failure blocks a real main push and leaves the remote unchanged", (t) => {
  const f = fixture(t);
  const remote = join(f.cwd, ".git", "remote.git");
  f.git("init", "--bare", remote);
  f.git("push", remote, `${f.base}:refs/heads/main`);
  const hooks = join(f.cwd, ".git", "fixture-hooks");
  mkdirSync(hooks);
  writeFileSync(
    join(hooks, "pre-push"),
    '#!/bin/sh\nexec /bin/sh "$MAIN_INTEGRATION_HOOK" "$@"\n',
    {
      mode: 0o755,
    },
  );
  f.git("config", "core.hooksPath", hooks);
  const result = spawnSync("git", ["push", remote, "HEAD:main"], {
    cwd: f.cwd,
    encoding: "utf8",
    env: {
      ...fixtureEnvironment,
      PATH: `${f.bin}:${fixtureEnvironment.PATH ?? ""}`,
      MAIN_INTEGRATION_HOOK: hook,
      VERIFIER: verifier,
      CHECK_LOG: f.log,
      E2E_STATUS: "11",
    },
  });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(readFileSync(f.log, "utf8").trim().split("\n").slice(-2), [
    "run verify:integration:source",
    "run test:e2e:affected",
  ]);
  assert.equal(f.git("--git-dir", remote, "rev-parse", "refs/heads/main"), f.base);
});

test("source and E2E checks do not inherit the caller's hook-local Git context", (t) => {
  const f = fixture(t);
  const result = f.run(undefined, {
    GIT_DIR: join(f.cwd, ".git"),
    GIT_WORK_TREE: f.cwd,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.git("rev-parse", "HEAD"), f.head);
});

test("dirty checkout, unchecked source, deletion, and main creation fail before source checks", (t) => {
  const f = fixture(t);
  for (const [sha, base] of [
    [f.base, f.base],
    [zero, f.base],
    [f.head, zero],
  ])
    assert.notEqual(f.run(undefined, {}, sha, base).status, 0);
  writeFileSync(join(f.cwd, "unfinished"), "dirty");
  assert.notEqual(f.run().status, 0);
  assert.equal(existsSync(f.log), false);
});

test("generated changes invalidate the checked candidate", (t) => {
  const f = fixture(t);
  assert.notEqual(f.run(undefined, { DIRTY_AFTER: "1" }).status, 0);
});

test("E2E output changes invalidate the checked candidate", (t) => {
  const f = fixture(t);
  const result = f.run(undefined, { E2E_DIRTY_AFTER: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /verification changed files/);
});

test("E2E changes to HEAD invalidate the checked candidate", (t) => {
  const f = fixture(t);
  const result = f.run(undefined, { E2E_HEAD_AFTER: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HEAD changed during verification/);
});

test("divergent main fails instead of permitting a force push", (t) => {
  const f = fixture(t);
  f.git("checkout", "-b", "other", f.base);
  writeFileSync(join(f.cwd, "other"), "competing change");
  f.git("add", ".");
  f.git("commit", "-m", "Other writer");
  const remote = f.git("rev-parse", "HEAD");
  f.git("checkout", "--detach", f.head);
  assert.notEqual(f.run(undefined, {}, f.head, remote).status, 0);
  assert.equal(existsSync(f.log), false);
});

test("linked-worktree source checks initialize their own repository without corrupting the caller", (t) => {
  const f = fixture(t);
  const linked = join(f.cwd, ".git", "linked-checkout");
  f.git("worktree", "add", "--detach", linked);
  const gitDirectory = f.git("-C", linked, "rev-parse", "--absolute-git-dir");
  const result = f.run(
    undefined,
    {
      GIT_DIR: gitDirectory,
      INIT_DURING_CHECK: "1",
    },
    f.head,
    f.base,
    linked,
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.git("config", "--bool", "core.bare"), "false");
  assert.equal(f.git("rev-parse", "HEAD"), f.head);
});

test("a bare repository is refused before source checks", (t) => {
  const f = fixture(t);
  f.git("config", "core.bare", "true");
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /core.bare is true/);
  assert.equal(existsSync(f.log), false);
});

for (const status of ["0", "7"]) {
  test(`source checks exiting ${status} that corrupt core.bare fail loudly`, (t) => {
    const f = fixture(t);
    const result = f.run(undefined, { BARE_AFTER: "1", CHECK_STATUS: status });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /core.bare is true/);
  });
  test(`E2E checks exiting ${status} that corrupt core.bare fail loudly`, (t) => {
    const f = fixture(t);
    const result = f.run(undefined, { E2E_BARE_AFTER: "1", E2E_STATUS: status });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /core.bare is true/);
  });
}
