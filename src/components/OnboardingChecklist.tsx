import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useMyEmployee } from "@/lib/useMyEmployee";
import {
  loadChecklist,
  dismissChecklist,
  markStepComplete,
  type ChecklistScope,
  type StepStatus,
} from "@/lib/onboarding-checklist";
import { onboardingTour } from "@/hooks/useOnboardingTour";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ChevronRight, PlayCircle, X, Sparkles } from "lucide-react";

interface Props {
  scope: ChecklistScope;
}

export function OnboardingChecklist({ scope }: Props) {
  const { currentId } = useCompany();
  const { employee } = useMyEmployee();
  const [userId, setUserId] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [dismissedAll, setDismissedAll] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (!userId || !currentId) return;
    setLoading(true);
    const result = await loadChecklist(scope, {
      userId,
      companyId: currentId,
      employeeId: employee?.id ?? null,
    });
    setSteps(result.steps);
    setDismissedAll(result.dismissedAll);
    setLoading(false);
  }, [userId, currentId, employee?.id, scope]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading || !userId || !currentId) return null;

  const total = steps.length;
  const completed = steps.filter((s) => s.done).length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

  if (dismissedAll || completed === total) return null;

  async function handleDismiss() {
    if (!userId || !currentId) return;
    await dismissChecklist({ userId, companyId: currentId, employeeId: employee?.id ?? null });
    setDismissedAll(true);
  }

  async function handleMarkDone(stepKey: string) {
    if (!userId || !currentId) return;
    await markStepComplete({ userId, companyId: currentId, employeeId: employee?.id ?? null }, stepKey);
    refresh();
  }

  function handleWalkthrough() {
    onboardingTour.start(scope, steps);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            <h2 className="font-display text-base font-extrabold text-slate-900">
              {scope === "employee" ? "Get started with Paylo" : "Set up your workspace"}
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {completed} of {total} done · {pct}% complete
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Dismiss checklist"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          onClick={handleWalkthrough}
          size="sm"
          className="h-9 bg-violet-600 text-white hover:bg-violet-700"
        >
          <PlayCircle className="mr-1.5 h-4 w-4" />
          Walk me through it
        </Button>
      </div>

      <ul className="mt-4 space-y-1.5">
        {steps.map((s) => (
          <li
            key={s.key}
            className={`flex items-center gap-3 rounded-lg px-2.5 py-2 transition ${
              s.done ? "opacity-60" : "hover:bg-slate-50"
            }`}
          >
            {s.done ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-slate-300" />
            )}
            <span
              className={`flex-1 truncate text-sm ${
                s.done ? "text-slate-500 line-through" : "font-medium text-slate-800"
              }`}
            >
              {s.title}
            </span>
            {!s.done && (
              <>
                <Link
                  to={s.to}
                  className="inline-flex items-center text-xs font-semibold text-violet-700 hover:text-violet-900"
                >
                  Open
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
                {s.key === "take_tour" && (
                  <button
                    onClick={() => handleMarkDone(s.key)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Done
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
