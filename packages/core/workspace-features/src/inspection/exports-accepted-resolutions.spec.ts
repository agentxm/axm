import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import { Spec, Validation } from "@cyclonedx/cyclonedx-library";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  computePackManifestContentIdentity,
  LockfileSchema,
  PackLockEntrySchema,
  SkillLockEntrySchema,
  type Lockfile,
} from "@agentxm/workspace-kernel/workspace-state";
import { exportAcceptedResolutions } from "./index.js";

export const specification = defineSpecification({
  requirement: "workspace/lock/export-accepted-resolutions",
  title: "Lock export describes accepted external resolutions without enrichment",
  statement:
    "AXM shall export strictly accepted external resolutions as deterministic CycloneDX JSON with exact source identities, recorded integrity, known Pack relationships and explicit incomplete coverage, without resolving sources or mutating workspace state.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  boundary: "memory",
  boundaryRationale:
    "The production serializer consumes decoded accepted resolutions without filesystem or network services; schema validation checks standard interoperability.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const skill = (registry: string) =>
  Schema.decodeUnknownSync(SkillLockEntrySchema)({
    source: { type: "registry", url: registry },
    identity: { owner: "@acme", name: "review" },
    resolved: {
      version: "1.0.0",
      integrity: `sha512-${"A".repeat(86)}==`,
      publisherBindingId: "publisher-1",
    },
    treeIntegrity: `sha256-tree-v2:${"1".repeat(64)}`,
  });

const componentSchema = Schema.Struct({
  "bom-ref": Schema.String,
  name: Schema.String,
  purl: Schema.optionalKey(Schema.String),
  hashes: Schema.optionalKey(
    Schema.Array(Schema.Struct({ alg: Schema.String, content: Schema.String })),
  ),
  properties: Schema.optionalKey(
    Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.String })),
  ),
});
const decode = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      bomFormat: Schema.Literal("CycloneDX"),
      specVersion: Schema.Literal("1.6"),
      components: Schema.optionalKey(Schema.Array(componentSchema)),
      dependencies: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({
            ref: Schema.String,
            dependsOn: Schema.optionalKey(Schema.Array(Schema.String)),
          }),
        ),
      ),
      compositions: Schema.Array(Schema.Struct({ aggregate: Schema.Literal("incomplete") })),
    }),
  ),
);

