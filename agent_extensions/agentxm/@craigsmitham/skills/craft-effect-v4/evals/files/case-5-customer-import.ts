import { Effect } from "effect"

interface Customer {
  readonly id: string
  readonly displayName: string
}

declare const readPayload: () => Promise<string>

export const importCustomer = Effect.tryPromise(async () => {
  const customer = JSON.parse(await readPayload()) as Customer
  if (!customer.id) throw new Error("missing customer id")
  return customer
})
