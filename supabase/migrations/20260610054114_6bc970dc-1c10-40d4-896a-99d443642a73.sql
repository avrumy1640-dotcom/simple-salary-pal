
DO $$ BEGIN CREATE TYPE public.job_status AS ENUM ('draft','open','on_hold','closed','filled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.candidate_stage AS ENUM ('applied','screening','interview','final','offer','hired','rejected','withdrawn'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.interview_mode AS ENUM ('phone','video','onsite'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.interview_status AS ENUM ('scheduled','completed','no_show','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.review_cycle_status AS ENUM ('draft','active','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.review_status AS ENUM ('not_started','in_progress','submitted','acknowledged'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.goal_status AS ENUM ('not_started','on_track','at_risk','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  title TEXT NOT NULL, department TEXT, location TEXT, employment_type TEXT,
  salary_min NUMERIC, salary_max NUMERIC, salary_currency TEXT DEFAULT 'USD',
  description TEXT, requirements TEXT,
  status public.job_status NOT NULL DEFAULT 'draft',
  public_slug TEXT UNIQUE, opened_at TIMESTAMPTZ, closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_postings TO authenticated;
GRANT ALL ON public.job_postings TO service_role;
GRANT SELECT ON public.job_postings TO anon;
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view jobs" ON public.job_postings FOR SELECT TO authenticated USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "public open jobs readable" ON public.job_postings FOR SELECT TO anon USING (status = 'open');
CREATE POLICY "recruiters manage jobs" ON public.job_postings FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','recruiter']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','recruiter']::app_role[]));
CREATE INDEX idx_job_postings_company ON public.job_postings(company_id);
CREATE TRIGGER trg_job_postings_updated BEFORE UPDATE ON public.job_postings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_posting_id UUID REFERENCES public.job_postings(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  email TEXT, phone TEXT, resume_url TEXT, linkedin_url TEXT, source TEXT,
  current_stage public.candidate_stage NOT NULL DEFAULT 'applied',
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rejected_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view candidates" ON public.candidates FOR SELECT TO authenticated USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "recruiters manage candidates" ON public.candidates FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','recruiter']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','recruiter']::app_role[]));
CREATE INDEX idx_candidates_company ON public.candidates(company_id);
CREATE INDEX idx_candidates_stage ON public.candidates(current_stage);
CREATE TRIGGER trg_candidates_updated BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.candidate_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_notes TO authenticated;
GRANT ALL ON public.candidate_notes TO service_role;
ALTER TABLE public.candidate_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view candidate notes" ON public.candidate_notes FOR SELECT TO authenticated USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "recruiters manage candidate notes" ON public.candidate_notes FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','recruiter']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','recruiter']::app_role[]));

CREATE TABLE IF NOT EXISTS public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  interviewer_id UUID REFERENCES auth.users(id),
  round SMALLINT NOT NULL DEFAULT 1,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes SMALLINT NOT NULL DEFAULT 60,
  mode public.interview_mode NOT NULL DEFAULT 'video',
  location_or_link TEXT,
  status public.interview_status NOT NULL DEFAULT 'scheduled',
  feedback_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviews TO authenticated;
GRANT ALL ON public.interviews TO service_role;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view interviews" ON public.interviews FOR SELECT TO authenticated USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "staff manage interviews" ON public.interviews FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','recruiter','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','recruiter','manager']::app_role[]));
CREATE INDEX idx_interviews_candidate ON public.interviews(candidate_id);
CREATE TRIGGER trg_interviews_updated BEFORE UPDATE ON public.interviews FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.interview_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id),
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendation TEXT CHECK (recommendation IN ('strong_yes','yes','no','strong_no')),
  strengths TEXT, concerns TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_scorecards TO authenticated;
