/** Public observations contain addresses and evidence, never persisted filesystem identities. */
import * as Schema from "effect/Schema";

export const OwnershipUnitAddressSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("entry"), path: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("key-path"),
    path: Schema.String,
    keys: Schema.NonEmptyArray(Schema.String),
  }),
  Schema.Struct({ kind: Schema.Literal("region"), path: Schema.String, region: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("file"), path: Schema.String }),
]).annotate({
  identifier: "OwnershipUnitAddress",
  description:
    "An entry, key path, region, or whole file; key names never become ambiguous path fragments.",
});
export type OwnershipUnitAddress = typeof OwnershipUnitAddressSchema.Type;

export const NativeLocationOutcomeSchema = Schema.Struct({
  scope: Schema.Literals(["project", "user"]),
  address: OwnershipUnitAddressSchema,
  aliases: Schema.Array(Schema.String),
  configuredConsumers: Schema.Array(Schema.String),
  potentialReaders: Schema.Array(Schema.String),
  policyReasons: Schema.Array(Schema.String),
  ownership: Schema.Literals(["owned", "unowned", "absent", "unverified"]),
  proof: Schema.optional(Schema.String),
  state: Schema.Literals([
    "created",
    "updated",
    "removed",
    "retained",
    "unchanged",
    "blocked",
    "absent",
    "unverified",
  ]),
  mechanism: Schema.optional(
    Schema.Literals([
      "symlink",
      "copied-directory",
      "structured-entry",
      "managed-region",
      "generated-file",
    ]),
  ),
  availability: Schema.Array(
    Schema.Struct({
      agentId: Schema.String,
      state: Schema.Literals(["verified", "unverified", "unavailable"]),
      reason: Schema.optional(Schema.String),
    }),
  ),
  reason: Schema.optional(Schema.String),
}).annotate({
  identifier: "NativeLocationOutcome",
  description:
    "One resolved native unit with its aliases, consumers, ownership evidence, and observed or planned change.",
});
export type NativeLocationOutcome = typeof NativeLocationOutcomeSchema.Type;

/** Operation-local identity; consumers and aliases do not multiply one physical unit. */
export const nativeUnitKey = (unit: Pick<NativeLocationOutcome, "scope" | "address">): string =>
  JSON.stringify([
    unit.scope,
    unit.address.kind,
    unit.address.path,
    unit.address.kind === "key-path"
      ? unit.address.keys
      : unit.address.kind === "region"
        ? unit.address.region
        : null,
  ]);

/** Preserve evidence across visits while the final observation owns the unit's state. */
export const combineNativeLocationOutcomes = (
  outcomes: ReadonlyArray<NativeLocationOutcome>,
): ReadonlyArray<NativeLocationOutcome> => {
  const units = new Map<string, NativeLocationOutcome>();
  const union = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
    [...new Set([...left, ...right])].sort();
  for (const outcome of outcomes) {
    const key = nativeUnitKey(outcome);
    const prior = units.get(key);
    units.set(
      key,
      prior === undefined
        ? outcome
        : {
            ...outcome,
            aliases: union(prior.aliases, outcome.aliases),
            configuredConsumers: union(prior.configuredConsumers, outcome.configuredConsumers),
            potentialReaders: union(prior.potentialReaders, outcome.potentialReaders),
            policyReasons: union(prior.policyReasons, outcome.policyReasons),
            availability: [
              ...new Map(
                [...prior.availability, ...outcome.availability].map((item) => [
                  item.agentId,
                  item,
                ]),
              ).values(),
            ].sort((left, right) => left.agentId.localeCompare(right.agentId)),
          },
    );
  }
  return [...units.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, unit]) => unit);
};
