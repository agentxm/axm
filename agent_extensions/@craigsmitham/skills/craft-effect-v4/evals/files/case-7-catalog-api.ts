import { Effect } from "effect";

interface CatalogItem {
  readonly sku: string;
  readonly price: number;
}

export const loadCatalogItem = (baseUrl: string, token: string, sku: string) =>
  Effect.tryPromise(async () => {
    const response = await fetch(`${baseUrl}/items/${sku}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`catalog returned ${response.status}`);
    return (await response.json()) as CatalogItem;
  });
