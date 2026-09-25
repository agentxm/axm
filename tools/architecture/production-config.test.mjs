import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { ESLint } from "eslint";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { createRequire } from "node:module";
import { globSync } from "node:fs";
import { capabilityElements, capabilityFileDescriptors } from "./config.mjs";

const root = resolve(import.meta.dirname, "../..");
const domainFile =
  "packages/core/extension-model/src/unstable/version-constraints/version-selection.ts";
const eslint = new ESLint({ cwd: root });
const require = createRequire(import.meta.url);
const { Elements } = require("@boundaries/elements");

for (const [kind, other] of [
  ["skills", "subagents"],
  ["subagents", "skills"],
]) {
  for (const [name, code, rule] of [
    [
      "application cannot acquire source content",
      'import * as FileSystem from "effect/FileSystem"; export { FileSystem };',
      "boundaries/dependencies",
    ],
    [
      "application cannot use its sibling consumer",
      `export * from "../../../${other}/lifecycle/application/installation.js";`,
      "boundaries/dependencies",
    ],
    [
      "application cannot enter unmigrated implementation",
      'export * from "../install/plan.js";',
      "boundaries/no-unknown-dependencies",
    ],
  ]) {
    test(`${kind} ${name}`, async () => {
      const [result] = await eslint.lintText(code, {
        filePath: `packages/core/workspace/src/${kind}/lifecycle/application/installation.ts`,
      });
      assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
      assert.ok(
        result.messages.some(({ ruleId }) => ruleId === rule),
        JSON.stringify(result.messages),
      );
    });
  }
}

test("shared extension matching cannot acquire the install selection policy", async () => {
  const [result] = await eslint.lintText(
    'export { selectInstallRefs } from "@agentxm/workspace/lifecycle";',
    { filePath: "packages/core/extension-model/src/unstable/extensions/name-patterns.ts" },
  );
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.ok(
    result.messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"),
    JSON.stringify(result.messages),
  );
});

test("root configuration composes a tooling project without a package facade", async () => {
  const results = await eslint.lintFiles(["eslint.config.mjs"]);
  assert.deepEqual(
    results.flatMap(({ messages }) => messages),
    [],
  );
});

test("every published policy entry exists and has its declared file classification", () => {
  const matcher = new Elements({ rootPath: root }).getMatcher({
    elements: capabilityElements,
    files: capabilityFileDescriptors,
    filesSingleMatch: true,
  });
  for (const descriptor of capabilityFileDescriptors.filter(
    ({ category }) => category === "domain-api" || category === "application-api",
  )) {
    for (const pattern of [descriptor.pattern].flat()) {
      const entries = globSync(pattern, { cwd: root });
      assert.ok(entries.length > 0, `Missing published policy entry: ${pattern}`);
      for (const file of entries) {
        assert.deepEqual(
          matcher.describeFile(resolve(root, file)).categories,
          [descriptor.category],
          file,
        );
      }
    }
  }
});

test("generic host primitives are classified as host adapters", () => {
  const matcher = new Elements({ rootPath: root }).getMatcher({
    elements: capabilityElements,
    files: capabilityFileDescriptors,
    filesSingleMatch: true,
  });
  const source = resolve(root, "packages/generic/host-primitives/src/atomic-write.ts");
  const owner = matcher.describeElement(source);
  assert.equal(owner.isUnknown, false);
  assert.equal(owner.captured.strategy, "generic");
  assert.deepEqual(matcher.describeFile(source).categories, ["adapter"]);
});

