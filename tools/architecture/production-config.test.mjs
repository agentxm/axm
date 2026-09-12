import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { ESLint } from "eslint";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { createRequire } from "node:module";
import { capabilityElements, capabilityFileDescriptors } from "./config.mjs";

const root = resolve(import.meta.dirname, "../..");
const domainFile =
  "packages/core/extension-model/src/unstable/version-constraints/version-selection.ts";
const eslint = new ESLint({ cwd: root });
const { Elements } = createRequire(import.meta.url)("@boundaries/elements");

test("root configuration composes a tooling project without a package facade", async () => {
  const results = await eslint.lintFiles(["eslint.config.mjs"]);
  assert.deepEqual(
    results.flatMap(({ messages }) => messages),
    [],
  );
});

test("every published domain entry has a valid native file classification", () => {
  const matcher = new Elements({ rootPath: root }).getMatcher({
    elements: capabilityElements,
    files: capabilityFileDescriptors,
    filesSingleMatch: true,
  });
  for (const descriptor of capabilityFileDescriptors.filter(
    ({ category }) => category === "domain-api",
  )) {
    for (const path of [descriptor.pattern].flat()) {
      assert.deepEqual(matcher.describeFile(resolve(root, path)).categories, ["domain-api"], path);
    }
  }
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

test("backstage compatibility policy cannot depend on the frontstage upgrade decision", async () => {
  const [result] = await eslint.lintText(
    'export { decideUpgrade } from "../../self-update/domain/index.js";',
    { filePath: "packages/supporting/cli-maintenance/src/official-skill/domain/policy.ts" },
  );
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.ok(result.messages.some(({ ruleId }) => ruleId === "boundaries/dependencies"));
});
