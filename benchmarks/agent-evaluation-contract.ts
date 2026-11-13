import type * as Effect from "effect/Effect";

interface AgentFixtureInvocation {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface AgentFixtureContext {
  /** Physical preparation directory; the evaluator sees /tmp/workspace. */
  readonly root: string;
  /** Execute preparation tools through the same isolated mount and capture boundary. */
  readonly run: (
    executable: string,
    args: ReadonlyArray<string>,
    cwd?: string,
    environment?: Readonly<Record<string, string>>,
  ) => Effect.Effect<AgentFixtureInvocation, unknown>;
  readonly invoke: (
    args: ReadonlyArray<string>,
    cwd?: string,
    environment?: Readonly<Record<string, string>>,
  ) => Effect.Effect<AgentFixtureInvocation, unknown>;
}

export interface PreparedAgentFixture {
  readonly protectedPaths: ReadonlyArray<string>;
  readonly expectedChanges: ReadonlyArray<string>;
  /** Kept in external evidence, never in the evaluator's mounted workspace. */
  readonly oracleFacts: ReadonlyArray<string>;
  readonly environment?: Readonly<Record<string, string>>;
  /** Fixture-generated endpoint/path spellings only; raw snapshots remain retained. */
  readonly comparisonRoots?: ReadonlyArray<string>;
  /** Only independently validated fixture identities may be projected; raw files are retained. */
  readonly comparisonFiles?: ReadonlyArray<{
    readonly relativePath: string;
    readonly comparisonSha256: string;
    readonly reason: string;
    readonly comparisonDocument?: unknown;
    readonly verificationEvidence?: unknown;
  }>;
  /** External fixture observation/control; never inserted into the model prompt. */
  readonly onTrial?: (control: {
    readonly interruptActivePublish: (
      subject: string,
      evidence: unknown,
    ) => Effect.Effect<void, unknown>;
  }) => Effect.Effect<void, unknown>;
  readonly verifyState: () => Effect.Effect<
    {
      readonly assertions: ReadonlyArray<string>;
      readonly failures: ReadonlyArray<string>;
    },
    unknown
  >;
  readonly cleanup?: () => Effect.Effect<void, unknown>;
}

export interface AgentEvaluationCase {
  readonly id: string;
  /** Activation is a separately preregistered campaign; task comparison is the default. */
  readonly evaluationPhase?: "task" | "activation";
  readonly heldOut: boolean;
  readonly prompt: string;
  readonly authority: string;
  readonly cliAvailable?: boolean;
  /** Activation trials omit the otherwise explicit announcement that AXM is available. */
  readonly activation?: boolean;
  readonly prepare: (context: AgentFixtureContext) => Effect.Effect<PreparedAgentFixture, unknown>;
}
