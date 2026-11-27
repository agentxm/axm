/** Native host capabilities for filesystem integration tests, without path-spelling overrides. */
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  CurrentWorkObserver,
  type WorkFact,
  type WorkObserver,
} from "@agentxm/host-primitives/work-observation";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Tracer from "effect/Tracer";

import type { ContainerReceipt } from "./container-receipts.js";
import { NativeEntryRemovalLive } from "./live.js";

export const NativePlatformTest = Layer.merge(NodeServices.layer, NativeEntryRemovalLive);

/** Owner-local observations; independent fixtures still determine the expected work. */
export const workObservations = (detail: boolean) => {
  const facts: WorkFact[] = [];
  const observer: WorkObserver = {
    record: (fact) => {
      facts.push(fact);
    },
    detailSelected: () => detail,
  };
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(effect, CurrentWorkObserver, observer);
  return { facts, observer, provide };
};

/** Explicitly select detail when a test verifies real span lifetime or attributes. */
export const withDetailedWork =
  (tracer: Tracer.Tracer) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(workObservations(true).provide, Effect.withTracer(tracer));

/** A receipt change that records `receipt`, replacing the entry for its unit, path and kind. */
export const recordingReceipt =
  (receipt: ContainerReceipt) =>
  (entries: ReadonlyArray<ContainerReceipt>): ReadonlyArray<ContainerReceipt> => [
    ...entries.filter(
      (entry) =>
        entry.unit !== receipt.unit ||
        entry.identity.physicalPath !== receipt.identity.physicalPath ||
        entry.kind !== receipt.kind,
    ),
    receipt,
  ];

/** A receipt change that forgets every entry of `unit` at its physical path. */
export const forgettingReceipt =
  (unit: { readonly unit: string; readonly physicalPath: string }) =>
  (entries: ReadonlyArray<ContainerReceipt>): ReadonlyArray<ContainerReceipt> =>
    entries.filter(
      (entry) => entry.unit !== unit.unit || entry.identity.physicalPath !== unit.physicalPath,
    );
