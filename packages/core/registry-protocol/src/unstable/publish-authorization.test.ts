import { describe, expect, it } from "vitest";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  PublishAuthorizationDeliverySchema,
  PublishAuthorizationPollingProofSchema,
} from "./publish-authorization.js";

const decodeDelivery = Schema.decodeUnknownResult(PublishAuthorizationDeliverySchema);
const challenge = "a".repeat(43);

describe("Exact-publication delivery contract", () => {
  it("expresses polling without an invented local redirect or OAuth state", () => {
    const delivery = {
      kind: "polling",
      proof_challenge: challenge,
      proof_challenge_method: "S256",
    };
    expect(decodeDelivery(delivery)).toEqual(Result.succeed(delivery));
    expect(Result.isFailure(decodeDelivery({ kind: "polling" }))).toBe(true);
    expect(
      Result.isFailure(
        decodeDelivery({
          kind: "polling",
          code_challenge: challenge,
          code_challenge_method: "S256",
        }),
      ),
    ).toBe(true);
  });
  it("keeps loopback state, redirect and PKCE mandatory", () => {
    const delivery = {
      kind: "loopback",
      redirect_uri: "http://127.0.0.1:49152/callback",
      state: "fixture-state",
      code_challenge: challenge,
      code_challenge_method: "S256",
    };
    expect(Result.isSuccess(decodeDelivery(delivery))).toBe(true);
    expect(Result.isFailure(decodeDelivery({ ...delivery, state: "" }))).toBe(true);
    expect(Result.isFailure(decodeDelivery({ ...delivery, code_challenge_method: "plain" }))).toBe(
      true,
    );
  });
  it("does not accept a public reference as polling proof", () => {
    const decodeProof = Schema.decodeUnknownResult(PublishAuthorizationPollingProofSchema);
    expect(Result.isFailure(decodeProof({ request_id: "pubreq_01h455vb4pexka56gq5w2r7cpc" }))).toBe(
      true,
    );
    expect(
      Result.isFailure(decodeProof({ initiator_proof: "pubreq_01h455vb4pexka56gq5w2r7cpc" })),
    ).toBe(true);
  });
});
