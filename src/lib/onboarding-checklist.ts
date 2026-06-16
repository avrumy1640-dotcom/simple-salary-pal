import { supabase } from "@/integrations/supabase/client";

export type ChecklistScope = "employee" | "manager";

export interface ChecklistStep {
  key: string;
  title: string;
  hint: string;
  to: string;
  // returns true if auto-completed based on data; null = no auto-detect
  detect: (ctx: DetectCtx) => Promise<boolean> | boolean;
}

export interface DetectCtx {
  userId: string;
  companyId: string;
  employeeId: string | null;
}

export interface StepStatus {
  key: string;
  title: string;
  hint: string;
  to: string;
  done: boolean;
  dismissed: boolean;
  autoDetected: boolean;
}

const employeeSteps: ChecklistStep[] = [
  {
    key: "sign_w4",
    title: "Sign your W-4",
    hint: "Open your tax profile and complete the W-4 form so we can withhold the right amount.",
    to: "/employee/tax-profile",
    detect: async ({ employeeId }) => {
      if (!employeeId) return false;
      const { data } = await supabase
        .from("hr_forms")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("form_type", "w4")
        .eq("status", "signed")
        .limit(1);
      return !!data?.length;
    },
  },
  {
    key: "sign_i9",
    title: "Sign your I-9",
    hint: "Verify your work eligibility — required within 3 days of your start date.",
    to: "/employee/onboarding",
    detect: async ({ employeeId }) => {
      if (!employeeId) return false;
      const { data } = await supabase
        .from("hr_forms")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("form_type", "i9")
        .eq("status", "signed")
        .limit(1);
      return !!data?.length;
    },
  },
  {
    key: "direct_deposit",
    title: "Add direct deposit",
    hint: "Connect your bank so your paycheck lands automatically. Skip to receive a paper check.",
    to: "/employee/profile",
    detect: async ({ employeeId }) => {
      if (!employeeId) return false;
      const { data } = await supabase
        .from("direct_deposit_accounts")
        .select("id")
        .eq("employee_id", employeeId)
        .limit(1);
      return !!data?.length;
    },
  },
  {
    key: "emergency_contact",
    title: "Add an emergency contact",
    hint: "Someone we should reach out to if anything happens at work.",
    to: "/employee/profile",
    detect: async ({ employeeId }) => {
      if (!employeeId) return false;
      const { data } = await supabase
        .from("emergency_contacts")
        .select("id")
        .eq("employee_id", employeeId)
        .limit(1);
      return !!data?.length;
    },
  },
  {
    key: "first_punch",
    title: "Submit your first time punch",
    hint: "Try the time clock. Tap Clock In on the home page when you start your shift.",
    to: "/employee/punch",
    detect: async ({ employeeId }) => {
      if (!employeeId) return false;
      const { data } = await supabase
        .from("time_clock_punches")
        .select("id")
        .eq("employee_id", employeeId)
        .limit(1);
      return !!data?.length;
    },
  },
  {
    key: "view_paystub",
    title: "Review a paystub",
    hint: "Open the Pay stubs section to see your earnings, taxes, and deductions.",
    to: "/employee/paystubs",
    detect: async ({ employeeId }) => {
      if (!employeeId) return false;
      const { data } = await supabase
        .from("payroll_items")
        .select("id")
        .eq("employee_id", employeeId)
        .limit(1);
      return !!data?.length;
    },
  },
  {
    key: "take_tour",
    title: "Take the product tour",
    hint: "You're done! Tap Finish to wrap up the walkthrough.",
    to: "/employee/home",
    detect: () => false,
  },
];

