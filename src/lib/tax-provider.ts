// Pluggable tax provider abstraction.
//
// ⚠️ NON-PRODUCTION: The bundled StubTaxProvider uses the in-house bracket math
// from src/lib/payroll.ts. It is NOT a substitute for a certified tax engine
// (Symmetry, Vertex, Avalara), and it does NOT file taxes with any agency.
// Anything that ends up on a real paycheck or W-2 must be validated by a
// certified provider before going live.
//
// Connect a real provider by implementing the TaxProvider interface and
// registering it in resolveTaxProvider() below. Read API keys from
// process.env inside the handler — never at module scope.

import { calcPay, type PayrollCalcInput, type PayrollCalcResult } from "./payroll";

export interface TaxProvider {
  readonly id: string;
  readonly displayName: string;
  /** Compute a single employee's pay for a single run. */
  computePay(input: PayrollCalcInput): Promise<PayrollCalcResult>;
  /** True when this provider is approved to drive real money movement. */
  readonly isProductionReady: boolean;
}

/**
 * StubTaxProvider — wraps the local bracket math.
 * Marked non-production. Withholding accuracy is not certified.
 */
export const StubTaxProvider: TaxProvider = {
  id: "stub",
  displayName: "Built-in (non-certified, for development only)",
  isProductionReady: false,
  async computePay(input) {
    return calcPay(input);
  },
};

/**
 * Resolve which tax provider to use for a company.
 * Today: always returns the stub. When `provider_integrations` has a row with
 * provider='symmetry' (or similar) and credentials configured, we'll route there.
 */
export function resolveTaxProvider(): TaxProvider {
  // Future: lookup company.provider_integrations and return the appropriate adapter.
  return StubTaxProvider;
}
