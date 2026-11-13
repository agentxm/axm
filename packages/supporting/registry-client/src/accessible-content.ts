import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import * as Fiber from "effect/Fiber";
import * as Result from "effect/Result";
import type { RegistryClient, ValidateExtensionAccessArgs, AccessibleContent } from "./client.js";
import { RegistryRequestFailed } from "./errors.js";

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
  ): RegistryClient["withAccessibleContent"] =>
  (args, use) =>
    Effect.gen(function* () {
      const results = yield* validate(args);
      if (results.length !== args.length)
        return yield* new RegistryRequestFailed({
          category: "internal",
          detail: "Content admission results do not match the submitted identities.",
        });
      const admissions = new Map(args.map((arg, index) => [contentKey(arg), results[index]]));
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
                const fiber = yield* Effect.forkIn(acquire(requested), scope);
                return yield* Fiber.join(fiber).pipe(Effect.ensuring(Fiber.interrupt(fiber)));
              }),
          }),
        ({ open, scope }, exit) =>
          Ref.set(open, false).pipe(Effect.andThen(Scope.close(scope, exit))),
      );
    });
