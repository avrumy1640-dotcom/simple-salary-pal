import { AlertTriangle } from "lucide-react";
import { PRODUCTION_PAYROLL_ENABLED, SANDBOX_BANNER_MESSAGE } from "@/lib/sandbox";

/**
 * Renders a persistent banner when the app is in sandbox mode (default).
 * Hidden when VITE_PRODUCTION_PAYROLL_ENABLED=true.
 */
export function SandboxBanner() {
  if (PRODUCTION_PAYROLL_ENABLED) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:text-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="leading-snug">
        <span className="font-semibold">Sandbox mode.</span> {SANDBOX_BANNER_MESSAGE}
      </p>
    </div>
  );
}
