import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  ProjectionDigestSchema,
  ProjectionUnitPathSchema,
  type Projections,
} from "../workspace-state/index.js";
import { projectionOutputDigest } from "./generation.js";
import {
  observeProjectionOutput,
  projectionOutputUnits,
  type ProjectionOutputUnit,
} from "./projection-output-observation.js";

const unitPath = (value: string) => ProjectionUnitPathSchema.make(value);
const row = (digest: string) => ({ output: ProjectionDigestSchema.make(`sha256:${digest}`) });

const projections: Projections = {
  rules: {
    contract: 1,
    units: {
      [unitPath("AGENTS.md")]: row(
        "729bdb50305fd5065521069fe546b44e333d179dc27b4262097f7cb94f99863a",
      ),
      [unitPath("OLD.md")]: row("2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881"),
    },
  },
  knowledge: {
    contract: 1,
    units: {
      [unitPath("AGENTS.md")]: row(
        "dc3a09947f850662555e322be56953637eb965f16d61eecaabbf06f450f2d399",
      ),
    },
  },
  instructions: {
    contract: 1,
    units: {
      [unitPath("CLAUDE.md")]: row(
        "78b2119065eebb2a0306bce4244e4990707e525589f7a3337bd19555fc350944",
      ),
      [unitPath(".gitignore")]: row(
        "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881",
      ),
    },
  },
  subagents: {
    contract: 1,
    units: {
      [unitPath(".claude/agents/reviewer.md")]: row(
        "528bed45f21fc40ad60191a9d9525d067d537d0808f4b39f1eff2a374cfedbe3",
      ),
    },
  },
};

const makeUnit = (
  overrides: Partial<ProjectionOutputUnit> & Pick<ProjectionOutputUnit, "read">,
): ProjectionOutputUnit => ({
  kind: "rules",
  path: ProjectionUnitPathSchema.make("AGENTS.md"),
  recorded: ProjectionDigestSchema.make(
    "sha256:729bdb50305fd5065521069fe546b44e333d179dc27b4262097f7cb94f99863a",
  ),
  ...overrides,
});

describe("projectionOutputUnits", () => {
  it("lists every recorded unit with how its bytes are read back", () => {
    const units = projectionOutputUnits({
      projections,
      instructionTarget: Option.some("AGENTS.md"),
    });
    expect(units.map(({ kind, path, read }) => [kind, path, read])).toEqual([
      ["rules", "AGENTS.md", { _tag: "region", region: "rules" }],
      ["knowledge", "AGENTS.md", { _tag: "region", region: "knowledge" }],
      ["instructions", "CLAUDE.md", { _tag: "file" }],
      ["instructions", ".gitignore", { _tag: "region", region: "instruction-aliases" }],
      ["subagents", ".claude/agents/reviewer.md", { _tag: "file" }],
    ]);
  });

  it("skips region rows when no instruction target is planned", () => {
    const units = projectionOutputUnits({ projections, instructionTarget: Option.none() });
    expect(units.map(({ kind }) => kind)).toEqual(["instructions", "instructions", "subagents"]);
  });

  it("lists nothing without a projections section", () => {
    expect(
      projectionOutputUnits({ projections: undefined, instructionTarget: Option.none() }),
    ).toEqual([]);
  });
});

describe("observeProjectionOutput", () => {
  const withFile = (name: string, content: string, read: ProjectionOutputUnit["read"]) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(root, name), content);
      return yield* observeProjectionOutput({
        workspaceRoot: root,
        unit: makeUnit({ path: ProjectionUnitPathSchema.make(name), read }),
      });
    });

  it.effect("hashes a region through its body, so edits outside it never count", () =>
    Effect.gen(function* () {
      const observed = yield* withFile(
        "AGENTS.md",
        "Human prose.\n<!-- axm:rules -->\nRule body.\n<!-- /axm:rules -->\nMore prose.\n",
        { _tag: "region", region: "rules" },
      );
      expect(Option.map(observed, ({ observed, recorded }) => observed === recorded)).toEqual(
        Option.some(true),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("reports a different digest when the region body was edited", () =>
    Effect.gen(function* () {
      const observed = yield* withFile(
        "AGENTS.md",
        "<!-- axm:rules -->\nEdited.\n<!-- /axm:rules -->\n",
        { _tag: "region", region: "rules" },
      );
      expect(Option.map(observed, ({ observed }) => observed)).toEqual(
        Option.some(yield* projectionOutputDigest("Edited.\n")),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("hashes a whole file directly", () =>
    Effect.gen(function* () {
      const observed = yield* withFile("CLAUDE.md", "Whole file.\n", { _tag: "file" });
      expect(Option.map(observed, ({ observed }) => observed)).toEqual(
        Option.some(yield* projectionOutputDigest("Whole file.\n")),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("observes nothing for an absent file or region", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const missing = yield* observeProjectionOutput({
        workspaceRoot: root,
        unit: makeUnit({ read: { _tag: "file" } }),
      });
      expect(Option.isNone(missing)).toBe(true);
      const noRegion = yield* withFile("AGENTS.md", "Only prose.\n", {
        _tag: "region",
        region: "rules",
      });
      expect(Option.isNone(noRegion)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps a malformed region in the error channel with its region and problem", () =>
    Effect.gen(function* () {
      const failure = yield* withFile("AGENTS.md", "<!-- axm:rules -->\nbody\n", {
        _tag: "region",
        region: "rules",
      }).pipe(Effect.flip);
      expect(failure).toMatchObject({
        _tag: "ManagedRegionViolation",
        displayPath: "AGENTS.md",
        region: "rules",
        problem: "unpaired",
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps any other read failure in the error channel with the unit path", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      // A directory at the unit path cannot be read as a file.
      yield* fs.makeDirectory(path.join(root, "CLAUDE.md"));
      const failure = yield* observeProjectionOutput({
        workspaceRoot: root,
        unit: makeUnit({
          path: ProjectionUnitPathSchema.make("CLAUDE.md"),
          read: { _tag: "file" },
        }),
      }).pipe(Effect.flip);
      expect(failure).toMatchObject({
        _tag: "ProjectionIoFailed",
        path: "CLAUDE.md",
        step: "read",
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
