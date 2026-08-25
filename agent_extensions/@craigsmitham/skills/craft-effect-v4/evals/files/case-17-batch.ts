import { Effect } from "effect";

declare const items: ReadonlyArray<string>;
declare const processItem: (item: string) => Effect.Effect<void>;

export const program = Effect.forEach(items, processItem, { concurrency: 4 });
