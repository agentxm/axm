import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { SkillLockEntrySchema } from "../desired/lockfile/schema.js";
import { SettingsSchema } from "../desired/settings/schema.js";
import { captureDesiredStateInputs } from "./desired-state-reader.js";
import { ownDesiredStateEvaluation } from "./desired-state-snapshot.js";

export const specification = defineSpecification({
  requirement: "workspace/workspace-state/candidate-inputs-are-owned",
  title: "Candidate evaluations own their input evidence",
  statement:
    "A candidate evaluation shall own its settings, inherited bindings, accepted resolutions and proposed Pack documents; mutating caller inputs or returned input evidence shall not change an existing evaluation; capturing changed inputs shall produce the changed evaluation, including at the same proposed document path; decoded URL and extended BigInt and Date values shall retain their values and types.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "memory",
  boundaryRationale:
    "Production input collection and graph evaluation consume validated domain documents; ownership and proposal identity require no filesystem or transport.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const noManifests = {
  locate: () => {
    throw new Error("Explicit candidate documents must not read installed manifests");
  },
};

it.effect("isolates caller and returned mutations while preserving extended values", () =>
  Effect.gen(function* () {
    const settings = Schema.decodeUnknownSync(SettingsSchema)({
      skills: { review: "workspace" },
      tool: { integer: 9007199254740993n, instant: new Date("2026-01-01T00:00:00Z") },
    });
    const captured = yield* captureDesiredStateInputs({
      manifests: noManifests,
      baseDir: "/workspace",
      settings,
    });
    const evaluation = ownDesiredStateEvaluation(captured);
    Object.assign(settings.skills ?? {}, { review: { source: "./changed" } });
    Object.assign(evaluation.inputs.settings.skills ?? {}, { review: { source: "./returned" } });
    const exposed = evaluation.inputs.settings["tool"];
    if (!Predicate.isObject(exposed) || !(exposed["instant"] instanceof Date))
      throw new Error("Expected preserved Date input");
    exposed["instant"].setTime(0);
    expect(evaluation.inputs.settings).toMatchObject({
      skills: { review: { source: "workspace" } },
      tool: { integer: 9007199254740993n, instant: new Date("2026-01-01T00:00:00Z") },
    });
    expect(evaluation.graph.nodes.find((node) => node.name === "review")?.source).toBe("workspace");
    const changed = ownDesiredStateEvaluation({ ...captured, settings });
    expect(changed.graph.nodes.find((node) => node.name === "review")?.source).toBe("./changed");
  }),
);

it.effect("keeps distinct proposed contents at the same document path separate", () =>
  Effect.gen(function* () {
    const settings = Schema.decodeUnknownSync(SettingsSchema)({
      owner: "@acme",
      packs: { toolkit: "workspace" },
    });
    const manifest = Schema.decodeUnknownSync(PackManifestSchema)({
      owner: "@acme",
      type: "pack",
      name: "toolkit",
      version: "1.0.0",
      dependencies: { "@acme/skills/review": "^1.0.0" },
    });
    const proposal = {
      acquire: () => Effect.void,
      owner: manifest.owner,
      version: manifest.version,
      pack: { name: manifest.name, dependencies: manifest.dependencies },
    };
    const collect = () =>
      captureDesiredStateInputs({
        manifests: noManifests,
        baseDir: "/workspace",
        settings,
        prospectivePacks: [proposal],
      });
    const first = ownDesiredStateEvaluation(yield* collect());
    expect(first.inputs.packDocuments[0]?.provenance).not.toHaveProperty("ref.acquire");
    Object.assign(proposal.pack.dependencies, { "@acme/skills/second": "^1.0.0" });
    const second = ownDesiredStateEvaluation(yield* collect());
    expect(first.inputs.packDocuments[0]?.path).toBe(second.inputs.packDocuments[0]?.path);
    expect(first.graph.nodes.some((node) => node.name === "second")).toBe(false);
    expect(second.graph.nodes.some((node) => node.name === "second")).toBe(true);
    expect(first.inputs.packDocuments).not.toEqual(second.inputs.packDocuments);
  }),
);

for (const sourceType of ["git", "http", "http-files"] as const) {
  it.effect(`owns decoded ${sourceType} URLs without losing their domain type`, () =>
    Effect.gen(function* () {
      const href = "https://example.test/review";
      const entry = Schema.decodeUnknownSync(SkillLockEntrySchema)({
        source:
          sourceType === "git"
            ? { type: "git", url: href }
            : { type: "http", url: href, kind: "archive", path: ".", portable: true },
        identity: { name: "review" },
        resolved:
          sourceType === "git"
            ? { commit: "a".repeat(40), tree: "b".repeat(40) }
            : sourceType === "http-files"
              ? {
                  format: "files",
                  files: [{ path: "SKILL.md", url: href, digest: `sha256:${"a".repeat(64)}` }],
                }
              : { format: "zip", url: href, digest: `sha256:${"a".repeat(64)}` },
        treeIntegrity: `sha256-tree-v2:${"0".repeat(64)}`,
      });
      const captured = yield* captureDesiredStateInputs({
        manifests: noManifests,
        baseDir: "/workspace",
        settings: {},
        acceptedResolutions: { lockfileVersion: 1, skills: { review: entry } },
      });
      const evaluation = ownDesiredStateEvaluation(captured);
      if (!("url" in entry.source) || !(entry.source.url instanceof URL))
        throw new Error("Expected decoded source URL");
      entry.source.url.pathname = "/caller-change";
      const exposed = evaluation.inputs.acceptedResolutions.skills["review"]?.source;
      if (exposed === undefined || !("url" in exposed) || !(exposed.url instanceof URL))
        throw new Error("Expected an independently owned URL");
      expect(exposed.url.href).toBe(href);
      exposed.url.pathname = "/consumer-change";
      const next = evaluation.inputs.acceptedResolutions.skills["review"]?.source;
      expect(next).toMatchObject({ url: new URL(href) });
      if ("files" in entry.resolved) {
        const first = entry.resolved.files[0];
        if (first === undefined) throw new Error("Expected retained artifact");
        first.url.pathname = "/caller-artifact-change";
        const exposed = evaluation.inputs.acceptedResolutions.skills["review"]?.resolved;
        if (exposed === undefined || !("files" in exposed) || exposed.files[0] === undefined)
          throw new Error("Expected owned artifact inventory");
        exposed.files[0].url.pathname = "/consumer-artifact-change";
        expect(evaluation.inputs.acceptedResolutions.skills["review"]?.resolved).toMatchObject({
          files: [{ path: "SKILL.md", url: new URL(href) }],
        });
      }
      if ("url" in entry.resolved && entry.resolved.url instanceof URL) {
        entry.resolved.url.pathname = "/artifact-change";
        expect(evaluation.inputs.acceptedResolutions.skills["review"]?.resolved).toMatchObject({
          url: new URL(href),
        });
      }
    }),
  );
}
