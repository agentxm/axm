import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Schema from "effect/Schema";
import { LockfileSchema, computePackManifestContentIdentity } from "../../index.js";

export const specification = defineSpecification({
  requirement: "workspace/lockfile/refuses-ambiguous-declarations",
  title: "Accepted lockfile declarations cannot disappear through key collisions",
  statement:
    "AXM shall reject duplicate dependency names within a retained Pack and invalid local binding names before normalization. Every accepted binding and projection unit shall remain an own entry through decoding and encoding, including valid names that coincide with JavaScript prototype properties.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decode = Schema.decodeUnknownSync(LockfileSchema);
const encode = Schema.encodeSync(LockfileSchema);
const archive = `sha512-${"A".repeat(86)}==`;
const tree = `sha256-tree-v2:${"0".repeat(64)}`;
const declaration = (range: string) => ({
  "manifest-version": "1.0.0",
  "manifest-identity": computePackManifestContentIdentity({
    owner: "@acme",
    type: "pack",
    name: "review",
    version: "1.0.0",
    dependencies: { "@acme/skills/review": range },
  }),
  dependencies: [{ name: "@acme/skills/review", range }],
});
const document = (kind: string, alias: string) => {
  const id = `registry.example.com/@acme/${kind}/review`;
  return {
    version: 1,
    package: [
      {
        id,
        source: { registry: "https://registry.example.com" },
        version: "1.0.0",
        archive,
        publisher: "hbnd_example",
        tree,
        ...(kind === "packs" ? declaration("^2.0.0") : {}),
      },
    ],
    [kind]: { [alias]: { package: id, name: `@acme/${kind}/review` } },
  };
};

describe("unambiguous lockfile declarations", () => {
  it("allows the same dependency name in separate retained Packs", () => {
    const first = document("packs", "first");
    const secondId = "other.example.com/@acme/packs/review";
    const original = {
      version: 1,
      package: [
        ...first.package,
        ...first.package.map((record) => ({
          ...record,
          id: secondId,
          source: { registry: "https://other.example.com" },
        })),
      ],
      packs: {
        first: { package: "registry.example.com/@acme/packs/review", name: "@acme/packs/review" },
        second: { package: secondId, name: "@acme/packs/review" },
      },
    };
    const encoded = encode(decode(original));
    expect(encoded.package).toHaveLength(2);
    for (const record of encoded.package ?? [])
      expect(record).toMatchObject({ dependencies: declaration("^2.0.0").dependencies });
  });

  it.each(["^1.0.0", "^2.0.0"])("rejects a duplicate even when the first range is %s", (range) => {
    const original = document("packs", "review");
    expect(() =>
      decode({
        ...original,
        package: original.package.map((record) => ({
          ...record,
          dependencies: [
            { name: "@acme/skills/review", range },
            ...declaration("^2.0.0").dependencies,
          ],
        })),
      }),
    ).toThrow(/Duplicate dependency.*first declared at dependencies\[0\]\.name/u);
  });

  for (const kind of ["skills", "subagents", "rules", "hooks", "knowledge", "packs"]) {
    it.each(["__proto__", "", "Bad", "bad_name", "-bad", "bad-", "bad\n", "a".repeat(65)])(
      `rejects invalid ${kind} alias %j`,
      (alias) => {
        expect(() => decode(document(kind, alias), { onExcessProperty: "error" })).toThrow();
      },
    );
    it(`retains a constructor alias in ${kind}`, () => {
      const original = document(kind, "constructor");
      expect(encode(decode(original))).toEqual(original);
    });
  }

  it("also refuses invalid aliases supplied through the joined view", () => {
    const view = decode(document("skills", "review"));
    expect(() =>
      Schema.encodeUnknownSync(LockfileSchema, { onExcessProperty: "error" })({
        ...view,
        skills: Object.fromEntries([["__proto__", view.skills["review"]]]),
      }),
    ).toThrow();
  });

  it("preserves prototype-named projection paths as own rows", () => {
    const row = { output: `sha256:${"a".repeat(64)}` };
    const original = {
      version: 1,
      projections: {
        rules: {
          contract: 1,
          units: Object.fromEntries([
            ["__proto__", row],
            ["constructor", row],
          ]),
        },
      },
    };
    const encoded = encode(decode(original));
    expect(encoded).toEqual(original);
    expect(Object.hasOwn(encoded.projections?.rules?.units ?? {}, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });
});