const managerSteps: ChecklistStep[] = [
  {
    key: "company_profile",
    title: "Complete your company profile",
    hint: "Add your legal name and federal EIN so tax filings are accurate.",
    to: "/app/settings",
    detect: async ({ companyId }) => {
      const { data } = await supabase
        .from("companies")
        .select("legal_name, ein")
        .eq("id", companyId)
        .maybeSingle();
      return !!(data?.legal_name && data?.ein);
    },
  },
  {
    key: "add_employee",
    title: "Add your first employee",
    hint: "Invite your team. You can add salaried, hourly, or contractor workers.",
    to: "/app/employees",
    detect: async ({ companyId, userId }) => {
      const { data } = await supabase
        .from("employees")
        .select("id, user_id")
        .eq("company_id", companyId)
        .neq("user_id", userId)
        .limit(1);
      return !!data?.length;
    },
  },
  {
    key: "pay_schedule",
    title: "Set up a pay schedule",
    hint: "Pick weekly, bi-weekly, semi-monthly, or monthly so payroll runs on time.",
    to: "/app/settings",
    detect: async ({ companyId }) => {
      const { data } = await supabase
        .from("pay_schedules")
        .select("id")
        .eq("company_id", companyId)
        .limit(1);
      return !!data?.length;
    },
  },
  {
    key: "tax_setup",
    title: "Configure state tax accounts",
    hint: "Add your state withholding and unemployment IDs for accurate filings.",
    to: "/app/tax-filing",
    detect: async ({ companyId }) => {
      const { data } = await supabase
        .from("state_employer_taxes")
        .select("id")
        .eq("company_id", companyId)
        .limit(1);
      return !!data?.length;
    },
  },
  {
    key: "run_first_payroll",
    title: "Run your first payroll",
    hint: "Review hours, approve, and pay. We'll handle taxes and filings.",
    to: "/app/payroll",
    detect: async ({ companyId }) => {
      const { data } = await supabase
        .from("payroll_runs")
        .select("id")
        .eq("company_id", companyId)
        .eq("status", "paid")
        .limit(1);
      return !!data?.length;
    },
  },
  {
    key: "invite_team",
    title: "Invite a teammate or manager",
    hint: "Add another admin or manager so you're not the only one with the keys.",
    to: "/app/users",
    detect: async ({ companyId }) => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("company_id", companyId);
      const unique = new Set((data ?? []).map((r: any) => r.user_id));
      return unique.size >= 2;
    },
  },
  {
    key: "take_tour",
    title: "Finish the walkthrough",
    hint: "You've made it. Tap Finish to close the tour — you can always reopen it from the dashboard.",
    to: "/app/dashboard",
    detect: () => false,
  },
];

export function getStepCatalog(scope: ChecklistScope): ChecklistStep[] {
  return scope === "employee" ? employeeSteps : managerSteps;
}

export async function loadChecklist(
  scope: ChecklistScope,
  ctx: DetectCtx,
): Promise<{ steps: StepStatus[]; dismissedAll: boolean }> {
  const catalog = getStepCatalog(scope);
  const { data: saved } = await supabase
    .from("user_onboarding_progress")
    .select("step_key, completed_at, dismissed_at")
    .eq("user_id", ctx.userId)
    .eq("company_id", ctx.companyId);

  const savedMap = new Map<string, { completed: boolean; dismissed: boolean }>();
  let dismissedAll = false;
  for (const row of saved ?? []) {
    if (row.step_key === "__checklist__") {
      dismissedAll = !!row.dismissed_at;
      continue;
    }
    savedMap.set(row.step_key, {
      completed: !!row.completed_at,
      dismissed: !!row.dismissed_at,
    });
  }

  const steps: StepStatus[] = [];
  for (const step of catalog) {
    const savedRow = savedMap.get(step.key);
    let autoDone = false;
    if (!savedRow?.completed) {
      try {
        autoDone = await step.detect(ctx);
      } catch {
        autoDone = false;
      }
    }
    const done = savedRow?.completed || autoDone;
    if (autoDone && !savedRow?.completed) {
      // Persist auto-completion so progress survives
      void supabase.from("user_onboarding_progress").upsert({
        user_id: ctx.userId,
        company_id: ctx.companyId,
        step_key: step.key,
        completed_at: new Date().toISOString(),
      });
    }
    steps.push({
      key: step.key,
      title: step.title,
      hint: step.hint,
      to: step.to,
      done,
      dismissed: !!savedRow?.dismissed,
      autoDetected: autoDone && !savedRow?.completed,
    });
  }

  return { steps, dismissedAll };
}

export async function markStepComplete(
  ctx: DetectCtx,
  stepKey: string,
): Promise<void> {
  await supabase.from("user_onboarding_progress").upsert({
    user_id: ctx.userId,
    company_id: ctx.companyId,
    step_key: stepKey,
    completed_at: new Date().toISOString(),
  });
}

export async function markStepDismissed(
  ctx: DetectCtx,
  stepKey: string,
): Promise<void> {
  await supabase.from("user_onboarding_progress").upsert({
    user_id: ctx.userId,
    company_id: ctx.companyId,
    step_key: stepKey,
    dismissed_at: new Date().toISOString(),
  });
}

export async function dismissChecklist(ctx: DetectCtx): Promise<void> {
  await supabase.from("user_onboarding_progress").upsert({
    user_id: ctx.userId,
    company_id: ctx.companyId,
    step_key: "__checklist__",
    dismissed_at: new Date().toISOString(),
  });
}

export async function reopenChecklist(ctx: DetectCtx): Promise<void> {
  await supabase
    .from("user_onboarding_progress")
    .delete()
    .eq("user_id", ctx.userId)
    .eq("company_id", ctx.companyId)
    .eq("step_key", "__checklist__");
}
