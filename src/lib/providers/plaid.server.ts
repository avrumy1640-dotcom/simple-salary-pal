// Plaid adapter for verifying employee bank accounts via micro-deposits or Auth.
// Reads PLAID_CLIENT_ID + PLAID_SECRET inside the handler only.

export interface PlaidLinkTokenResult { link_token: string; expiration: string }

export async function createLinkToken(userId: string): Promise<
  { ok: true; data: PlaidLinkTokenResult } | { ok: false; reason: string }
> {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) return { ok: false, reason: "PLAID credentials not configured" };
  // TODO: POST to https://production.plaid.com/link/token/create
  return { ok: false, reason: "Plaid adapter not yet implemented" };
}

export async function exchangePublicToken(publicToken: string): Promise<
  { ok: true; access_token: string; account_id: string } | { ok: false; reason: string }
> {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) return { ok: false, reason: "PLAID credentials not configured" };
  // TODO: POST /item/public_token/exchange and /auth/get
  return { ok: false, reason: "Plaid adapter not yet implemented" };
}
