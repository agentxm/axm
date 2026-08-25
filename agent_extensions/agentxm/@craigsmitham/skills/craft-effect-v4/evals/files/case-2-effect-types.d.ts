// Synthetic installed declaration used only to evaluate version-policy behavior.
export declare namespace Effect {
  type Effect<A, E = never, R = never> = unknown

  const forEach: <A, B, E, R>(
    items: Iterable<A>,
    worker: (item: A) => Effect<B, E, R>,
    options?: { readonly concurrency?: number | "unbounded" },
  ) => Effect<ReadonlyArray<B>, E, R>
}
