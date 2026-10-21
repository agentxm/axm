import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";

/** @typedef {Record<string, string>} Env */

const packageRoot = resolve(import.meta.dirname, "..");
const launcher = join(packageRoot, "bin/check-staged.mjs");
// The README documents the hook a repository commits; the fixture uses it as is.
const hookTemplate = (() => {
  const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
  const block = [...readme.matchAll(/```sh\n([^`]*)```/gu)]
    .map(([, body]) => body)
    .find((body) => body?.includes("bin/check-staged.mjs"));
  if (block === undefined) throw new Error("The README has no pre-commit hook template.");
  return block;
})();
// Nx, lint-staged, and the compiler come from the workspace installation.
const require = createRequire(import.meta.url);
const installed = (/** @type {string} */ name) => dirname(require.resolve(`${name}/package.json`));
const bin = (/** @type {string} */ name, /** @type {string} */ command) => {
  /** @type {unknown} */
  const manifest = JSON.parse(readFileSync(join(installed(name), "package.json"), "utf8"));
  const entry =
    typeof manifest === "object" && manifest !== null && "bin" in manifest
      ? Object.entries(manifest.bin ?? {}).find(([key]) => key === command)?.[1]
      : undefined;
  if (typeof entry !== "string") throw new Error(`${name} has no ${command} binary.`);
  return join(installed(name), entry);
};
const nx = bin("nx", "nx");
const lintStaged = bin("lint-staged", "lint-staged");
const tsc = bin("@typescript/native", "tsc");
const timeout = { timeout: 60_000 };
/** @type {string[]} */
const fixtures = [];
const projects = ["producer", "consumer", "unrelated"];
const baseline = "Fixture baseline";
const autoFix = 'export const value: string = "AUTO_FIX";\n';
const consumerSource = [
  'import { value } from "../producer/value.js";',
  "const message: string = value;",
  "",
].join("\n");
const cached = /read the output from the cache|existing outputs match/u;
const environment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => !name.startsWith("GIT_") && !name.startsWith("NX_"),
  ),
);

/**
 * @param {string} root
 * @param {string} cmd
 * @param {string[]} args
 * @param {Env} [extra]
 */
const run = (root, cmd, args, extra = {}) => {
  const result = spawnSync(cmd, args, {
    cwd: root,
    env: {
      ...environment,
      NX_DAEMON: "false",
      NX_ISOLATE_PLUGINS: "false",
      CHECK_LOG: `${root}/checks.log`,
      PATH: `${root}/bin:${process.env["PATH"]}`,
      ...extra,
    },
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
};

const git = (/** @type {string} */ root, /** @type {string[]} */ ...args) => {
  const result = run(root, "git", args);
  if (result.status !== 0) throw new Error(result.output);
  return result.output;
};

const show = (/** @type {string} */ root, /** @type {string} */ object) =>
  git(root, "show", object);
const subject = (/** @type {string} */ root) => {
  return git(root, "log", "-1", "--format=%s").trim();
};
const read = (/** @type {string} */ root, /** @type {string} */ file) => {
  return readFileSync(join(root, file), "utf8");
};
const write = (
  /** @type {string} */ root,
  /** @type {string} */ file,
  /** @type {string} */ content,
) => writeFileSync(join(root, file), content);
const value = (/** @type {"string" | "number"} */ type) =>
  `export const value: ${type} = ${type === "string" ? '"valid"' : "123"};\n`;
const broken = (/** @type {string} */ text) => `const broken: number = "${text}";\n`;
const stage = (
  /** @type {string} */ root,
  /** @type {string} */ file,
  /** @type {string} */ content,
) => {
  write(root, file, content);
  git(root, "add", "--", file);
};
const check = (/** @type {string} */ root, /** @type {Env} */ extra = {}) => {
  return run(root, "bash", [".husky/pre-commit"], extra);
};
const commit = (/** @type {string} */ root, /** @type {Env} */ extra = {}) =>
  run(root, "git", ["-c", "core.hooksPath=.husky", "commit", "-m", "Candidate"], extra);
const log = (/** @type {string} */ root) => read(root, "checks.log");
const includes = (/** @type {string} */ text, /** @type {string} */ part) =>
  assert.ok(text.includes(part), `Expected to find ${JSON.stringify(part)} in:\n${text}`);
const excludes = (/** @type {string} */ text, /** @type {string} */ part) =>
  assert.ok(!text.includes(part), `Expected no ${JSON.stringify(part)} in:\n${text}`);

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "staged-typecheck-"));
  fixtures.push(root);
  for (const dir of ["scripts", ".husky", "bin", ...projects]) {
    mkdirSync(join(root, dir));
  }
  write(root, ".husky/pre-commit", hookTemplate);
  chmodSync(join(root, ".husky/pre-commit"), 0o755);
  // A synthetic repository hook stands in for the host repository's checks:
  // one staged auto-fix, then one gate with a controllable exit code.
  writeFileSync(
    join(root, "scripts/check-staged.checks.sh"),
    "#!/usr/bin/env bash\nset -euo pipefail\n" +
      "pnpm exec lint-staged --no-stash\npnpm exec example-gate\n",
    { mode: 0o755 },
  );
  // These are foreign-host adapters in a synthetic workspace. Nx, Git,
  // lint-staged, and the compiler stay real; the hook's gate has a
  // controllable exit code instead of requiring providers or the whole repo.
  writeFileSync(
    join(root, "bin/pnpm"),
    `#!/usr/bin/env bash
set -euo pipefail
while [[ "\${1:-}" == --config.* ]]; do shift; done
if [[ "$1" == install ]]; then
  if [[ "\${FAIL_GATE:-}" == install ]]; then exit 23; fi
  ln -s '${root}/node_modules' node_modules; exit 0
fi
if [[ "$1 \${2:-}" == 'exec lint-staged' ]]; then
  shift 2
  if [[ "\${FAIL_GATE:-}" == fixes && " $* " == *' --no-stash '* ]]; then exit 23; fi
  exec node '${lintStaged}' "$@"
fi
if [[ "$1 \${2:-}" == 'exec nx' && "\${3:-}" == affected ]]; then
  shift 2
  set +e
  node '${nx}' "$@" > nx.log 2>&1
  result=$?
  cat nx.log >> "\${CHECK_LOG}"
  cat nx.log
  exit "$result"
fi
printf '%s\\n' "$*" >> "\${CHECK_LOG}"
if [[ -n "\${FAIL_GATE:-}" && "$*" == *"$FAIL_GATE"* ]]; then exit 23; fi
`,
    { mode: 0o755 },
  );
  write(root, ".gitignore", "node_modules\n.nx/\nchecks.log\nnx.log\n");
  write(
    root,
    "package.json",
    JSON.stringify({
      name: "fixture",
      private: true,
      type: "module",
      "lint-staged": { "*.ts": "node scripts/fix.mjs" },
    }),
  );
  write(
    root,
    "scripts/fix.mjs",
    `import { readFileSync, writeFileSync } from 'node:fs';\nfor (const file of process.argv.slice(2)) writeFileSync(file, readFileSync(file, 'utf8').replace('"AUTO_FIX"', '"valid"'));\n`,
  );
  write(
    root,
    "nx.json",
    JSON.stringify({
      defaultBase: "missing-branch",
      plugins: [],
      namedInputs: { default: ["{projectRoot}/**/*"] },
    }),
  );
  for (const name of projects) {
    write(
      root,
      `${name}/project.json`,
      JSON.stringify({
        name,
        ...(name === "consumer" ? { implicitDependencies: ["producer"] } : {}),
        targets: {
          typecheck: {
            executor: "nx:run-commands",
            cache: true,
            inputs: ["default", "^default"],
            outputs: [],
            options: {
              command: `node '${tsc}' -p ${name}/tsconfig.json --noEmit`,
            },
          },
        },
      }),
    );
    write(
      root,
      `${name}/tsconfig.json`,
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: "ES2023",
          module: "NodeNext",
          types: [],
          skipLibCheck: true,
        },
        include: ["*.ts"],
      }),
    );
  }
  write(root, "producer/value.ts", 'export const value: string = "initial";\n');
  write(root, "producer/other.ts", "export const other = true;\n");
  write(root, "consumer/use.ts", consumerSource);
  write(root, "unrelated/other.ts", "export const other = true;\n");
  // lint-staged prepends local binaries to PATH. Keep the gate adapter there
  // too, so a pnpm binary in the host installation cannot shadow the fixture.
  // The gate itself is installed where a consuming repository's hook finds it.
  mkdirSync(join(root, "node_modules/@agentxm"), { recursive: true });
  symlinkSync(join(root, "bin"), join(root, "node_modules/.bin"), "dir");
  symlinkSync(packageRoot, join(root, "node_modules/@agentxm/workspace-conventions"), "dir");
  for (const dependency of ["lint-staged", "nx"])
    symlinkSync(installed(dependency), join(root, "node_modules", dependency), "dir");
  git(root, "init", "-q");
  git(root, "config", "user.name", "Hook regression");
  git(root, "config", "user.email", "hook-test@example.invalid");
  git(root, "add", ".");
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", baseline);
  return root;
};

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("staged compiler gate", () => {
  it(
    "selects an unchanged consumer, invalidates its cached verdict, and excludes unrelated projects",
    timeout,
    () => {
      const root = fixture();
      stage(root, "producer/value.ts", autoFix);
      const valid = check(root, { NX_BASE: "not-a-base", NX_HEAD: "not-a-head" });
      assert.equal(valid.status, 0, valid.output);
      assert.equal(show(root, ":producer/value.ts"), value("string"));
      includes(log(root), "consumer:typecheck");
      excludes(log(root), "unrelated:typecheck");
      const gate = log(root).indexOf("exec example-gate");
      assert.ok(gate >= 0);
      assert.ok(gate < log(root).indexOf("consumer:typecheck"));
      assert.equal(check(root).status, 0);
      assert.match(log(root), cached);
      stage(root, "producer/value.ts", value("number"));
      const result = check(root);
      assert.notEqual(result.status, 0, result.output + log(root));
      includes(result.output, "consumer");
      includes(result.output, "not assignable to type 'string'");
    },
  );

  it(
    "fails for an invalid index even when unstaged producer and consumer edits would repair it",
    timeout,
    () => {
      const root = fixture();
      stage(root, "producer/value.ts", value("number"));
      write(root, "producer/value.ts", value("string"));
      write(root, "consumer/use.ts", "export const repaired = true;\n");
      write(root, "consumer/extra.ts", "export const untracked = true;\n");
      const before = git(root, "status", "--porcelain=v1");
      const result = check(root);
      assert.notEqual(result.status, 0, result.output);
      includes(result.output, "not assignable to type 'string'");
      assert.equal(show(root, ":producer/value.ts"), value("number"));
      assert.equal(read(root, "producer/value.ts"), value("string"));
      includes(read(root, "consumer/use.ts"), "repaired");
      includes(read(root, "consumer/extra.ts"), "untracked");
      assert.equal(git(root, "status", "--porcelain=v1"), before);
      assert.equal(git(root, "stash", "list"), "");
    },
  );

  it(
    "passes a valid index with broken unstaged, partially staged, and untracked sources, restoring them",
    timeout,
    () => {
      const root = fixture();
      stage(root, "producer/value.ts", autoFix);
      write(root, "producer/value.ts", autoFix + broken("unstaged"));
      write(root, "consumer/use.ts", broken("unstaged consumer"));
      write(root, "consumer/extra.ts", broken("untracked"));
      const valid = check(root);
      assert.equal(valid.status, 0, valid.output);
      assert.equal(show(root, ":producer/value.ts"), value("string"));
      includes(read(root, "producer/value.ts"), '"unstaged"');
      includes(read(root, "consumer/use.ts"), "unstaged consumer");
      includes(read(root, "consumer/extra.ts"), "untracked");
      assert.equal(git(root, "stash", "list"), "");
    },
  );

  it(
    "checks a deletion-only commit against the index even if the deleted file exists unstaged",
    timeout,
    () => {
      const root = fixture();
      git(root, "rm", "producer/value.ts");
      write(root, "producer/value.ts", value("string"));
      const result = check(root);
      assert.notEqual(result.status, 0, result.output);
      includes(result.output, "Cannot find module");
      assert.equal(read(root, "producer/value.ts"), value("string"));
      const staged = git(root, "diff", "--cached", "--name-status");
      includes(staged, "D\tproducer/value.ts");
    },
  );

  it(
    "includes both sides of a cross-project rename and accepts a coherent addition",
    timeout,
    () => {
      const root = fixture();
      git(root, "mv", "producer/value.ts", "unrelated/moved.ts");
      assert.notEqual(check(root).status, 0);
      includes(log(root), "consumer:typecheck");
      includes(log(root), "unrelated:typecheck");
      stage(
        root,
        "consumer/use.ts",
        'import { value } from "../unrelated/moved.js";\nconst message: string = value;\n',
      );
      stage(root, "consumer/added.ts", "export const added = true;\n");
      const valid = check(root);
      assert.equal(valid.status, 0, valid.output);
    },
  );

  it(
    "uses staged root configuration and excludes unstaged dependency-manifest changes",
    timeout,
    () => {
      const root = fixture();
      const config = {
        defaultBase: "missing-branch",
        plugins: [],
        namedInputs: {
          default: ["{projectRoot}/**/*", "{workspaceRoot}/compiler-policy.json"],
        },
      };
      stage(root, "nx.json", JSON.stringify(config));
      stage(root, "compiler-policy.json", "{}\n");
      write(root, "package.json", "invalid unstaged JSON\n");
      const result = check(root);
      assert.equal(result.status, 0, result.output);
      includes(log(root), "producer:typecheck");
      includes(log(root), "consumer:typecheck");
      includes(log(root), "unrelated:typecheck");
      includes(read(root, "package.json"), "invalid unstaged");
    },
  );

  it("accepts staged package metadata changes and selects dependent consumers", timeout, () => {
    const root = fixture();
    stage(
      root,
      "producer/package.json",
      JSON.stringify({
        name: "producer",
        private: true,
        type: "module",
        dependencies: { example: "1.0.0" },
      }),
    );
    const result = check(root);
    assert.equal(result.status, 0, result.output);
    includes(log(root), "producer:typecheck");
    includes(log(root), "consumer:typecheck");
  });

  it("rejects newline filenames without weakening the selection protocol", timeout, () => {
    const root = fixture();
    stage(root, "producer/new\nfile.ts", "export const added = true;\n");
    const result = check(root);
    assert.notEqual(result.status, 0, result.output);
    includes(result.output, "filename containing a newline");
  });

  it(
    "validates a pathspec commit temporary index and preserves other staged changes",
    timeout,
    () => {
      const root = fixture();
      stage(root, "consumer/use.ts", broken("staged for another commit"));
      write(root, "producer/value.ts", value("string"));
      const result = run(root, "git", [
        "-c",
        "core.hooksPath=.husky",
        "commit",
        "--only",
        "producer/value.ts",
        "-m",
        "Producer update",
      ]);
      assert.equal(result.status, 0, result.output);
      assert.equal(show(root, "HEAD:producer/value.ts"), value("string"));
      includes(show(root, ":consumer/use.ts"), "another commit");
      assert.equal(show(root, "HEAD:consumer/use.ts"), consumerSource);
    },
  );

  it(
    "blocks a compiler failure from committing and removes its disposable worktree",
    timeout,
    () => {
      const root = fixture();
      stage(root, "producer/value.ts", value("number"));
      const result = run(root, "git", [
        "-c",
        "core.hooksPath=.husky",
        "commit",
        "-m",
        "Incompatible producer",
      ]);
      assert.notEqual(result.status, 0, result.output);
      includes(result.output, "not assignable to type 'string'");
      assert.equal(subject(root), baseline);
      const worktrees = git(root, "worktree", "list", "--porcelain");
      assert.equal(worktrees.match(/^worktree /gm)?.length, 1);
    },
  );

  it("selects projects after a compiler configuration change", timeout, () => {
    const root = fixture();
    stage(
      root,
      "consumer/tsconfig.json",
      JSON.stringify({
        compilerOptions: { types: [], noUnusedLocals: true },
        include: ["*.ts"],
      }),
    );
    const result = check(root);
    assert.notEqual(result.status, 0, result.output);
    includes(result.output, "never read");
  });

  for (const gate of ["fixes", "example-gate", "install"]) {
    it(`stops a commit after the ${gate} gate fails and restores unstaged work`, timeout, () => {
      const root = fixture();
      stage(root, "producer/value.ts", autoFix);
      write(root, "consumer/extra.ts", "export const untracked = true;\n");
      const before = git(root, "status", "--porcelain=v1");
      const result = commit(root, { FAIL_GATE: gate });
      assert.notEqual(result.status, 0, result.output);
      const logged = existsSync(join(root, "checks.log")) ? log(root) : "";
      excludes(logged, ":typecheck");
      assert.equal(subject(root), baseline);
      const staged = gate === "fixes" ? autoFix : value("string");
      assert.equal(show(root, ":producer/value.ts"), staged);
      assert.equal(git(root, "status", "--porcelain=v1"), before);
      assert.equal(git(root, "stash", "list"), "");
    });
  }
});

describe("staged gate launcher", () => {
  it(
    "runs the named checks file against the isolated index after isolation and before the typecheck",
    timeout,
    () => {
      const root = fixture();
      mkdirSync(join(root, "hooks"));
      stage(
        root,
        "hooks/staged.sh",
        'printf "named checks saw %s" "$(cat producer/value.ts)" >> "$CHECK_LOG"\n',
      );
      stage(root, "producer/value.ts", value("string"));
      write(root, "producer/value.ts", value("string") + broken("unstaged"));
      const result = run(root, "node", [launcher, "hooks/staged.sh"]);
      assert.equal(result.status, 0, result.output);
      const checked = log(root).indexOf(`named checks saw ${value("string").trimEnd()}`);
      assert.ok(checked >= 0, log(root));
      assert.ok(checked < log(root).indexOf("producer:typecheck"), log(root));
      assert.equal(read(root, "producer/value.ts"), value("string") + broken("unstaged"));
      assert.equal(git(root, "stash", "list"), "");
    },
  );

  it("stops the commit when a check fails and restores a partially staged file", timeout, () => {
    const root = fixture();
    stage(root, "producer/value.ts", value("string"));
    write(root, "producer/value.ts", value("string") + broken("unstaged"));
    const before = git(root, "status", "--porcelain=v1");
    const result = commit(root, { FAIL_GATE: "example-gate" });
    assert.notEqual(result.status, 0, result.output);
    excludes(log(root), ":typecheck");
    assert.equal(subject(root), baseline);
    assert.equal(show(root, ":producer/value.ts"), value("string"));
    assert.equal(read(root, "producer/value.ts"), value("string") + broken("unstaged"));
    assert.equal(git(root, "status", "--porcelain=v1"), before);
    assert.equal(git(root, "stash", "list"), "");
  });

  it("fails clearly before isolation when the checks file is missing", timeout, () => {
    const root = fixture();
    stage(root, "producer/value.ts", value("string"));
    write(root, "producer/value.ts", value("string") + broken("unstaged"));
    const before = git(root, "status", "--porcelain=v1");
    const result = run(root, "node", [launcher, "hooks/missing.sh"]);
    assert.equal(result.status, 2, result.output);
    includes(result.output, "the staged checks file hooks/missing.sh does not exist");
    assert.equal(existsSync(join(root, "checks.log")), false);
    assert.equal(git(root, "status", "--porcelain=v1"), before);
    assert.equal(git(root, "stash", "list"), "");
  });
});
