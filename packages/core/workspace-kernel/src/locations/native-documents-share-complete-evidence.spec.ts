import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  createNativeLocationTable,
  NativeLocationRecordSchema,
  NativeReaderDeclarationSchema,
  type NativeLocationOutcome,
} from "./index.js";

export const specification = defineSpecification({
  requirement: "workspace/native-documents/share-complete-evidence",
  title: "Native documents share complete evidence with explicit availability applicability",
  statement:
    "A native result document shall represent each identical evidence record and ordered reader declaration once through resolvable result-local references, distinguish conflicting observations and operation phases at the same address, and preserve declared readers, configured consumers, policy, ownership proof, mechanism, state, and explicit availability observations while expressing a shared unverified declaration once with its exact reason and applicability. Actual observations and exceptions shall remain attached to their native evidence record.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const location: NativeLocationOutcome = {
  scope: "project",
  address: { kind: "key-path", path: "/workspace/.config.json", keys: ["mcpServers", "a/b.c"] },
  aliases: ["/workspace/.alias.json"],
  configuredConsumers: ["claude", "codex", "unsupported"],
  potentialReaders: ["claude", "codex", "cursor"],
  policyReasons: ["shared-container"],
  ownership: "owned",
  proof: "accepted-value",
  mechanism: "structured-entry",
  state: "unchanged",
  availability: [
    { agentId: "claude", state: "unverified", reason: "Declared reader; runtime not inspected." },
    { agentId: "codex", state: "unverified", reason: "Declared reader; runtime not inspected." },
    { agentId: "cursor", state: "verified", reason: "Native value observed." },
    { agentId: "unsupported", state: "unavailable", reason: "No native capability." },
  ],
};

describe("Native result evidence", () => {
  it("shares a single-reader non-observation across different physical locations", () => {
    const native = createNativeLocationTable();
    const single = {
      ...location,
      potentialReaders: ["claude"],
      availability: [
        { agentId: "claude", state: "unverified" as const, reason: "Runtime was not checked." },
      ],
    };
    native.add(
      [single, { ...single, address: { kind: "file", path: "/workspace/other.json" } }],
      "observation",
    );
    expect(native.readerDeclarations()).toEqual([
      {
        id: "readers-1",
        potentialReaders: ["claude"],
        availabilityDefault: {
          state: "unverified",
          appliesTo: "potential-readers",
          reason: "Runtime was not checked.",
        },
      },
    ]);
    expect(native.records()).toHaveLength(2);
    expect(
      native
        .records()
        .every(
          (record) =>
            record.readerDeclarationRef === "readers-1" &&
            record.availability.observations.length === 0,
        ),
    ).toBe(true);
  });

  it("shares exact records while retaining direct subject references and consequential facts", () => {
    const original = JSON.stringify(location);
    const native = createNativeLocationTable();
    const first = native.add([location, location], "observation");
    const second = native.add(
      [
        {
          ...location,
          address: {
            keys: ["mcpServers", "a/b.c"],
            path: "/workspace/.config.json",
            kind: "key-path",
          },
        },
      ],
      "observation",
    );
    expect(first).toEqual(["native-1"]);
    expect(second).toEqual(first);
    expect(native.records()).toHaveLength(1);
    expect(native.records()[0]).toMatchObject({
      id: "native-1",
      phase: "observation",
      scope: "project",
      address: { kind: "key-path", path: "/workspace/.config.json", keys: ["mcpServers", "a/b.c"] },
      aliases: ["/workspace/.alias.json"],
      configuredConsumers: ["claude", "codex", "unsupported"],
      readerDeclarationRef: "readers-1",
      policyReasons: ["shared-container"],
      ownership: "owned",
      proof: "accepted-value",
      mechanism: "structured-entry",
      state: "unchanged",
      availability: {
        observations: [
          { agentId: "cursor", state: "verified", reason: "Native value observed." },
          { agentId: "unsupported", state: "unavailable", reason: "No native capability." },
        ],
      },
    });
    expect(native.readerDeclarations()).toEqual([
      {
        id: "readers-1",
        potentialReaders: ["claude", "codex", "cursor"],
        availabilityDefault: {
          state: "unverified",
          appliesTo: "potential-readers",
          reason: "Declared reader; runtime not inspected.",
        },
      },
    ]);
    expect(
      Schema.decodeUnknownSync(Schema.Array(NativeLocationRecordSchema))(
        JSON.parse(JSON.stringify(native.records())),
      ),
    ).toEqual(native.records());
    expect(
      Schema.decodeUnknownSync(Schema.Array(NativeReaderDeclarationSchema))(
        JSON.parse(JSON.stringify(native.readerDeclarations())),
      ),
    ).toEqual(native.readerDeclarations());
    expect(JSON.stringify(location)).toBe(original);
  });

  it("never merges conflicting evidence, proposed effects, or another scope into an observation", () => {
    const native = createNativeLocationTable();
    const references = [
      ...native.add([location], "observation"),
      ...native.add([{ ...location, state: "updated" }], "proposal"),
      ...native.add([{ ...location, state: "updated" }], "settlement"),
      ...native.add([{ ...location, ownership: "unverified", proof: undefined }], "observation"),
      ...native.add([{ ...location, scope: "user" }], "observation"),
    ];
    expect(new Set(references).size).toBe(5);
    expect(
      references.map((ref) => native.records().find((record) => record.id === ref)?.phase),
    ).toEqual(["observation", "proposal", "settlement", "observation", "observation"]);
    expect(native.records().map(({ ownership }) => ownership)).toEqual([
      "owned",
      "owned",
      "owned",
      "unverified",
      "owned",
    ]);
  });

  it("does not apply a default to readers with no observation or erase conflicting reader evidence", () => {
    const native = createNativeLocationTable();
    native.add(
      [{ ...location, potentialReaders: [...location.potentialReaders, "uninspected"] }],
      "observation",
    );
    expect(native.readerDeclarations()[0]?.availabilityDefault?.appliesTo).toEqual([
      "claude",
      "codex",
    ]);
    native.add(
      [
        {
          ...location,
          availability: [
            ...location.availability,
            { agentId: "claude", state: "unavailable", reason: "Conflicting observation." },
          ],
        },
      ],
      "observation",
    );
    expect(native.records()[1]?.availability).toEqual({
      observations: [
        ...location.availability,
        { agentId: "claude", state: "unavailable", reason: "Conflicting observation." },
      ],
    });
    native.add([{ ...location, availability: [] }], "observation");
    expect(native.records()[2]?.availability).toEqual({ observations: [] });
  });

  it("shares equal declarations across physical records while retaining distinct audiences, reasons, applicability and actual observations", () => {
    const native = createNativeLocationTable();
    native.add([location], "observation");
    native.add(
      [
        {
          ...location,
          address: { kind: "file", path: "/workspace/another.json" },
          availability: location.availability.map((observation) =>
            observation.agentId === "cursor"
              ? { ...observation, state: "unavailable", reason: "Actually unavailable here." }
              : observation,
          ),
        },
      ],
      "observation",
    );
    expect(native.readerDeclarations()).toHaveLength(1);
    expect(native.records().map(({ readerDeclarationRef }) => readerDeclarationRef)).toEqual([
      "readers-1",
      "readers-1",
    ]);
    expect(native.records()[0]?.availability.observations[0]?.state).toBe("verified");
    expect(native.records()[1]?.availability.observations[0]?.state).toBe("unavailable");
    native.add(
      [{ ...location, potentialReaders: [...location.potentialReaders].reverse() }],
      "observation",
    );
    native.add(
      [
        {
          ...location,
          availability: location.availability.map((observation) =>
            observation.state === "unverified"
              ? { ...observation, reason: "Different non-observation reason." }
              : observation,
          ),
        },
      ],
      "observation",
    );
    native.add(
      [{ ...location, potentialReaders: [...location.potentialReaders, "no-observation"] }],
      "observation",
    );
    native.add([{ ...location, availability: [] }], "observation");
    expect(native.readerDeclarations()).toHaveLength(5);
    expect(native.readerDeclarations()[1]?.potentialReaders).toEqual(["cursor", "codex", "claude"]);
    expect(native.readerDeclarations()[2]?.availabilityDefault?.reason).toBe(
      "Different non-observation reason.",
    );
    expect(native.readerDeclarations()[3]?.availabilityDefault?.appliesTo).toEqual([
      "claude",
      "codex",
    ]);
    expect(native.readerDeclarations()[4]?.availabilityDefault).toBeUndefined();
    expect(
      native
        .records()
        .every((record) =>
          native.readerDeclarations().some(({ id }) => id === record.readerDeclarationRef),
        ),
    ).toBe(true);
  });
});
