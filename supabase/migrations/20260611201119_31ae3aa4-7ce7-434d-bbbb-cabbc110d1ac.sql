
-- 1. Departments master table
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX departments_company_name_unique
  ON public.departments (company_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view departments"
  ON public.departments FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins manage departments"
  ON public.departments FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]));

CREATE TRIGGER departments_set_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2. Employee FKs
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_location_id uuid REFERENCES public.work_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employees_department_id_idx ON public.employees(department_id);
CREATE INDEX IF NOT EXISTS employees_work_location_id_idx ON public.employees(work_location_id);

-- 3. Backfill departments from existing free-text values
INSERT INTO public.departments (company_id, name)
SELECT DISTINCT e.company_id, btrim(e.department)
  FROM public.employees e
 WHERE e.department IS NOT NULL
   AND btrim(e.department) <> ''
   AND e.company_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE public.employees e
   SET department_id = d.id
  FROM public.departments d
 WHERE d.company_id = e.company_id
   AND lower(d.name) = lower(btrim(e.department))
   AND e.department_id IS NULL
   AND e.department IS NOT NULL;

-- 4. Sync trigger: keep employees.department text in sync with department_id name
CREATE OR REPLACE FUNCTION public.tg_sync_employee_department_text()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_name text;
BEGIN
  IF NEW.department_id IS NULL THEN
    -- leave NEW.department as caller provided
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.department_id IS NOT DISTINCT FROM OLD.department_id THEN
    RETURN NEW;
  END IF;
  SELECT name INTO v_name FROM public.departments WHERE id = NEW.department_id;
  IF v_name IS NOT NULL THEN
    NEW.department := v_name;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS employees_sync_department_text ON public.employees;
CREATE TRIGGER employees_sync_department_text
  BEFORE INSERT OR UPDATE OF department_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_employee_department_text();

-- 5. When a department is renamed, propagate the new name to employees.department text
CREATE OR REPLACE FUNCTION public.tg_propagate_department_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.employees
       SET department = NEW.name
     WHERE department_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS departments_propagate_rename ON public.departments;
CREATE TRIGGER departments_propagate_rename
  AFTER UPDATE OF name ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.tg_propagate_department_rename();

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.departments;
