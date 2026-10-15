import { createRequire } from "node:module";
import { Ajv } from "ajv";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  LockfileSchema,
  computePackManifestContentIdentity,
} from "@agentxm/workspace-kernel/workspace-state";

export const specification = defineSpecification({
  requirement: "settings-contract/published-lockfile-schema-agrees-with-accepted-input",
  title: "The published lockfile schema describes representable accepted-input constraints",
  statement:
    "The published lockfile JSON Schema shall agree with the CLI on supported version, required and forbidden fields, source-family structures, canonical identifier and digest patterns, binding names, and representable path constraints. Its descriptions shall distinguish CLI-only graph, domain-parser, and TOML-type validation; schema success alone shall not assert a valid accepted-resolution graph.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "trustworthy-distribution"],
  methods: ["contract", "example", "decision-table"],
  derivedFrom: ["settings-contract/published-schemas-agree-with-accepted-input"],
  supersedes: ["settings-contract/published-schemas-agree-with-accepted-input"],
  assumptions: [
    "The schema documents shipped as package site content are the same documents published at the public schema URLs that editors and automation fetch.",
  ],
  openQuestions: [],
});

const requireFromSpec = createRequire(import.meta.url);
const loaded: unknown = requireFromSpec(
  "../../site-content/__generated__/schemas/axm-lock.schema.json",
);
const published = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(loaded);
// Independent validator, no mutation/coercion and no reliance on Effect's validation result.
const validate = new Ajv({
  strict: false,
  allErrors: true,
  ownProperties: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
}).compile(published);
const decode = Schema.decodeUnknownResult(LockfileSchema, { onExcessProperty: "error" });
const tree = `sha256-tree-v2:${"0".repeat(64)}`;
const archive = `sha512-${"A".repeat(86)}==`;
const registryId = "registry.example.com/@acme/skills/review";
const registryRecord = {
  id: registryId,
  source: { registry: "https://registry.example.com" },
  version: "1.0.0",
  archive,
  publisher: "hbnd_example",
  tree,
};
const registryBinding = { package: registryId, name: "@acme/skills/review" };
const registry = { version: 1, package: [registryRecord], skills: { review: registryBinding } };
const gitId = "github.com/acme/review";
const gitRecord = {
  id: gitId,
  source: { git: "https://github.com/acme/review.git", path: ".", format: "native" },
  commit: "a".repeat(40),
  "git-tree": "b".repeat(40),
  tree,
};
const git = {
  version: 1,
  package: [gitRecord],
  skills: { review: { package: gitId, name: "review", spec: "main" } },
};
const httpId = "example.com/.well-known/agent-skills/index.json/review";
const artifactFile = {
  path: "SKILL.md",
  url: "https://example.com/review/SKILL.md",
  digest: `sha256:${"c".repeat(64)}`,
};
const httpRecord = {
  id: httpId,
  source: {
    http: "https://example.com/.well-known/agent-skills/index.json",
    kind: "index",
    entry: "review",
    path: ".",
    portable: true,
    format: "native",
  },
  artifact: { format: "files", files: [artifactFile] },
  tree,
};
const http = {
  version: 1,
  package: [httpRecord],
  skills: { review: { package: httpId, name: "review" } },
};
const packId = "registry.example.com/@acme/packs/tools";
const dependency = { name: "@acme/skills/review", range: "^1.0.0" };
const packRecord = {
  ...registryRecord,
  id: packId,
  "manifest-version": "1.0.0",
  "manifest-identity": computePackManifestContentIdentity({
    owner: "@acme",
    type: "pack",
    name: "tools",
    version: "1.0.0",
    dependencies: { "@acme/skills/review": "^1.0.0" },
  }),
  dependencies: [dependency],
};
const pack = {
  version: 1,
  package: [packRecord],
  packs: { tools: { package: packId, name: "@acme/packs/tools" } },
};
const aliasDocument = (kind: string, alias: string) => {
  if (kind === "packs") return { ...pack, packs: { [alias]: pack.packs.tools } };
  const id = `registry.example.com/@acme/${kind}/review`;
  return {
    version: 1,
    package: [{ ...registryRecord, id }],
    [kind]: { [alias]: { package: id, name: `@acme/${kind}/review` } },
  };
};
const without = (record: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
const projection = (path: string, output = `sha256:${"a".repeat(64)}`) => ({
  version: 1,
  projections: { rules: { contract: 1, units: { [path]: { output } } } },
});
const assertParity = (input: unknown, accepts: boolean) => {
  expect(validate(input), JSON.stringify(validate.errors)).toBe(accepts);
  expect(Result.isSuccess(decode(input))).toBe(accepts);
};

describe("published lockfile schema against an independent validator", () => {
  it.each([
    { name: "empty", document: { version: 1 } },
    { name: "Registry", document: registry },
    { name: "Git SHA-1", document: git },
    { name: "Pack", document: pack },
    { name: "HTTP files", document: http },
    {
      name: "Git SHA-256",
      document: {
        ...git,
        package: [{ ...gitRecord, commit: "a".repeat(64), "git-tree": "b".repeat(64) }],
      },
    },
    {
      name: "constructor binding",
      document: { ...registry, skills: { constructor: registryBinding } },
    },
    { name: "quoted projection path", document: projection('docs/"guide".md') },
    { name: "prototype-named projection", document: projection("__proto__") },
    {
      name: "tool namespace",
      document: { version: 1, tool: { example: { nested: [1, "two", {}] } } },
    },
  ])("accepts $name", ({ document }) => assertParity(document, true));

  it.each([
    {},
    { version: 0 },
    { version: 2 },
    { version: "1" },
    { version: 1, unknown: true },
    { version: 1, tool: [] },
    { version: 1, tool: { other: [] } },
  ])("refuses invalid root structure %j", (document) => assertParity(document, false));

  it.each(["id", "source", "version", "archive", "publisher", "tree"])(
    "requires Registry field %s",
    (field) => assertParity({ ...registry, package: [without(registryRecord, field)] }, false),
  );
  it.each(["source", "commit", "git-tree", "tree"])("requires Git field %s", (field) =>
    assertParity({ ...git, package: [without(gitRecord, field)] }, false),
  );
  it.each(["package", "name"])("requires binding field %s", (field) =>
    assertParity({ ...registry, skills: { review: without(registryBinding, field) } }, false),
  );

  it.each([
    { field: "tree", value: "not-a-digest" },
    { field: "tree", value: `${tree}\n` },
    { field: "archive", value: "" },
    { field: "archive", value: "sha512-short" },
    { field: "archive", value: `${archive} ${archive}` },
    { field: "archive", value: `${archive}\n` },
    { field: "archive", value: `sha512-${"A".repeat(85)}B==` },
    { field: "version", value: "^1.0.0" },
    { field: "commit", value: "a".repeat(40) },
    { field: "unknown", value: "extra" },
  ])("refuses invalid Registry $field=$value", ({ field, value }) =>
    assertParity({ ...registry, package: [{ ...registryRecord, [field]: value }] }, false),
  );

  it.each(["main", "HEAD", "abc123", "A".repeat(40), `${"a".repeat(40)}\n`])(
    "refuses noncanonical Git ID %s",
    (value) => {
      for (const field of ["commit", "git-tree"])
        assertParity({ ...git, package: [{ ...gitRecord, [field]: value }] }, false);
    },
  );
  it("refuses different Git object formats within one package", () =>
    assertParity({ ...git, package: [{ ...gitRecord, "git-tree": "b".repeat(64) }] }, false));

  for (const kind of ["skills", "subagents", "rules", "hooks", "knowledge", "packs"]) {
    it(`accepts a valid ${kind} alias`, () => assertParity(aliasDocument(kind, "review"), true));
    it.each(["__proto__", "Bad", "bad_name", "bad\n", "a".repeat(65)])(
      `refuses invalid ${kind} property name %j`,
      (alias) => assertParity(aliasDocument(kind, alias), false),
    );
  }
  it.each(["", "/absolute", "../escape", "a/../b", "a//b", "a\\b", "C:/drive"])(
    "refuses invalid projection path %j",
    (path) => assertParity(projection(path), false),
  );
  it("refuses malformed projection digests", () =>
    assertParity(projection("AGENTS.md", "sha256:short"), false));
  it.each(["", "/absolute", "../escape", "a/./b", "a/../b", "a//b", "a\\b", "C:/drive", "a\0b"])(
    "refuses invalid artifact path %j",
    (path) =>
      assertParity(
        {
          ...http,
          package: [
            {
              ...httpRecord,
              artifact: { ...httpRecord.artifact, files: [{ ...artifactFile, path }] },
            },
          ],
        },
        false,
      ),
  );
  it.each(["sha256:short", `sha256:${"A".repeat(64)}`, `${artifactFile.digest}\n`])(
    "refuses invalid artifact digest %j",
    (digest) =>
      assertParity(
        {
          ...http,
          package: [
            {
              ...httpRecord,
              artifact: { ...httpRecord.artifact, files: [{ ...artifactFile, digest }] },
            },
          ],
        },
        false,
      ),
  );
  it.each(["..", "a/../b", "a//b", "/a"])("refuses invalid source subpath %j", (path) =>
    assertParity(
      { ...git, package: [{ ...gitRecord, source: { ...gitRecord.source, path } }] },
      false,
    ),
  );

  it.each([
    {
      name: "dangling binding",
      document: { ...registry, skills: { review: { ...registryBinding, package: "absent" } } },
    },
    { name: "unbound package", document: { ...registry, skills: {} } },
    {
      name: "duplicate package ID",
      document: { ...registry, package: [registryRecord, registryRecord] },
    },
    {
      name: "recomputed retained ID",
      document: { ...git, package: [{ ...gitRecord, id: "github.com/acme/forged" }] },
    },
    {
      name: "binding identity kind",
      document: {
        ...registry,
        skills: { review: { ...registryBinding, name: "@acme/rules/review" } },
      },
    },
    {
      name: "spec on Registry binding",
      document: { ...registry, skills: { review: { ...registryBinding, spec: "main" } } },
    },
    {
      name: "duplicate dependency name",
      document: {
        ...pack,
        package: [
          { ...packRecord, dependencies: [dependency, { ...dependency, range: "^2.0.0" }] },
        ],
      },
    },
    {
      name: "Pack identity consistency",
      document: { ...pack, package: [{ ...packRecord, "manifest-identity": "different" }] },
    },
    ...["dependencies", "manifest-version", "manifest-identity"].map((field) => ({
      name: `Pack declaration missing ${field}`,
      document: { ...pack, package: [without(packRecord, field)] },
    })),
  ])("leaves $name to the CLI semantic boundary", ({ document }) => {
    expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
    expect(Result.isFailure(decode(document))).toBe(true);
  });
});