describe("Accepted-resolution SBOM", () => {
  it.effect(
    "preserves distinct authorities, actual archive hash bytes and standard schema validity",
    () =>
      Effect.gen(function* () {
        const lock: Lockfile = {
          lockfileVersion: 1,
          skills: { first: skill("https://one.example"), second: skill("https://two.example") },
        };
        const output = yield* exportAcceptedResolutions(lock);
        const parsed = decode(output);
        expect(parsed.components).toHaveLength(2);
        expect(new Set(parsed.components?.map((component) => component["bom-ref"])).size).toBe(2);
        expect(new Set(parsed.components?.map((component) => component.purl)).size).toBe(2);
        for (const component of parsed.components ?? [])
          expect(component.hashes).toEqual([{ alg: "SHA-512", content: "0".repeat(128) }]);
        const validator = new Validation.JsonStrictValidator(Spec.Version.v1dot6);
        expect(yield* Effect.promise(() => validator.validate(output))).toBeNull();
        expect(output).not.toContain("timestamp");
        expect(output).not.toContain("serialNumber");
        expect(
          yield* exportAcceptedResolutions({
            ...lock,
            skills: { second: skill("https://two.example"), first: skill("https://one.example") },
          }),
        ).toBe(output);
      }),
  );

  it.effect("exports a valid empty lock without manufacturing a root or dependencies", () =>
    Effect.gen(function* () {
      const output = yield* exportAcceptedResolutions({ lockfileVersion: 1, skills: {} });
      expect(decode(output).components ?? []).toEqual([]);
      expect(
        yield* Effect.promise(() =>
          new Validation.JsonStrictValidator(Spec.Version.v1dot6).validate(output),
        ),
      ).toBeNull();
    }),
  );

  it.effect(
    "joins Pack members by accepted source authority and marks unavailable relationships",
    () =>
      Effect.gen(function* () {
        const dependencies = { "@acme/skills/review": "^1.0.0", "@acme/rules/missing": "*" };
        const pack = Schema.decodeUnknownSync(PackLockEntrySchema)({
          source: { type: "registry", url: "https://one.example" },
          identity: { owner: "@acme", name: "toolkit" },
          resolved: {
            version: "1.0.0",
            integrity: `sha512-${"A".repeat(86)}==`,
            publisherBindingId: "publisher-1",
          },
          treeIntegrity: `sha256-tree-v2:${"2".repeat(64)}`,
          manifestVersion: "1.0.0",
          dependencies,
          manifestContentIdentity: computePackManifestContentIdentity({
            owner: "@acme",
            type: "pack",
            name: "toolkit",
            version: "1.0.0",
            dependencies,
          }),
        });
        const output = yield* exportAcceptedResolutions({
          lockfileVersion: 1,
          skills: { first: skill("https://one.example"), other: skill("https://two.example") },
          packs: { toolkit: pack },
        });
        const parsed = decode(output);
        const parent = parsed.components?.find(
          (component) => component.name === "@acme/packs/toolkit",
        );
        const member = parsed.components?.find(
          (component) =>
            component.name === "@acme/skills/review" && component.purl?.includes("one.example"),
        );
        expect(parent).toBeDefined();
        expect(member).toBeDefined();
        expect(
          parsed.dependencies?.find((edge) => edge.ref === parent?.["bom-ref"])?.dependsOn,
        ).toEqual([member?.["bom-ref"]]);
        expect(
          parent?.properties?.filter((property) => property.name === "axm:unresolved-dependency"),
        ).toEqual([
          {
            name: "axm:unresolved-dependency",
            value: JSON.stringify({ name: "@acme/rules/missing", range: "*" }),
          },
        ]);
        expect(
          yield* Effect.promise(() =>
            new Validation.JsonStrictValidator(Spec.Version.v1dot6).validate(output),
          ),
        ).toBeNull();
      }),
  );

  it.effect(
    "retains two selections inside one Git package without treating object ids as archive hashes",
    () =>
      Effect.gen(function* () {
        const selected = (name: string) =>
          Schema.decodeUnknownSync(SkillLockEntrySchema)({
            source: {
              type: "git",
              url: "https://github.com/acme/plugins.git",
              path: `plugins/review/skills/${name}`,
              revision: "main",
              distribution: {
                format: "claude",
                packageRoot: "plugins/review",
                componentPath: `skills/${name}`,
                manifestPath: ".claude-plugin/plugin.json",
              },
            },
            identity: { name },
            resolved: { commit: "1".repeat(40), tree: "2".repeat(40) },
            treeIntegrity: `sha256-tree-v2:${"3".repeat(64)}`,
          });
        const output = yield* exportAcceptedResolutions({
          lockfileVersion: 1,
          skills: { "local-alias": selected("first"), "another-alias": selected("second") },
        });
        const parsed = decode(output);
        expect(parsed.components).toHaveLength(1);
        expect(parsed.components?.[0]?.hashes).toBeUndefined();
        expect(
          parsed.components?.[0]?.properties?.filter(
            (property) => property.name === "axm:selection",
          ),
        ).toHaveLength(2);
        expect(parsed.components?.[0]?.properties).toContainEqual({
          name: "axm:git-tree",
          value: "2".repeat(40),
        });
        expect(output).not.toContain("local-alias");
        expect(output).not.toContain("another-alias");
      }),
  );

  it.effect("ignores projection currency and arbitrary tool data", () =>
    Effect.gen(function* () {
      const base: Lockfile = {
        lockfileVersion: 1,
        skills: { review: skill("https://one.example") },
      };
      const stored = Schema.encodeSync(LockfileSchema)(base);
      const bookkeeping = Schema.decodeUnknownSync(LockfileSchema)({
        ...stored,
        tool: { example: { token: "must-not-export" } },
        projections: { rules: { contract: 1, units: {} } },
      });
      expect(yield* exportAcceptedResolutions(bookkeeping)).toBe(
        yield* exportAcceptedResolutions(base),
      );
    }),
  );

  for (const sourceType of ["git", "path"] as const) {
    for (const ambiguous of [false, true]) {
      it.effect(
        `${sourceType} Pack inheritance ${ambiguous ? "leaves ambiguous members unresolved" : "joins only within the recorded source root"}`,
        () =>
          Effect.gen(function* () {
            const tree = `sha256-tree-v2:${"5".repeat(64)}`;
            const source = (path: string) =>
              sourceType === "git"
                ? { type: "git", url: "https://example.test/extensions.git", path }
                : { type: "path", path };
            const resolved =
              sourceType === "git" ? { commit: "a".repeat(40), tree: "b".repeat(40) } : { tree };
            const member = (path: string) =>
              Schema.decodeUnknownSync(SkillLockEntrySchema)({
                source: source(path),
                identity: { owner: "@acme", name: "review" },
                resolved,
                treeIntegrity: tree,
              });
            const dependencies = { "@acme/skills/review": "*" };
            const pack = Schema.decodeUnknownSync(PackLockEntrySchema)({
              source: source("vendor/pack"),
              sourceRoot: "vendor",
              identity: { owner: "@acme", name: "toolkit" },
              resolved,
              treeIntegrity: tree,
              manifestVersion: "1.0.0",
              dependencies,
              manifestContentIdentity: computePackManifestContentIdentity({
                owner: "@acme",
                type: "pack",
                name: "toolkit",
                version: "1.0.0",
                dependencies,
              }),
            });
            const parsed = decode(
              yield* exportAcceptedResolutions({
                lockfileVersion: 1,
                packs: { toolkit: pack },
                skills: {
                  selected: member("vendor/review"),
                  other: member(ambiguous ? "vendor/another-review" : "vendor-other/review"),
                },
              }),
            );
            const parent = parsed.components?.find(
              (component) => component.name === "@acme/packs/toolkit",
            );
            const selected = parsed.components?.find(
              (component) =>
                component.name === "@acme/skills/review" &&
                component.properties?.some(
                  (property) =>
                    property.name === "axm:source" &&
                    property.value.includes('"path":"vendor/review"'),
                ),
            );
            expect(selected).toBeDefined();
            expect(parent).toBeDefined();
            const edges =
              parsed.dependencies?.find((entry) => entry.ref === parent?.["bom-ref"])?.dependsOn ??
              [];
            expect(edges).toEqual(ambiguous ? [] : [selected?.["bom-ref"]]);
            expect(
              parent?.properties?.some((property) => property.name === "axm:unresolved-dependency"),
            ).toBe(ambiguous);
          }),
      );
    }
  }

  it.effect("redacts absolute locations while preserving distinct local package identities", () =>
    Effect.gen(function* () {
      const local = (path: string) =>
        Schema.decodeUnknownSync(SkillLockEntrySchema)({
          source: { type: "path", path },
          identity: { name: "review" },
          resolved: { tree: `sha256-tree-v2:${"1".repeat(64)}` },
          treeIntegrity: `sha256-tree-v2:${"1".repeat(64)}`,
        });
      const lock: Lockfile = {
        lockfileVersion: 1,
        skills: {
          first: local("/private/workspace/review"),
          second: local("/private/other/review"),
        },
      };
      const output = yield* exportAcceptedResolutions(lock);
      const parsed = decode(output);
      expect(parsed.components).toHaveLength(2);
      expect(new Set(parsed.components?.map((component) => component["bom-ref"])).size).toBe(2);
      expect(output).not.toContain("/private/");
      for (const component of parsed.components ?? [])
        expect(
          component.properties?.some(
            (property) => property.name === "axm:source-location-redacted",
          ),
        ).toBe(true);
      expect(
        yield* exportAcceptedResolutions({
          ...lock,
          skills: {
            second: local("/private/other/review"),
            first: local("/private/workspace/review"),
          },
        }),
      ).toBe(output);
      expect(
        yield* Effect.promise(() =>
          new Validation.JsonStrictValidator(Spec.Version.v1dot6).validate(output),
        ),
      ).toBeNull();
    }),
  );

  it.effect("redacts file Registry authorities without inventing portable PURLs", () =>
    Effect.gen(function* () {
      const output = yield* exportAcceptedResolutions({
        lockfileVersion: 1,
        skills: {
          first: skill("file:///private/first-registry"),
          second: skill("file:///private/second-registry"),
        },
      });
      const parsed = decode(output);
      expect(parsed.components).toHaveLength(2);
      expect(new Set(parsed.components?.map((component) => component["bom-ref"])).size).toBe(2);
      expect(output).not.toContain("/private/");
      for (const component of parsed.components ?? []) {
        expect(component.purl).toBeUndefined();
        expect(component.hashes).toEqual([{ alg: "SHA-512", content: "0".repeat(128) }]);
      }
    }),
  );
  it.effect("preserves exact HTTP archive bytes separately from the materialized tree", () =>
    Effect.gen(function* () {
      const entry = Schema.decodeUnknownSync(SkillLockEntrySchema)({
        source: {
          type: "http",
          url: "https://example.test/review.zip",
          kind: "archive",
          path: ".",
          portable: true,
        },
        identity: { name: "review" },
        resolved: {
          format: "zip",
          url: "https://example.test/review.zip",
          digest: `sha256:${"a".repeat(64)}`,
        },
        treeIntegrity: `sha256-tree-v2:${"b".repeat(64)}`,
      });
      const output = yield* exportAcceptedResolutions({
        lockfileVersion: 1,
        skills: { review: entry },
      });
      const component = decode(output).components?.[0];
      expect(component?.hashes).toEqual([{ alg: "SHA-256", content: "a".repeat(64) }]);
      expect(component?.properties).toContainEqual({
        name: "axm:tree-integrity",
        value: `sha256-tree-v2:${"b".repeat(64)}`,
      });
      expect(component?.purl).toBeUndefined();
      expect(
        yield* Effect.promise(() =>
          new Validation.JsonStrictValidator(Spec.Version.v1dot6).validate(output),
        ),
      ).toBeNull();
    }),
  );

  for (const suffix of ["?token=private-value", "#private-value"]) {
    it.effect(
      `refuses a credential-bearing HTTP locator with ${suffix.startsWith("?") ? "query parameters" : "a fragment"}`,
      () =>
        Effect.gen(function* () {
          const entry = Schema.decodeUnknownSync(SkillLockEntrySchema)({
            source: {
              type: "http",
              url: `https://example.test/review.zip${suffix}`,
              kind: "archive",
              path: ".",
              portable: true,
            },
            identity: { name: "review" },
            resolved: {
              format: "zip",
              url: `https://example.test/review.zip${suffix}`,
              digest: `sha256:${"a".repeat(64)}`,
            },
            treeIntegrity: `sha256-tree-v2:${"b".repeat(64)}`,
          });
          const result = yield* Effect.result(
            exportAcceptedResolutions({ lockfileVersion: 1, skills: { review: entry } }),
          );
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result))
            expect(JSON.stringify(result.failure)).not.toContain("private-value");
        }),
    );
  }
});
