export interface RecoveryRequest {
  readonly memberId: string
  readonly registeredDeviceToken: string
}

export const requestRecovery = (_request: RecoveryRequest): "pending" =>
  "pending"