test("self-update adapters use the public generic host entry point", async () => {
  const filePath =
    "packages/supporting/cli-maintenance/src/self-update/adapters/native/install-meta/install-meta.ts";
  const [publicImport] = await eslint.lintText(
    'import { writeFileAtomic } from "@agentxm/host-primitives"; export { writeFileAtomic };',
    { filePath },
  );
  assert.equal(publicImport.fatalErrorCount, 0, JSON.stringify(publicImport.messages));
  assert.deepEqual(
    publicImport.messages.filter(({ ruleId }) => ruleId?.startsWith("boundaries/")),
    [],
  );
  const [privateImport] = await eslint.lintText(
    'import { writeFileAtomic } from "../../../../../../../generic/host-primitives/src/atomic-write.js"; export { writeFileAtomic };',
    { filePath },
  );
  assert.ok(privateImport.messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"));
});

for (const [name, code, rule] of [
  [
    "the composed root config rejects filesystem barrel imports in published policy",
    'import { FileSystem } from "effect"; export { FileSystem };',
    "no-restricted-imports",
  ],
  [
    "the composed root config rejects filesystem subpaths in published policy",
    'import * as FileSystem from "effect/FileSystem"; export { FileSystem };',
    "boundaries/dependencies",
  ],
  [
    "the composed root config rejects provider imports in published policy",
    'import * as HttpClient from "effect/unstable/http/HttpClient"; export { HttpClient };',
    "boundaries/dependencies",
  ],
  [
    "the composed root config rejects Node access in published policy",
    'import { readFile } from "node:fs/promises"; export { readFile };',
    "boundaries/dependencies",
  ],
  [
    "the composed root config rejects ambient HTTP access in published policy",
    'export const request = () => fetch("https://example.invalid");',
    "no-restricted-globals",
  ],
]) {
  test(name, async () => {
    const [result] = await eslint.lintText(code, { filePath: domainFile });
    assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
    assert.ok(
      result.messages.some(({ ruleId }) => ruleId === rule),
      JSON.stringify(result.messages),
    );
  });
}

test("the composed root config permits a pure Effect algorithm in a published domain API", async () => {
  const [result] = await eslint.lintText(
    'import * as Option from "effect/Option"; export const absent = Option.none();',
    { filePath: domainFile },
  );
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.deepEqual(
    result.messages.filter(({ ruleId }) => ruleId?.startsWith("boundaries/")),
    [],
  );
});

test("workspace aliases resolve to the published source condition without a build prerequisite", () => {
  const resolver = createTypeScriptImportResolver({
    project: [],
    conditionNames: ["axm-source", "import", "node", "default"],
  });
  const result = resolver.resolve(
    "@agentxm/extension-model/unstable/version-constraints/version-selection",
    resolve(root, "packages/core/registry-protocol/src/unstable/registry/schema.ts"),
  );
  assert.equal(result.found, true);
  assert.equal(result.path, resolve(root, domainFile));
});

test("official-skill domain policy cannot acquire candidate bytes", async () => {
  const [result] = await eslint.lintText(
    'import * as FileSystem from "effect/FileSystem"; export { FileSystem };',
    { filePath: "packages/supporting/cli-maintenance/src/official-skill/domain/policy.ts" },
  );
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.ok(result.messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"));
});

test("official-skill application cannot select its concrete CLI-version binding", async () => {
  const [result] = await eslint.lintText(
    'export { makeAxmSkillCompatibilityPolicyLayer } from "../composition/index.js";',
    { filePath: "packages/supporting/cli-maintenance/src/official-skill/application/index.ts" },
  );
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.ok(result.messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"));
});

test("official-skill domain cannot construct recovery through the CLI adapter", async () => {
  const [result] = await eslint.lintText(
    'export { renderAxmSkillRecovery } from "../adapters/cli/index.js";',
    { filePath: "packages/supporting/cli-maintenance/src/official-skill/domain/policy.ts" },
  );
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.ok(result.messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"));
});

test("self-update policy cannot acquire installation facts from the filesystem", async () => {
  const [result] = await eslint.lintText(
    'import * as FileSystem from "effect/FileSystem"; export { FileSystem };',
    { filePath: "packages/supporting/cli-maintenance/src/self-update/domain/policy.ts" },
  );
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.ok(result.messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"));
});

for (const role of ["domain", "application"]) {
  test(`self-update ${role} cannot select a native adapter after package consolidation`, async () => {
    const [result] = await eslint.lintText(
      'import { InstallMeta } from "../adapters/native/index.js"; export const storage = InstallMeta;',
      {
        filePath: `packages/supporting/cli-maintenance/src/self-update/${role}/index.ts`,
      },
    );
    assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
    assert.ok(
      result.messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"),
      JSON.stringify(result.messages),
    );
  });
}

test("backstage compatibility policy cannot depend on the frontstage upgrade decision", async () => {
  const [result] = await eslint.lintText(
    'export { decideUpgrade } from "../../self-update/domain/index.js";',
    { filePath: "packages/supporting/cli-maintenance/src/official-skill/domain/policy.ts" },
  );
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.ok(result.messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"));
});

for (const [name, code] of [
  ["host process access", 'import * as process from "node:process"; export { process };'],
  [
    "HTTP access",
    'import * as HttpClient from "effect/unstable/http/HttpClient"; export { HttpClient };',
  ],
  [
    "the concrete release adapter",
    'export { makeCliReleaseCatalog } from "../adapters/releases/index.js";',
  ],
  ["the CLI assessment adapter", 'export { toUpgradeAssessment } from "../adapters/cli/index.js";'],
]) {
  test(`self-update application cannot select ${name}`, async () => {
    const [result] = await eslint.lintText(code, {
      filePath: "packages/supporting/cli-maintenance/src/self-update/application/index.ts",
    });
    assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
    assert.ok(result.messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"));
  });
}

test("startup update policy cannot read its cache through a filesystem service", async () => {
  const [result] = await eslint.lintText(
    'import * as FileSystem from "effect/FileSystem"; export { FileSystem };',
    { filePath: "packages/supporting/cli-maintenance/src/self-update/domain/startup-check.ts" },
  );
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.ok(result.messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"));
});

test("script verification policy cannot invoke executable replacement", async () => {
  const [result] = await eslint.lintText(
    'import { ScriptExecutableInstaller } from "../application/index.js"; export const installer = ScriptExecutableInstaller;',
    {
      filePath: "packages/supporting/cli-maintenance/src/self-update/domain/script-verification.ts",
    },
  );
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.ok(result.messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"));
});

test("script upgrade application cannot replace files directly", async () => {
  const [result] = await eslint.lintText(
    'import * as FileSystem from "effect/FileSystem"; export { FileSystem };',
    {
      filePath:
        "packages/supporting/cli-maintenance/src/self-update/application/apply-script-upgrade.ts",
    },
  );
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.ok(result.messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"));
});

test("startup orchestration cannot select the release HTTP adapter", async () => {
  const [result] = await eslint.lintText(
    'export { makeStableChannelCheck } from "../adapters/channel-check/index.js";',
    {
      filePath: "packages/supporting/cli-maintenance/src/self-update/application/startup-check.ts",
    },
  );
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.ok(result.messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"));
});
