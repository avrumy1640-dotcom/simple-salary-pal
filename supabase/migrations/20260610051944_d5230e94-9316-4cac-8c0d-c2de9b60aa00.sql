-- Extend app_role enum with the 5 missing enterprise roles.
-- Existing values: owner, admin, payroll_admin, hr_admin, manager, employee
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'recruiter';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'benefits_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'auditor';