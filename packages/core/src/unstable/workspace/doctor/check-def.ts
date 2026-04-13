import * as Effect from "effect/Effect";
import type { Finding } from "./types.js";

export interface DiagnosticDef<Context, Deps> {
  readonly id: string;
  readonly run: (ctx: Context) => Effect.Effect<ReadonlyArray<Finding>, never, Deps>;
}

export interface CheckDefInput<Context, Deps> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly dependsOn: ReadonlyArray<string>;
  readonly prepareContext: Effect.Effect<Context, never, Deps>;
  readonly diagnostics: ReadonlyArray<DiagnosticDef<Context, Deps>>;
}

export interface DiagnosticResult {
  readonly id: string;
  readonly findings: ReadonlyArray<Finding>;
}

export interface CheckDef<Deps> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly dependsOn: ReadonlyArray<string>;
  readonly runDiagnostics: Effect.Effect<ReadonlyArray<DiagnosticResult>, never, Deps>;
}

export const FINDING_ID_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

export const matchesCheckIdPrefix = (findingId: string, checkId: string): boolean => {
  const prefix = `${checkId}.`;
  return findingId.startsWith(prefix) && findingId.length > prefix.length;
};

export const defineCheck = <Context, Deps>(check: CheckDefInput<Context, Deps>): CheckDef<Deps> => {
  const runDiagnostics: Effect.Effect<
    ReadonlyArray<DiagnosticResult>,
    never,
    Deps
  > = Effect.flatMap(check.prepareContext, (ctx) =>
    Effect.all(
      check.diagnostics.map((diagnostic) =>
        Effect.map(
          diagnostic.run(ctx),
          (findings): DiagnosticResult => ({ id: diagnostic.id, findings }),
        ),
      ),
      { concurrency: "unbounded" },
    ),
  );

  return {
    id: check.id,
    title: check.title,
    description: check.description,
    dependsOn: check.dependsOn,
    runDiagnostics,
  };
};
