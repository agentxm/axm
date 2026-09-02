import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as ServiceMap from "effect/Context";
import * as Stream from "effect/Stream";

const DEFAULT_COLUMNS = 80;

export interface OutputStreamFacts {
  readonly stdoutIsTTY: boolean;
  readonly stderrIsTTY: boolean;
  readonly columns: number;
}

export class OutputStreams extends ServiceMap.Service<
  OutputStreams,
  {
    readonly stdout: (content: string) => Effect.Effect<void>;
    readonly stderr: (content: string) => Effect.Effect<void>;
    readonly facts: Effect.Effect<OutputStreamFacts>;
    readonly resize: Stream.Stream<number>;
  }
>()("axm.sh/screen/OutputStreams") {}

const currentColumns = (): number =>
  Math.max(20, process.stderr.columns ?? process.stdout.columns ?? DEFAULT_COLUMNS);

const resizeStream = Stream.callback<number>((queue) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const handler = () => Queue.offerUnsafe(queue, currentColumns());
      process.stderr.on("resize", handler);
      process.stdout.on("resize", handler);
      return handler;
    }),
    (handler) =>
      Effect.sync(() => {
        process.stderr.off("resize", handler);
        process.stdout.off("resize", handler);
      }),
  ),
);

export const OutputStreamsLive: Layer.Layer<OutputStreams> = Layer.succeed(OutputStreams, {
  stdout: (content) =>
    Effect.sync(() => {
      process.stdout.write(content);
    }),
  stderr: (content) =>
    Effect.sync(() => {
      process.stderr.write(content);
    }),
  facts: Effect.sync(() => ({
    stdoutIsTTY: process.stdout.isTTY === true,
    stderrIsTTY: process.stderr.isTTY === true,
    columns: currentColumns(),
  })),
  resize: resizeStream,
});

export interface TestOutputStreamsState {
  readonly stdout: Array<string>;
  readonly stderr: Array<string>;
}

export const makeTestOutputStreams = (options?: {
  readonly stdoutIsTTY?: boolean;
  readonly stderrIsTTY?: boolean;
  readonly columns?: number;
  readonly resize?: Stream.Stream<number>;
}): { readonly layer: Layer.Layer<OutputStreams>; readonly state: TestOutputStreamsState } => {
  const state: TestOutputStreamsState = { stdout: [], stderr: [] };
  return {
    state,
    layer: Layer.succeed(OutputStreams, {
      stdout: (content) => Effect.sync(() => void state.stdout.push(content)),
      stderr: (content) => Effect.sync(() => void state.stderr.push(content)),
      facts: Effect.succeed({
        stdoutIsTTY: options?.stdoutIsTTY ?? false,
        stderrIsTTY: options?.stderrIsTTY ?? false,
        columns: options?.columns ?? DEFAULT_COLUMNS,
      }),
      resize: options?.resize ?? Stream.empty,
    }),
  };
};
