// Symmetry Tax Engine adapter. Read API key inside handler only.
// While SYMMETRY_API_KEY is unset, returns { ok: false } so callers fall back
// to the internal calc engine in src/lib/payroll.ts.

export interface SymmetryWithholdingInput {
  grossWages: number;
  payPeriodsPerYear: number;
  state: string;
  filingStatus: string;
  dependents: number;
  extraWithholding: number;
  ytdGross: number;
}

export interface SymmetryWithholdingResult {
  federal: number;
  state: number;
  socialSecurity: number;
  medicare: number;
  local?: number;
}

export async function computeWithholding(
  input: SymmetryWithholdingInput
): Promise<{ ok: true; data: SymmetryWithholdingResult } | { ok: false; reason: string }> {
  const key = process.env.SYMMETRY_API_KEY;
  if (!key) return { ok: false, reason: "SYMMETRY_API_KEY not configured" };
  // TODO: Real Symmetry REST call goes here.
  // const res = await fetch("https://api.symmetry.com/...", { headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify(input) });
  return { ok: false, reason: "Symmetry adapter not yet implemented" };
}
