// Synthetic installed source used only to evaluate drift-policy behavior.
export const forEach = <A, B>(
  items: Iterable<A>,
  options: { readonly concurrency?: number | "unbounded" },
  worker: (item: A) => B,
): ReadonlyArray<B> => {
  void options
  return Array.from(items, worker)
}
