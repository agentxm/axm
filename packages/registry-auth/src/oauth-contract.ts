import type * as DateTime from "effect/DateTime";

export interface NormalizedTokenResponse {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at: DateTime.Utc;
}
