/**
 * Real-screen harness for output specifications.
 *
 * The install harness captures rendered documents through a test renderer;
 * the obligations on the bytes AXM writes need the real `Screen` layers over
 * recording output streams instead. The recording keeps stdout and stderr in
 * one ordered log, so a specification can assert that one write happened
 * before another across the two channels.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import {
  FrameLive,
  OutputStreams,
  Screen,
  ScreenLive,
  ScreenMachine,
  asciiGlyphs,
  resolveCliOutputPolicy,
  unicodeGlyphs,
} from "axm.sh/specification-harness";

export interface RecordedWrite {
  readonly channel: "stdout" | "stderr";
  readonly content: string;
}

export interface RecordingStreamOptions {
  readonly stdoutIsTTY?: boolean;
  readonly stderrIsTTY?: boolean;
  readonly columns?: number;
}

export interface RecordingStreams {
  readonly layer: Layer.Layer<OutputStreams>;
  /** Every write in the order the application performed it. */
  readonly log: Array<RecordedWrite>;
  readonly facts: Required<RecordingStreamOptions>;
  /** The concatenated content of one channel, split into lines without the trailing newline. */
  readonly lines: (channel: "stdout" | "stderr") => ReadonlyArray<string>;
}

export const makeRecordingStreams = (options?: RecordingStreamOptions): RecordingStreams => {
  const log: Array<RecordedWrite> = [];
  const facts = {
    stdoutIsTTY: options?.stdoutIsTTY ?? false,
    stderrIsTTY: options?.stderrIsTTY ?? false,
    columns: options?.columns ?? 80,
  };
  const record = (channel: "stdout" | "stderr") => (content: string) =>
    Effect.sync(() => void log.push({ channel, content }));
  return {
    log,
    facts,
    lines: (channel) => {
      const content = log
        .filter((entry) => entry.channel === channel)
        .map((entry) => entry.content)
        .join("");
      return content.length === 0 ? [] : content.replace(/\n$/u, "").split("\n");
    },
    layer: Layer.succeed(OutputStreams, {
      stdout: record("stdout"),
      stderr: record("stderr"),
      facts: Effect.succeed(facts),
      resize: Stream.empty,
    }),
  };
};

/** The real machine-output screen writing to the recording streams. */
export const machineScreenLayer = (
  streams: RecordingStreams,
  options?: { readonly quiet?: boolean },
): Layer.Layer<Screen> =>
  Layer.provide(ScreenMachine({ quiet: options?.quiet === true }), streams.layer);

/**
 * The real human screen (frame plus painter) writing to the recording
 * streams, with the output policy the CLI would derive from the streams'
 * terminal facts and an environment that forces nothing.
 */
export const humanScreenLayer = (streams: RecordingStreams): Layer.Layer<Screen> => {
  const policy = resolveCliOutputPolicy({
    stdoutIsTTY: streams.facts.stdoutIsTTY,
    stderrIsTTY: streams.facts.stderrIsTTY,
    env: {},
  });
  const glyphs = policy.glyphs === "ascii" ? asciiGlyphs : unicodeGlyphs;
  const frame = Layer.provide(
    FrameLive({ animate: false, quiet: false, colors: policy.stderrColors, glyphs }),
    streams.layer,
  );
  return Layer.provide(
    ScreenLive({
      colors: { stdout: policy.stdoutColors, stderr: policy.stderrColors },
      animate: false,
      glyphs,
    }),
    Layer.merge(frame, streams.layer),
  );
};
