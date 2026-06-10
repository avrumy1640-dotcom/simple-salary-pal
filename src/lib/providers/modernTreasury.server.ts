// Modern Treasury adapter for ACH origination on payroll processing.
// Reads MODERN_TREASURY_API_KEY + MODERN_TREASURY_ORG_ID inside the handler only.

export interface ACHTransferInput {
  amount: number;
  currency: "USD";
  effective_date: string;
  originating_account_id: string;
  receiving_account_routing: string;
  receiving_account_number: string;
  receiving_account_type: "checking" | "savings";
  description: string;
  metadata?: Record<string, string>;
}

export async function originateACH(
  input: ACHTransferInput
): Promise<{ ok: true; payment_id: string; status: string } | { ok: false; reason: string }> {
  const key = process.env.MODERN_TREASURY_API_KEY;
  const org = process.env.MODERN_TREASURY_ORG_ID;
  if (!key || !org) return { ok: false, reason: "MODERN_TREASURY credentials not configured" };
  // TODO: POST https://app.moderntreasury.com/api/payment_orders
  return { ok: false, reason: "Modern Treasury adapter not yet implemented" };
}
