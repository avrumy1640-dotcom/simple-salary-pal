
-- =========================================================================
-- TEAMS
-- =========================================================================
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  color text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
CREATE INDEX idx_teams_company ON public.teams(company_id);

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, employee_id)
);
CREATE INDEX idx_team_members_team ON public.team_members(team_id);
CREATE INDEX idx_team_members_employee ON public.team_members(employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.teams TO service_role;
GRANT ALL ON public.team_members TO service_role;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY teams_admin_all ON public.teams FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]));
CREATE POLICY teams_member_read ON public.teams FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY team_members_admin_all ON public.team_members FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]));
CREATE POLICY team_members_self_read ON public.team_members FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id) OR public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER set_updated_at_teams BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER audit_teams AFTER INSERT OR UPDATE OR DELETE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();
CREATE TRIGGER audit_team_members AFTER INSERT OR UPDATE OR DELETE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

-- =========================================================================
-- EMERGENCY CONTACTS
-- =========================================================================
CREATE TABLE public.emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  name text NOT NULL,
  relationship text,
  phone text,
  email text,
  address text,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_emergency_contacts_employee ON public.emergency_contacts(employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.emergency_contacts TO authenticated;
GRANT ALL ON public.emergency_contacts TO service_role;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY emergency_admin_all ON public.emergency_contacts FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin','manager']::app_role[]));
CREATE POLICY emergency_self_all ON public.emergency_contacts FOR ALL TO authenticated
  USING (employee_id = public.current_employee_id(company_id))
  WITH CHECK (employee_id = public.current_employee_id(company_id));

CREATE TRIGGER set_updated_at_emergency_contacts BEFORE UPDATE ON public.emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER audit_emergency_contacts AFTER INSERT OR UPDATE OR DELETE ON public.emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

-- =========================================================================
-- EMPLOYEE ASSETS
-- =========================================================================
CREATE TYPE public.asset_condition AS ENUM ('new','good','fair','damaged','lost');

CREATE TABLE public.employee_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  name text NOT NULL,
  serial_number text,
  issued_on date,
  returned_on date,
  condition public.asset_condition NOT NULL DEFAULT 'good',
  value numeric(12,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_employee_assets_employee ON public.employee_assets(employee_id);
CREATE INDEX idx_employee_assets_company ON public.employee_assets(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_assets TO authenticated;
GRANT ALL ON public.employee_assets TO service_role;
ALTER TABLE public.employee_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY assets_admin_all ON public.employee_assets FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]));
CREATE POLICY assets_self_read ON public.employee_assets FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

CREATE TRIGGER set_updated_at_employee_assets BEFORE UPDATE ON public.employee_assets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER audit_employee_assets AFTER INSERT OR UPDATE OR DELETE ON public.employee_assets
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

-- =========================================================================
-- DIRECT DEPOSIT ACCOUNTS (split deposits)
-- =========================================================================
CREATE TYPE public.dd_account_type AS ENUM ('checking','savings');
CREATE TYPE public.dd_split_type AS ENUM ('percent','fixed','remainder');

CREATE TABLE public.direct_deposit_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  nickname text,
  account_type public.dd_account_type NOT NULL DEFAULT 'checking',
  bank_name text,
  routing_last4 text,
  account_last4 text,
  split_type public.dd_split_type NOT NULL DEFAULT 'remainder',
  split_value numeric(10,2),
  priority integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dd_split_value_check CHECK (
    (split_type = 'remainder' AND split_value IS NULL)
    OR (split_type = 'percent' AND split_value > 0 AND split_value <= 100)
    OR (split_type = 'fixed' AND split_value > 0)
  )
);
CREATE INDEX idx_dd_accounts_employee ON public.direct_deposit_accounts(employee_id);
-- Only one 'remainder' account per employee
CREATE UNIQUE INDEX idx_dd_one_remainder ON public.direct_deposit_accounts(employee_id)
  WHERE split_type = 'remainder' AND active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_deposit_accounts TO authenticated;
GRANT ALL ON public.direct_deposit_accounts TO service_role;
ALTER TABLE public.direct_deposit_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY dd_admin_all ON public.direct_deposit_accounts FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]));
CREATE POLICY dd_self_read ON public.direct_deposit_accounts FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

CREATE TRIGGER set_updated_at_dd_accounts BEFORE UPDATE ON public.direct_deposit_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER audit_dd_accounts AFTER INSERT OR UPDATE OR DELETE ON public.direct_deposit_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

-- =========================================================================
-- OFFBOARDING WORKFLOWS
-- =========================================================================
CREATE TABLE public.offboarding_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE public.offboarding_template_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.offboarding_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  is_required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  day_offset integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_off_tmpl_tasks_template ON public.offboarding_template_tasks(template_id);

CREATE TABLE public.offboarding_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.offboarding_templates(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  termination_date date NOT NULL,
  reason text,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'in_progress',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_off_assign_employee ON public.offboarding_assignments(employee_id);

CREATE TABLE public.offboarding_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.offboarding_assignments(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  due_date date,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.offboarding_templates(id) ON DELETE SET NULL,
  template_task_id uuid REFERENCES public.offboarding_template_tasks(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_off_tasks_employee ON public.offboarding_tasks(employee_id);
CREATE INDEX idx_off_tasks_assignment ON public.offboarding_tasks(assignment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offboarding_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offboarding_template_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offboarding_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offboarding_tasks TO authenticated;
GRANT ALL ON public.offboarding_templates TO service_role;
GRANT ALL ON public.offboarding_template_tasks TO service_role;
GRANT ALL ON public.offboarding_assignments TO service_role;
GRANT ALL ON public.offboarding_tasks TO service_role;

ALTER TABLE public.offboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offboarding_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offboarding_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offboarding_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY off_tmpl_admin_all ON public.offboarding_templates FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]));

CREATE POLICY off_tmpl_tasks_admin_all ON public.offboarding_template_tasks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.offboarding_templates t
                  WHERE t.id = template_id
                    AND public.has_any_role(auth.uid(), t.company_id, ARRAY['owner','admin','hr_admin']::app_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.offboarding_templates t
                       WHERE t.id = template_id
                         AND public.has_any_role(auth.uid(), t.company_id, ARRAY['owner','admin','hr_admin']::app_role[])));

CREATE POLICY off_assign_admin_all ON public.offboarding_assignments FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]));
CREATE POLICY off_assign_self_read ON public.offboarding_assignments FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

CREATE POLICY off_tasks_admin_all ON public.offboarding_tasks FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]));
CREATE POLICY off_tasks_self_read ON public.offboarding_tasks FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

CREATE TRIGGER set_updated_at_off_tmpl BEFORE UPDATE ON public.offboarding_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_off_tmpl_tasks BEFORE UPDATE ON public.offboarding_template_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_off_assign BEFORE UPDATE ON public.offboarding_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_off_tasks BEFORE UPDATE ON public.offboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER audit_off_assign AFTER INSERT OR UPDATE OR DELETE ON public.offboarding_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();
CREATE TRIGGER audit_off_tasks AFTER INSERT OR UPDATE OR DELETE ON public.offboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();
