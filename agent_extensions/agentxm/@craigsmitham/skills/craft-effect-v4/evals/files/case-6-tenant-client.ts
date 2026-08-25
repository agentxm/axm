import { Effect } from "effect"

interface TenantClient {
  readonly query: (sql: string) => Promise<ReadonlyArray<unknown>>
  readonly close: () => Promise<void>
}

declare const openClient: (tenantId: string) => Promise<TenantClient>

const clients = new Map<string, TenantClient>()

export const queryTenant = (tenantId: string, sql: string) =>
  Effect.tryPromise(async () => {
    const client = clients.get(tenantId) ?? await openClient(tenantId)
    clients.set(tenantId, client)
    try {
      return await client.query(sql)
    } finally {
      await client.close()
      clients.delete(tenantId)
    }
  })
