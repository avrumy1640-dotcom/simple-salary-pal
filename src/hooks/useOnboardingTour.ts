import { useSyncExternalStore } from "react";
import type { StepStatus } from "@/lib/onboarding-checklist";

export interface TourState {
  active: boolean;
  scope: "employee" | "manager" | null;
  steps: StepStatus[];
  stepIndex: number;
}

let state: TourState = {
  active: false,
  scope: null,
  steps: [],
  stepIndex: 0,
};

const listeners = new Set<() => void>();

function setState(next: Partial<TourState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return state;
}

export function useOnboardingTour() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const onboardingTour = {
  start(scope: "employee" | "manager", steps: StepStatus[]) {
    const remaining = steps.filter((s) => !s.done && !s.dismissed);
    if (remaining.length === 0) return;
    setState({ active: true, scope, steps: remaining, stepIndex: 0 });
  },
  next() {
    const idx = state.stepIndex + 1;
    if (idx >= state.steps.length) {
      onboardingTour.stop();
      return;
    }
    setState({ stepIndex: idx });
  },
  prev() {
    if (state.stepIndex > 0) setState({ stepIndex: state.stepIndex - 1 });
  },
  stop() {
    setState({ active: false, steps: [], stepIndex: 0, scope: null });
  },
};