GRANT ALL ON public.interview_scorecards TO service_role;
ALTER TABLE public.interview_scorecards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view scorecards" ON public.interview_scorecards FOR SELECT TO authenticated USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "reviewers manage scorecards" ON public.interview_scorecards FOR ALL TO authenticated
  USING (reviewer_id = auth.uid() OR public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','recruiter']::app_role[]))
  WITH CHECK (reviewer_id = auth.uid() OR public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','recruiter']::app_role[]));

CREATE TABLE IF NOT EXISTS public.onboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  target_department TEXT, target_role TEXT,
  default_duration_days SMALLINT NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_templates TO authenticated;
GRANT ALL ON public.onboarding_templates TO service_role;
ALTER TABLE public.onboarding_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view onboarding templates" ON public.onboarding_templates FOR SELECT TO authenticated USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "hr manage onboarding templates" ON public.onboarding_templates FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]));
CREATE TRIGGER trg_onb_templates_updated BEFORE UPDATE ON public.onboarding_templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.onboarding_template_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.onboarding_templates(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT, category TEXT,
  day_offset SMALLINT NOT NULL DEFAULT 0,
  assignee_role TEXT,
  is_required BOOLEAN NOT NULL DEFAULT true,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_template_tasks TO authenticated;
GRANT ALL ON public.onboarding_template_tasks TO service_role;
ALTER TABLE public.onboarding_template_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view template tasks" ON public.onboarding_template_tasks FOR SELECT TO authenticated USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "hr manage template tasks" ON public.onboarding_template_tasks FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]));

CREATE TABLE IF NOT EXISTS public.performance_review_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  period_start DATE NOT NULL, period_end DATE NOT NULL, due_date DATE,
  status public.review_cycle_status NOT NULL DEFAULT 'draft',
  include_self_review BOOLEAN NOT NULL DEFAULT true,
  include_peer_review BOOLEAN NOT NULL DEFAULT false,
  include_upward_review BOOLEAN NOT NULL DEFAULT false,
  rubric JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_review_cycles TO authenticated;
GRANT ALL ON public.performance_review_cycles TO service_role;
ALTER TABLE public.performance_review_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view cycles" ON public.performance_review_cycles FOR SELECT TO authenticated USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "hr manage cycles" ON public.performance_review_cycles FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]));
CREATE TRIGGER trg_cycles_updated BEFORE UPDATE ON public.performance_review_cycles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES public.performance_review_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES auth.users(id),
  review_type TEXT NOT NULL DEFAULT 'manager',
  status public.review_status NOT NULL DEFAULT 'not_started',
  overall_rating NUMERIC(3,1),
  ratings JSONB NOT NULL DEFAULT '{}'::jsonb,
  strengths TEXT, improvements TEXT, comments TEXT,
  submitted_at TIMESTAMPTZ, acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_reviews TO authenticated;
GRANT ALL ON public.performance_reviews TO service_role;
ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view reviews" ON public.performance_reviews FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND (
    reviewer_id = auth.uid()
    OR public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[])
  ));
CREATE POLICY "reviewer or hr write reviews" ON public.performance_reviews FOR ALL TO authenticated
  USING (reviewer_id = auth.uid() OR public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]))
  WITH CHECK (reviewer_id = auth.uid() OR public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]));
CREATE INDEX idx_reviews_cycle ON public.performance_reviews(cycle_id);
CREATE INDEX idx_reviews_employee ON public.performance_reviews(employee_id);
CREATE TRIGGER trg_reviews_updated BEFORE UPDATE ON public.performance_reviews FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.performance_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  parent_goal_id UUID REFERENCES public.performance_goals(id) ON DELETE SET NULL,
  title TEXT NOT NULL, description TEXT, category TEXT,
  target_date DATE,
  progress_pct SMALLINT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  status public.goal_status NOT NULL DEFAULT 'not_started',
  weight NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_goals TO authenticated;
GRANT ALL ON public.performance_goals TO service_role;
ALTER TABLE public.performance_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view goals" ON public.performance_goals FOR SELECT TO authenticated USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "hr managers manage goals" ON public.performance_goals FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]));
CREATE INDEX idx_goals_employee ON public.performance_goals(employee_id);
CREATE TRIGGER trg_goals_updated BEFORE UPDATE ON public.performance_goals FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
