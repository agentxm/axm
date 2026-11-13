import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import * as Fiber from "effect/Fiber";
import * as Result from "effect/Result";
import type { RegistryClient, ValidateExtensionAccessArgs, AccessibleContent } from "./client.js";
import { RegistryRequestFailed, type RegistryClientFailure } from "./errors.js";
import type { RegistryAuthorityContext } from "./registry-transport.js";

const contentKey = (args: ValidateExtensionAccessArgs) =>
  JSON.stringify([
    args.owner,
    args.type,
    args.name,
    args.exact.publisherBindingId,
    args.exact.version,
    args.exact.integrity,
    args.usagePurpose ?? "normal",
  ]);

/** An admission belongs to one callback; its reader cannot be reused after that callback ends. */
export const makeAccessibleContent =
  (
    validate: RegistryClient["validateExtensionAccessBatch"],
    acquire: AccessibleContent["read"],
    authorityContext: Effect.Effect<RegistryAuthorityContext, RegistryClientFailure>,
  ): RegistryClient["withAccessibleContent"] =>
  (args, use) =>
    Effect.gen(function* () {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const authority = yield* authorityContext;
        const checked = yield* Effect.result(validate(args));
        const current = yield* authorityContext;
        if (authority.id !== current.id || authority.generation !== current.generation) continue;
        if (Result.isFailure(checked)) return yield* Effect.fail(checked.failure);
        const results = checked.success;
        if (results.length !== args.length)
          return yield* new RegistryRequestFailed({
            category: "internal",
            detail: "Content admission results do not match the submitted identities.",
          });
        const admissions = new Map(args.map((arg, index) => [contentKey(arg), results[index]]));
        const verifyAuthority = authorityContext.pipe(
          Effect.flatMap((current) =>
            current.id === authority.id && current.generation === authority.generation
              ? Effect.void
              : Effect.fail(
                  new RegistryRequestFailed({
                    category: "conflict",
                    detail:
                      "Registry credentials changed after content admission. Fresh admission is required.",
                  }),
                ),
          ),
        );
        return yield* Effect.acquireUseRelease(
          Effect.gen(function* () {
            return { open: yield* Ref.make(true), scope: yield* Scope.make() };
          }),
          ({ open, scope }) =>
            use({
              results,
              read: (requested) =>
                Effect.gen(function* () {
                  if (!(yield* Ref.get(open)))
                    return yield* new RegistryRequestFailed({
                      category: "conflict",
                      detail: "The content admission scope has ended.",
                    });
                  const admission = admissions.get(contentKey(requested));
                  if (admission === undefined)
                    return yield* new RegistryRequestFailed({
                      category: "conflict",
                      detail: "Content was not included in this admission scope.",
                    });
                  if (Result.isFailure(admission)) return yield* Effect.fail(admission.failure);
                  const fiber = yield* Effect.forkIn(
                    verifyAuthority.pipe(
                      Effect.andThen(acquire(requested)),
                      Effect.tap(() => verifyAuthority),
                    ),
                    scope,
                  );
                  return yield* Fiber.join(fiber).pipe(Effect.ensuring(Fiber.interrupt(fiber)));
                }),
            }),
          ({ open, scope }, exit) =>
            Ref.set(open, false).pipe(Effect.andThen(Scope.close(scope, exit))),
        );
      }
      return yield* new RegistryRequestFailed({
        category: "conflict",
        detail: "Registry credentials changed repeatedly during content admission.",
      });
    });
