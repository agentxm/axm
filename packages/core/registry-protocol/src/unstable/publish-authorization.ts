import * as Schema from "effect/Schema";
import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import { Sha256HexSchema } from "./registry/publication-set.js";

const S256ChallengeSchema = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/));

/** Delivery proof is specific to the initiating transport, independently of browser consent. */
export const PublishAuthorizationDeliverySchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("loopback"),
    redirect_uri: Schema.NonEmptyString,
    state: Schema.NonEmptyString,
    code_challenge: S256ChallengeSchema,
    code_challenge_method: Schema.Literal("S256"),
  }),
  Schema.Struct({
    kind: Schema.Literal("polling"),
    proof_challenge: S256ChallengeSchema,
    proof_challenge_method: Schema.Literal("S256"),
  }),
]).annotate({
  identifier: "PublishAuthorizationDelivery",
  title: "Publish authorization delivery",
  description:
    "Loopback code delivery or resumable polling protected by a distinct initiator proof.",
});
export type PublishAuthorizationDelivery = typeof PublishAuthorizationDeliverySchema.Type;

export const PublishAuthorizationPollingProofSchema = Schema.Struct({
  initiator_proof: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43,128}$/)),
}).annotate({
  identifier: "PublishAuthorizationPollingProof",
  description:
    "Secret proof held by the initiator; never a public request reference or browser code.",
});

export const PublishAuthorizationPollingStatusSchema = Schema.Struct({
  purpose: Schema.Literal("publish"),
  status: Schema.Literals(["pending", "approved", "denied", "expired", "exchanged"]),
  expires_at: DateTimeUtcSchema,
  interval: Schema.Int.check(Schema.isGreaterThan(0)),
  publication_set_digest: Sha256HexSchema,
}).annotate({
  identifier: "PublishAuthorizationPollingStatus",
  title: "Publish authorization status",
  description:
    "Proof-protected authorization status and material binding; approval is not publication completion.",
});

export type PublishAuthorizationPollingStatus = typeof PublishAuthorizationPollingStatusSchema.Type;
