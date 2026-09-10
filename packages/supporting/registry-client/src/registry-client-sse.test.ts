/**
 * Streaming conformance for the generated registry client's SSE surface.
 *
 * The wire fixtures mirror the registry's diagnostic stream endpoint byte for
 * byte: JSON `data:` frames per event, and a terminal mid-stream failure on
 * the reserved `effect/httpapi/stream/failure` event carrying the serialized
 * Cause of the server's typed error.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import * as GeneratedRegistryClient from "./__generated__/registry-client.js";

const STREAM_FAILURE_EVENT = "effect/httpapi/stream/failure";

const sseBody = (frames: ReadonlyArray<string>): string => `${frames.join("\n\n")}\n\n`;

const makeSseClient = (body: string) =>
  GeneratedRegistryClient.make(
    HttpClient.make((request) =>
      Effect.sync(() =>
        HttpClientResponse.fromWeb(
          request,
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        ),
      ),
    ).pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl("http://registry.local"))),
  );

const DebugEventJson = Schema.fromJsonString(
  Schema.Struct({ sequence: Schema.Number, message: Schema.String }),
);

const StreamFailureCauseJson = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      _tag: Schema.String,
      error: Schema.Struct({ _tag: Schema.String, after: Schema.Number }),
    }),
  ),
);

describe("RegistryClient.DebugDebugStreamSse", () => {
  it.effect("decodes SSE data frames into ordered debug events", () =>
    Effect.gen(function* () {
      const client = makeSseClient(
        sseBody([
          'data: {"sequence":0,"message":"debug-event-0"}',
          'data: {"sequence":1,"message":"debug-event-1"}',
          'data: {"sequence":2,"message":"debug-event-2"}',
        ]),
      );

      const frames = yield* Stream.runCollect(
        client.DebugDebugStreamSse({ params: { count: "3" } }),
      );

      expect(frames.length).toBe(3);
      const events = yield* Effect.forEach(frames, (frame) =>
        Schema.decodeUnknownEffect(DebugEventJson)(frame.data),
      );
      expect(events).toEqual([
        { sequence: 0, message: "debug-event-0" },
        { sequence: 1, message: "debug-event-1" },
        { sequence: 2, message: "debug-event-2" },
      ]);
    }),
  );

  it.effect("preserves optional SSE event ids", () =>
    Effect.gen(function* () {
      const client = makeSseClient(
        sseBody([
          'data: {"sequence":0,"message":"debug-event-0"}',
          'id: debug-1\ndata: {"sequence":1,"message":"debug-event-1"}',
        ]),
      );

      const frames = yield* Stream.runCollect(
        client.DebugDebugStreamSse({ params: { count: "2" } }),
      );

      expect(frames[0]?.id).toBeUndefined();
      expect(frames[1]?.id).toBe("debug-1");
    }),
  );

  it.effect("decodes a mid-stream failure event back to the original typed cause", () =>
    Effect.gen(function* () {
      const client = makeSseClient(
        sseBody([
          'data: {"sequence":0,"message":"debug-event-0"}',
          `event: ${STREAM_FAILURE_EVENT}\ndata: [{"_tag":"Fail","error":{"_tag":"DebugStreamInterrupted","after":1}}]`,
        ]),
      );

      const frames = yield* Stream.runCollect(
        client.DebugDebugStreamSse({ params: { count: "5", failAfter: "1" } }),
      );

      expect(frames.length).toBe(2);
      const dataFrame = frames[0];
      const failureFrame = frames[1];
      expect(dataFrame).toBeDefined();
      expect(failureFrame).toBeDefined();
      if (dataFrame === undefined || failureFrame === undefined) return;

      const event = yield* Schema.decodeUnknownEffect(DebugEventJson)(dataFrame.data);
      expect(event.sequence).toBe(0);

      // The reserved failure event carries the server's original Cause: a
      // typed `Fail` reason wrapping the endpoint's declared error.
      expect(failureFrame.event).toBe(STREAM_FAILURE_EVENT);
      const reasons = yield* Schema.decodeUnknownEffect(StreamFailureCauseJson)(failureFrame.data);
      expect(reasons.length).toBe(1);
      expect(reasons[0]?._tag).toBe("Fail");
      expect(reasons[0]?.error).toEqual({ _tag: "DebugStreamInterrupted", after: 1 });
    }),
  );
});
