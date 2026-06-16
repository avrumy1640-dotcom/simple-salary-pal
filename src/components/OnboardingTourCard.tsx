import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { useOnboardingTour, onboardingTour } from "@/hooks/useOnboardingTour";
import { markStepDismissed, markStepComplete } from "@/lib/onboarding-checklist";
import { X, ChevronRight, SkipForward } from "lucide-react";

export function OnboardingTourCard() {
  const tour = useOnboardingTour();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { currentId } = useCompany();
  const { employee } = useMyEmployee();

  const current = tour.active ? tour.steps[tour.stepIndex] : null;

  // Navigate to the step's destination when it changes
  useEffect(() => {
    if (!current) return;
    if (pathname !== current.to) {
      navigate({ to: current.to });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key]);

  if (!tour.active || !current) return null;

  const total = tour.steps.length;
  const idx = tour.stepIndex + 1;

  async function getCtx() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !currentId) return null;
    return { userId: user.id, companyId: currentId, employeeId: employee?.id ?? null };
  }

  async function handleSkip() {
    const ctx = await getCtx();
    if (ctx && current) await markStepDismissed(ctx, current.key);
    onboardingTour.next();
  }

  async function handleNext() {
    const ctx = await getCtx();
    if (ctx && current && current.key === "take_tour") {
      await markStepComplete(ctx, current.key);
    }
    onboardingTour.next();
  }

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] max-w-sm sm:w-[22rem]">
      <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl ring-1 ring-violet-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
              Step {idx} of {total}
            </div>
            <div className="mt-1 font-display text-sm font-extrabold text-slate-900">
              {current.title}
            </div>
          </div>
          <button
            onClick={() => onboardingTour.stop()}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-slate-600">{current.hint}</p>

        <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-500 transition-all"
            style={{ width: `${(idx / total) * 100}%` }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            onClick={handleSkip}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            <SkipForward className="h-3.5 w-3.5" />
            Skip
          </button>
          <button
            onClick={handleNext}
            className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700"
          >
            {idx === total ? "Finish" : "Next step"}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
