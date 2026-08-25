// Synthetic installed declaration used only to evaluate drift-policy behavior.
export declare namespace Effect {
  type Effect<A, E = never, R = never> = unknown;

  const forEach: <A, B, E, R>(
    items: Iterable<A>,
    options: { readonly concurrency?: number | "unbounded" },
    worker: (item: A) => Effect<B, E, R>,
  ) => Effect<ReadonlyArray<B>, E, R>;
}
