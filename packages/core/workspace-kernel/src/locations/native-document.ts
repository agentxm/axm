/** Result-local native evidence. Domain observations remain independent of presentation. */
import * as Schema from "effect/Schema";
import {
  NativeLocationOutcomeSchema,
  nativeUnitKey,
  type NativeLocationOutcome,
} from "./native-outcomes.js";

export const NativeLocationReferenceSchema = Schema.String.annotate({
  identifier: "NativeLocationReference",
  description:
    "ID of an evidence record in this result's nativeLocations table; never an external lookup.",
});

const NativeAvailabilityDefaultSchema = Schema.Struct({
  state: Schema.Literal("unverified"),
  appliesTo: Schema.Union([Schema.Literal("potential-readers"), Schema.Array(Schema.String)]),
  reason: Schema.optional(Schema.String),
});

export const NativeReaderDeclarationSchema = Schema.Struct({
  id: Schema.String,
  potentialReaders: NativeLocationOutcomeSchema.fields.potentialReaders,
  availabilityDefault: Schema.optionalKey(NativeAvailabilityDefaultSchema),
}).annotate({
  identifier: "NativeReaderDeclaration",
  description:
    "Result-local ordered reader audience and shared non-observation declaration. A referenced location's actual observations override this default; absent readers have no implied availability or unavailability.",
});
export type NativeReaderDeclaration = typeof NativeReaderDeclarationSchema.Type;

const NativeAvailabilitySchema = Schema.Struct({
  observations: NativeLocationOutcomeSchema.fields.availability,
}).annotate({
  identifier: "NativeAvailability",
  description:
    "Actual observations and exceptions for this native location. The referenced reader declaration supplies only its explicit default and applicability.",
});

const { potentialReaders: _potentialReaders, ...nativeFields } = NativeLocationOutcomeSchema.fields;

export const NativeLocationRecordSchema = Schema.Struct({
  id: NativeLocationReferenceSchema,
  phase: Schema.Literals(["observation", "proposal", "settlement"]),
  ...nativeFields,
  readerDeclarationRef: Schema.String.annotate({
    description: "ID in this result's nativeReaderDeclarations table; never an external lookup.",
  }),
  availability: NativeAvailabilitySchema,
}).annotate({
  identifier: "NativeLocationRecord",
  description:
    "Physical evidence linked to its result-local reader declaration. Conflicting evidence and different phases at the same address remain distinct records.",
});
export type NativeLocationRecord = typeof NativeLocationRecordSchema.Type;

const availabilityDocument = (
  outcome: NativeLocationOutcome,
): {
  readonly default?: typeof NativeAvailabilityDefaultSchema.Type;
  readonly observations: NativeLocationOutcome["availability"];
} => {
  const groups = new Map<
    string | undefined,
    Array<NativeLocationOutcome["availability"][number]>
  >();
  for (const observation of outcome.availability) {
    if (observation.state !== "unverified") continue;
    const group = groups.get(observation.reason) ?? [];
    group.push(observation);
    groups.set(observation.reason, group);
  }
  const shared = [...groups.values()].sort((left, right) => right.length - left.length)[0];
  if (shared === undefined) return { observations: outcome.availability };
  const first = shared[0];
  if (first === undefined) return { observations: outcome.availability };
  const readers = shared.map(({ agentId }) => agentId);
  // A reader with conflicting observations must keep every observation explicit.
  if (
    new Set(outcome.availability.map(({ agentId }) => agentId)).size !== outcome.availability.length
  )
    return { observations: outcome.availability };
  const observations = outcome.availability.filter((item) => !shared.includes(item));
  const potentialReaders = new Set(outcome.potentialReaders);
  const appliesToPotentialReaders =
    readers.every((reader) => potentialReaders.has(reader)) &&
    outcome.potentialReaders.every((reader) =>
      outcome.availability.some(({ agentId }) => agentId === reader),
    );
  return {
    default: {
      state: "unverified",
      appliesTo: appliesToPotentialReaders ? "potential-readers" : readers,
      ...(first.reason === undefined ? {} : { reason: first.reason }),
    },
    observations,
  };
};

/** A bounded builder owned by one result assembly; it performs no observation or domain merging. */
export const createNativeLocationTable = () => {
  const table = new Map<string, NativeLocationRecord>();
  const declarations = new Map<string, NativeReaderDeclaration>();
  return {
    add: (
      outcomes: ReadonlyArray<NativeLocationOutcome>,
      phase: NativeLocationRecord["phase"],
    ): ReadonlyArray<string> => [
      ...new Set(
        outcomes.map((outcome) => {
          const availability = availabilityDocument(outcome);
          const declaration = {
            potentialReaders: outcome.potentialReaders,
            ...(availability.default === undefined
              ? {}
              : { availabilityDefault: availability.default }),
          };
          const declarationKey = JSON.stringify(declaration);
          let readerDeclaration = declarations.get(declarationKey);
          if (readerDeclaration === undefined) {
            readerDeclaration = { id: `readers-${declarations.size + 1}`, ...declaration };
            declarations.set(declarationKey, readerDeclaration);
          }
          const evidence = {
            phase,
            scope: outcome.scope,
            address: outcome.address,
            aliases: outcome.aliases,
            configuredConsumers: outcome.configuredConsumers,
            readerDeclarationRef: readerDeclaration.id,
            policyReasons: outcome.policyReasons,
            ownership: outcome.ownership,
            proof: outcome.proof,
            state: outcome.state,
            mechanism: outcome.mechanism,
            availability: { observations: availability.observations },
            reason: outcome.reason,
          };
          const key = JSON.stringify({ ...evidence, address: nativeUnitKey(outcome) });
          const existing = table.get(key);
          if (existing !== undefined) return existing.id;
          const id = `native-${table.size + 1}`;
          table.set(key, { id, ...evidence });
          return id;
        }),
      ),
    ],
    records: (): ReadonlyArray<NativeLocationRecord> => [...table.values()],
    readerDeclarations: (): ReadonlyArray<NativeReaderDeclaration> => [...declarations.values()],
  };
};
