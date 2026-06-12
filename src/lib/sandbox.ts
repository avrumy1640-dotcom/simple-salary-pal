// Sandbox / production gating for money-moving and tax-filing surfaces.
//
// Default: production payroll DISABLED. To enable in a deployment that has
// vendor accounts (Symmetry / Plaid / Modern Treasury) and a compliance
// reviewer, set VITE_PRODUCTION_PAYROLL_ENABLED=true (and PRODUCTION_PAYROLL_ENABLED
// for server functions).
//
// This is a SAFETY interlock — never remove without explicit compliance sign-off.

function readClientFlag(): boolean {
  try {
    // import.meta.env is replaced at build time by Vite on both client & server bundles.
    const v = (import.meta as any).env?.VITE_PRODUCTION_PAYROLL_ENABLED;
    return v === "true" || v === true;
  } catch {
    return false;
  }
}

export const PRODUCTION_PAYROLL_ENABLED = readClientFlag();

export const SANDBOX_BLOCK_MESSAGE =
  "Sandbox mode — real payroll, ACH, and tax filing are disabled. A certified tax engine (Symmetry/Vertex/Avalara), Plaid + Modern Treasury production credentials, and a compliance reviewer are required before this can process real money.";

export const SANDBOX_BANNER_MESSAGE =
  "Sandbox mode — not for live payroll. Pay runs, ACH, and tax filing are disabled until vendor credentials and a compliance reviewer are in place.";

/**
 * Server-side guard. Throws a clear Error if production payroll is not enabled.
 * Call at the top of any server function that would move money, originate ACH,
 * file taxes, generate W-2/1099/941, or otherwise produce regulator-facing output.
 */
export function assertProductionPayrollEnabled(action: string): void {
  // Server reads process.env at request time; client reads VITE_ at build time.
  // Either being explicitly "true" enables; otherwise blocked.
  const serverFlag =
    typeof process !== "undefined" && process.env?.PRODUCTION_PAYROLL_ENABLED === "true";
  if (!serverFlag && !PRODUCTION_PAYROLL_ENABLED) {
    throw new Error(`${action} is disabled in sandbox. ${SANDBOX_BLOCK_MESSAGE}`);
  }
}
