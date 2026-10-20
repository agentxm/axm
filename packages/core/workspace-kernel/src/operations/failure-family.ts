/**
 * Failure families: the typed failures one owner renders, recognized together
 * and rendered by that owner's one renderer.
 *
 * A family names its failure classes once, beside the renderer that switches
 * over them, and a composer — the kernel failure rendering or an
 * application's catalog — recognizes and routes a failure by asking each
 * family in turn rather than listing every class again.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  makeStepFailure,
  type ErrorCode,
  type FailureMetadata,
  type FailureProblem,
  type FailureSuggestedAction,
  type StepFailure,
} from "./errors.js";
import type { FailureDiagnostic } from "./failure-diagnostic.js";

/**
 * What a rendering needs from its composer: the sentence a transition's
 * deciding failure reads with. A composer that renders more families than
 * the kernel's supplies a reader over all of them.
 */
export interface FailureRendering {
  readonly detailOf: (failure: unknown) => string | undefined;
}

/** A family of typed failures: how to recognize one, and how to render it. */
export interface FailureFamily<F> {
  /** Whether an untyped failure belongs to this family. */
  readonly is: (failure: unknown) => failure is F;
  /** Render one failure of this family within a composer's rendering. */
  render(failure: F, rendering: FailureRendering): StepFailure;
}

/** The failures a family recognizes and renders. */
export type FailureOf<Family> = Family extends FailureFamily<infer F> ? F : never;

type FailureClass = abstract new (...args: never) => object;
type InstanceOf<C> = C extends abstract new (...args: never) => infer I ? I : never;

// A family's renderer and its recognizers cover the same failures: a failure
// the renderer accepts but nothing recognizes, or the reverse, makes the
// definition demand a property naming the difference.
type CoversExactly<Rendered, Recognized> = [Rendered] extends [Recognized]
  ? [Recognized] extends [Rendered]
    ? unknown
    : { readonly unrenderedFailures: Exclude<Recognized, Rendered> }
  : { readonly unrecognizedFailures: Exclude<Rendered, Recognized> };

/**
 * Define a failure family from the classes that construct its failures, a
 * recognizer for failures no class constructs (such as a brand), or both,
 * together with the renderer that covers exactly those failures.
 *
 * The class list is read when a failure is recognized, never at module load:
 * a family's classes may live in modules that load after the module that
 * defines it.
 */
export const defineFailureFamily = <
  F,
  const Classes extends ReadonlyArray<FailureClass> = readonly [],
  Branded = never,
>(
  family: {
    readonly classes?: () => Classes;
    readonly recognizes?: (failure: unknown) => failure is Branded;
    readonly render: (failure: F, rendering: FailureRendering) => StepFailure;
  } & CoversExactly<F, InstanceOf<Classes[number]> | Branded>,
): FailureFamily<F> => ({
  is: (failure: unknown): failure is F =>
    family.recognizes?.(failure) === true ||
    (family.classes?.() ?? []).some((failureClass) => failure instanceof failureClass),
  render: family.render,
});

/**
 * A failure that carries its own rendering: the producer chose the category,
 * the sentence, and the recoveries, and the boundary converts them verbatim.
 */
interface CarriedFailure {
  readonly category: ErrorCode;
  readonly diagnostic?: FailureDiagnostic | undefined;
  readonly title?: string | undefined;
  readonly detail?: string | undefined;
  readonly problem?: FailureProblem | undefined;
  readonly metadata?: FailureMetadata | undefined;
  readonly retryable?: boolean | undefined;
  readonly recover?: string | undefined;
  readonly cmd?: string | undefined;
  readonly suggestions?: ReadonlyArray<FailureSuggestedAction> | undefined;
  readonly cause?: unknown;
}

/** Render a failure that carries its own rendering, field for field. */
export const renderCarriedFailure = (failure: CarriedFailure): StepFailure =>
  makeStepFailure({
    category: failure.category,
    diagnostic: failure.diagnostic,
    title: failure.title,
    detail: failure.detail,
    problem: failure.problem,
    metadata: failure.metadata,
    retryable: failure.retryable,
    recover: failure.recover,
    cmd: failure.cmd,
    suggestions: failure.suggestions,
    cause: failure.cause,
  });
