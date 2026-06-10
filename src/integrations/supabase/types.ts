export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          company_id: string
          created_at: string
          id: string
          pinned: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: Database["public"]["Enums"]["announcement_audience"]
          audience_filter: Json
          author_id: string
          body: string
          company_id: string
          created_at: string
          expire_at: string | null
          id: string
          pinned: boolean
          priority: Database["public"]["Enums"]["announcement_priority"]
          publish_at: string | null
          published_at: string | null
          status: Database["public"]["Enums"]["announcement_status"]
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          audience_filter?: Json
          author_id: string
          body: string
          company_id: string
          created_at?: string
          expire_at?: string | null
          id?: string
          pinned?: boolean
          priority?: Database["public"]["Enums"]["announcement_priority"]
          publish_at?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["announcement_status"]
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          audience_filter?: Json
          author_id?: string
          body?: string
          company_id?: string
          created_at?: string
          expire_at?: string | null
          id?: string
          pinned?: boolean
          priority?: Database["public"]["Enums"]["announcement_priority"]
          publish_at?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["announcement_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          after: Json | null
          before: Json | null
          company_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip: string | null
          occurred_at: string
          user_agent: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          company_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: string | null
          occurred_at?: string
          user_agent?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          company_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: string | null
          occurred_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_connections: {
        Row: {
          account_id: string | null
          account_mask: string | null
          account_name: string | null
          account_subtype: string | null
          account_type: string | null
          company_id: string
          contractor_id: string | null
          created_at: string
          employee_id: string | null
          id: string
          institution_name: string | null
          is_company: boolean
          linked_at: string
          owner_id: string
          plaid_access_token: string | null
          plaid_item_id: string | null
          provider: string
          routing_number_last4: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          account_mask?: string | null
          account_name?: string | null
          account_subtype?: string | null
          account_type?: string | null
          company_id: string
          contractor_id?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          institution_name?: string | null
          is_company?: boolean
          linked_at?: string
          owner_id: string
          plaid_access_token?: string | null
          plaid_item_id?: string | null
          provider?: string
          routing_number_last4?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          account_mask?: string | null
          account_name?: string | null
          account_subtype?: string | null
          account_type?: string | null
          company_id?: string
          contractor_id?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          institution_name?: string | null
          is_company?: boolean
          linked_at?: string
          owner_id?: string
          plaid_access_token?: string | null
          plaid_item_id?: string | null
          provider?: string
          routing_number_last4?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connections_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connections_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_enrollments: {
        Row: {
          beneficiary_name: string | null
          company_id: string
          coverage_tier: Database["public"]["Enums"]["benefit_coverage_tier"]
          created_at: string
          dependent_count: number
          effective_date: string
          employee_id: string
          employee_monthly_cost: number
          employer_monthly_cost: number
          end_date: string | null
          id: string
          notes: string | null
          plan_id: string
          status: Database["public"]["Enums"]["benefit_enrollment_status"]
          updated_at: string
        }
        Insert: {
          beneficiary_name?: string | null
          company_id: string
          coverage_tier?: Database["public"]["Enums"]["benefit_coverage_tier"]
          created_at?: string
          dependent_count?: number
          effective_date?: string
          employee_id: string
          employee_monthly_cost?: number
          employer_monthly_cost?: number
          end_date?: string | null
          id?: string
          notes?: string | null
          plan_id: string
          status?: Database["public"]["Enums"]["benefit_enrollment_status"]
          updated_at?: string
        }
        Update: {
          beneficiary_name?: string | null
          company_id?: string
          coverage_tier?: Database["public"]["Enums"]["benefit_coverage_tier"]
          created_at?: string
          dependent_count?: number
          effective_date?: string
          employee_id?: string
          employee_monthly_cost?: number
          employer_monthly_cost?: number
          end_date?: string | null
          id?: string
          notes?: string | null
          plan_id?: string
          status?: Database["public"]["Enums"]["benefit_enrollment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_enrollments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_enrollments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_enrollments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "benefit_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_plans: {
        Row: {
          carrier: string | null
          company_id: string
          created_at: string
          deductible: number | null
          description: string | null
          effective_from: string | null
          effective_to: string | null
          employer_contribution_flat: number
          employer_contribution_pct: number
          id: string
          is_active: boolean
          metadata: Json
          monthly_premium_employee: number
          monthly_premium_employee_children: number
          monthly_premium_employee_spouse: number
          monthly_premium_family: number
          name: string
          network: string | null
          out_of_pocket_max: number | null
          plan_type: Database["public"]["Enums"]["benefit_plan_type"]
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          company_id: string
          created_at?: string
          deductible?: number | null
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          employer_contribution_flat?: number
          employer_contribution_pct?: number
          id?: string
          is_active?: boolean
          metadata?: Json
          monthly_premium_employee?: number
          monthly_premium_employee_children?: number
          monthly_premium_employee_spouse?: number
          monthly_premium_family?: number
          name: string
          network?: string | null
          out_of_pocket_max?: number | null
          plan_type: Database["public"]["Enums"]["benefit_plan_type"]
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          company_id?: string
          created_at?: string
          deductible?: number | null
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          employer_contribution_flat?: number
          employer_contribution_pct?: number
          id?: string
          is_active?: boolean
          metadata?: Json
          monthly_premium_employee?: number
          monthly_premium_employee_children?: number
          monthly_premium_employee_spouse?: number
          monthly_premium_family?: number
          name?: string
          network?: string | null
          out_of_pocket_max?: number | null
          plan_type?: Database["public"]["Enums"]["benefit_plan_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_notes: {
        Row: {
          author_id: string
          candidate_id: string
          company_id: string
          created_at: string
          id: string
          note: string
        }
        Insert: {
          author_id: string
          candidate_id: string
          company_id: string
          created_at?: string
          id?: string
          note: string
        }
        Update: {
          author_id?: string
          candidate_id?: string
          company_id?: string
          created_at?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_notes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          applied_at: string
          company_id: string
          created_at: string
          current_stage: Database["public"]["Enums"]["candidate_stage"]
          email: string | null
          first_name: string
          id: string
          job_posting_id: string | null
          last_name: string
          linkedin_url: string | null
          phone: string | null
          rating: number | null
          rejected_reason: string | null
          resume_url: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          applied_at?: string
          company_id: string
          created_at?: string
          current_stage?: Database["public"]["Enums"]["candidate_stage"]
          email?: string | null
          first_name: string
          id?: string
          job_posting_id?: string | null
          last_name: string
          linkedin_url?: string | null
          phone?: string | null
          rating?: number | null
          rejected_reason?: string | null
          resume_url?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          applied_at?: string
          company_id?: string
          created_at?: string
          current_stage?: Database["public"]["Enums"]["candidate_stage"]
          email?: string | null
          first_name?: string
          id?: string
          job_posting_id?: string | null
          last_name?: string
          linkedin_url?: string | null
          phone?: string | null
          rating?: number | null
          rejected_reason?: string | null
          resume_url?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_job_posting_id_fkey"
            columns: ["job_posting_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string
          dba: string | null
          default_pay_frequency:
            | Database["public"]["Enums"]["pay_frequency"]
            | null
          double_overtime_threshold_hours: number | null
          ein: string | null
          email: string | null
          holiday_pay_multiplier: number | null
          id: string
          legal_name: string
          overtime_threshold_hours: number | null
          owner_id: string
          phone: string | null
          postal_code: string | null
          state: string | null
          state_unemployment_rate: number | null
          state_unemployment_wage_base: number | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          dba?: string | null
          default_pay_frequency?:
            | Database["public"]["Enums"]["pay_frequency"]
            | null
          double_overtime_threshold_hours?: number | null
          ein?: string | null
          email?: string | null
          holiday_pay_multiplier?: number | null
          id?: string
          legal_name: string
          overtime_threshold_hours?: number | null
          owner_id: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          state_unemployment_rate?: number | null
          state_unemployment_wage_base?: number | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          dba?: string | null
          default_pay_frequency?:
            | Database["public"]["Enums"]["pay_frequency"]
            | null
          double_overtime_threshold_hours?: number | null
          ein?: string | null
          email?: string | null
          holiday_pay_multiplier?: number | null
          id?: string
          legal_name?: string
          overtime_threshold_hours?: number | null
          owner_id?: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          state_unemployment_rate?: number | null
          state_unemployment_wage_base?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          business_address: string | null
          business_city: string | null
          business_state: string | null
          business_zip: string | null
          company_id: string
          created_at: string
          ein: string | null
          id: string
          legal_name: string | null
          next_pay_date: string | null
          onboarding_complete: boolean
          owner_id: string
          pay_frequency: string
          state_tax_id: string | null
          updated_at: string
        }
        Insert: {
          business_address?: string | null
          business_city?: string | null
          business_state?: string | null
          business_zip?: string | null
          company_id: string
          created_at?: string
          ein?: string | null
          id?: string
          legal_name?: string | null
          next_pay_date?: string | null
          onboarding_complete?: boolean
          owner_id: string
          pay_frequency?: string
          state_tax_id?: string | null
          updated_at?: string
        }
        Update: {
          business_address?: string | null
          business_city?: string | null
          business_state?: string | null
          business_zip?: string | null
          company_id?: string
          created_at?: string
          ein?: string | null
          id?: string
          legal_name?: string | null
          next_pay_date?: string | null
          onboarding_complete?: boolean
          owner_id?: string
          pay_frequency?: string
          state_tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_users: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          is_default: boolean
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_default?: boolean
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_default?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_alerts: {
        Row: {
          alert_type: Database["public"]["Enums"]["compliance_alert_type"]
          company_id: string
          created_at: string
          description: string | null
          due_date: string | null
          employee_id: string | null
          id: string
          metadata: Json
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["compliance_severity"]
          status: Database["public"]["Enums"]["compliance_alert_status"]
          title: string
          updated_at: string
        }
        Insert: {
          alert_type: Database["public"]["Enums"]["compliance_alert_type"]
          company_id: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          employee_id?: string | null
          id?: string
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["compliance_severity"]
          status?: Database["public"]["Enums"]["compliance_alert_status"]
          title: string
          updated_at?: string
        }
        Update: {
          alert_type?: Database["public"]["Enums"]["compliance_alert_type"]
          company_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          employee_id?: string | null
          id?: string
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["compliance_severity"]
          status?: Database["public"]["Enums"]["compliance_alert_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_alerts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_records: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          doc_type: Database["public"]["Enums"]["compliance_doc_type"]
          employee_id: string
          expires_at: string | null
          file_path: string | null
          id: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          doc_type: Database["public"]["Enums"]["compliance_doc_type"]
          employee_id: string
          expires_at?: string | null
          file_path?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          doc_type?: Database["public"]["Enums"]["compliance_doc_type"]
          employee_id?: string
          expires_at?: string | null
          file_path?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_payments: {
        Row: {
          amount: number
          category: string | null
          company_id: string
          contractor_id: string
          contractor_name: string
          created_at: string
          description: string | null
          id: string
          owner_id: string
          payment_date: string
          payment_method: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string | null
          company_id: string
          contractor_id: string
          contractor_name: string
          created_at?: string
          description?: string | null
          id?: string
          owner_id: string
          payment_date?: string
          payment_method?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          company_id?: string
          contractor_id?: string
          contractor_name?: string
          created_at?: string
          description?: string | null
          id?: string
          owner_id?: string
          payment_date?: string
          payment_method?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_payments_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          bank_account_last4: string | null
          bank_routing_last4: string | null
          business_name: string | null
          city: string | null
          company_id: string
          created_at: string
          email: string | null
          full_name: string
          geocoded_address: string | null
          hourly_rate: number | null
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          owner_id: string
          payment_method: string | null
          phone: string | null
          state: string | null
          status: string
          tax_id_last4: string | null
          tax_id_type: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          bank_account_last4?: string | null
          bank_routing_last4?: string | null
          business_name?: string | null
          city?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          full_name: string
          geocoded_address?: string | null
          hourly_rate?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          owner_id: string
          payment_method?: string | null
          phone?: string | null
          state?: string | null
          status?: string
          tax_id_last4?: string | null
          tax_id_type?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          bank_account_last4?: string | null
          bank_routing_last4?: string | null
          business_name?: string | null
          city?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          geocoded_address?: string | null
          hourly_rate?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          owner_id?: string
          payment_method?: string | null
          phone?: string | null
          state?: string | null
          status?: string
          tax_id_last4?: string | null
          tax_id_type?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      deductions: {
        Row: {
          active: boolean
          amount: number
          amount_type: string
          category: string
          company_id: string
          created_at: string
          employee_id: string
          id: string
          name: string
          owner_id: string
          pre_tax: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number
          amount_type?: string
          category?: string
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          name: string
          owner_id: string
          pre_tax?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          amount_type?: string
          category?: string
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          name?: string
          owner_id?: string
          pre_tax?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deductions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deductions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          bank_account_last4: string | null
          bank_account_type: string | null
          bank_routing_last4: string | null
          city: string | null
          company_id: string
          created_at: string
          date_of_birth: string | null
          dependents: number
          direct_deposit_enabled: boolean
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          extra_withholding: number
          federal_allowances: number
          filing_status: string | null
          full_name: string
          geocoded_address: string | null
          id: string
          job_title: string | null
          latitude: number | null
          longitude: number | null
          owner_id: string
          pay_rate: number
          pay_type: string
          phone: string | null
          pto_accrual_per_period: number
          pto_balance_hours: number
          ssn_last4: string | null
          start_date: string | null
          state: string | null
          status: string
          updated_at: string
          user_id: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          bank_account_last4?: string | null
          bank_account_type?: string | null
          bank_routing_last4?: string | null
          city?: string | null
          company_id: string
          created_at?: string
          date_of_birth?: string | null
          dependents?: number
          direct_deposit_enabled?: boolean
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          extra_withholding?: number
          federal_allowances?: number
          filing_status?: string | null
          full_name: string
          geocoded_address?: string | null
          id?: string
          job_title?: string | null
          latitude?: number | null
          longitude?: number | null
          owner_id: string
          pay_rate?: number
          pay_type?: string
          phone?: string | null
          pto_accrual_per_period?: number
          pto_balance_hours?: number
          ssn_last4?: string | null
          start_date?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          bank_account_last4?: string | null
          bank_account_type?: string | null
          bank_routing_last4?: string | null
          city?: string | null
          company_id?: string
          created_at?: string
          date_of_birth?: string | null
          dependents?: number
          direct_deposit_enabled?: boolean
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          extra_withholding?: number
          federal_allowances?: number
          filing_status?: string | null
          full_name?: string
          geocoded_address?: string | null
          id?: string
          job_title?: string | null
          latitude?: number | null
          longitude?: number | null
          owner_id?: string
          pay_rate?: number
          pay_type?: string
          phone?: string | null
          pto_accrual_per_period?: number
          pto_balance_hours?: number
          ssn_last4?: string | null
          start_date?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employer_tax_liabilities: {
        Row: {
          company_id: string
          created_at: string
          employer_medicare: number
          employer_ss: number
          futa: number
          id: string
          run_id: string
          suta: number
          total: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          employer_medicare?: number
          employer_ss?: number
          futa?: number
          id?: string
          run_id: string
          suta?: number
          total?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          employer_medicare?: number
          employer_ss?: number
          futa?: number
          id?: string
          run_id?: string
          suta?: number
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employer_tax_liabilities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employer_tax_liabilities_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      field_visits: {
        Row: {
          address: string | null
          company_id: string
          contractor_id: string | null
          created_at: string
          duration_minutes: number | null
          employee_id: string | null
          ended_at: string | null
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
          visit_label: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          contractor_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          employee_id?: string | null
          ended_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          visit_label?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          contractor_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          employee_id?: string | null
          ended_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          visit_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_visits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visits_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      garnishments: {
        Row: {
          amount: number
          amount_type: string
          cap_percentage: number | null
          company_id: string
          court_order_ref: string | null
          created_at: string
          employee_id: string
          end_date: string | null
          garnishment_type: Database["public"]["Enums"]["garnishment_type"]
          id: string
          is_active: boolean
          notes: string | null
          payee_address: string | null
          payee_name: string | null
          priority: number
          remaining_balance: number | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          amount_type?: string
          cap_percentage?: number | null
          company_id: string
          court_order_ref?: string | null
          created_at?: string
          employee_id: string
          end_date?: string | null
          garnishment_type: Database["public"]["Enums"]["garnishment_type"]
          id?: string
          is_active?: boolean
          notes?: string | null
          payee_address?: string | null
          payee_name?: string | null
          priority?: number
          remaining_balance?: number | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_type?: string
          cap_percentage?: number | null
          company_id?: string
          court_order_ref?: string | null
          created_at?: string
          employee_id?: string
          end_date?: string | null
          garnishment_type?: Database["public"]["Enums"]["garnishment_type"]
          id?: string
          is_active?: boolean
          notes?: string | null
          payee_address?: string | null
          payee_name?: string | null
          priority?: number
          remaining_balance?: number | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "garnishments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garnishments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      handbook_acknowledgments: {
        Row: {
          acknowledged_at: string
          company_id: string
          document_id: string | null
          document_title: string
          employee_id: string
          id: string
          ip: string | null
          user_agent: string | null
          version: string | null
        }
        Insert: {
          acknowledged_at?: string
          company_id: string
          document_id?: string | null
          document_title: string
          employee_id: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          version?: string | null
        }
        Update: {
          acknowledged_at?: string
          company_id?: string
          document_id?: string | null
          document_title?: string
          employee_id?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handbook_acknowledgments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handbook_acknowledgments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "hr_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handbook_acknowledgments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_document_signatures: {
        Row: {
          company_id: string | null
          created_at: string
          document_id: string
          event_at: string
          id: string
          note: string | null
          signature_data: string | null
          signature_ip: string | null
          signature_user_agent: string | null
          signed_by_email: string | null
          signed_by_name: string | null
          signed_by_user_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          document_id: string
          event_at?: string
          id?: string
          note?: string | null
          signature_data?: string | null
          signature_ip?: string | null
          signature_user_agent?: string | null
          signed_by_email?: string | null
          signed_by_name?: string | null
          signed_by_user_id?: string | null
          status: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          document_id?: string
          event_at?: string
          id?: string
          note?: string | null
          signature_data?: string | null
          signature_ip?: string | null
          signature_user_agent?: string | null
          signed_by_email?: string | null
          signed_by_name?: string | null
          signed_by_user_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_document_signatures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_signatures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "hr_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_documents: {
        Row: {
          category: string
          company_id: string
          contractor_id: string | null
          created_at: string
          employee_id: string | null
          file_name: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          owner_id: string
          signature_ip: string | null
          signature_requested_at: string | null
          signature_status: string
          signed_by_email: string | null
          signed_by_name: string | null
          signed_by_user_id: string | null
          storage_path: string | null
          title: string
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          category?: string
          company_id: string
          contractor_id?: string | null
          created_at?: string
          employee_id?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          owner_id: string
          signature_ip?: string | null
          signature_requested_at?: string | null
          signature_status?: string
          signed_by_email?: string | null
          signed_by_name?: string | null
          signed_by_user_id?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          category?: string
          company_id?: string
          contractor_id?: string | null
          created_at?: string
          employee_id?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          owner_id?: string
          signature_ip?: string | null
          signature_requested_at?: string | null
          signature_status?: string
          signed_by_email?: string | null
          signed_by_name?: string | null
          signed_by_user_id?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_forms: {
        Row: {
          company_id: string
          contractor_id: string | null
          created_at: string
          data: Json
          employee_id: string | null
          form_type: string
          id: string
          owner_id: string
          pdf_storage_path: string | null
          signed_at: string | null
          signed_ip: string | null
          signed_name: string | null
          status: string
          tax_year: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          contractor_id?: string | null
          created_at?: string
          data?: Json
          employee_id?: string | null
          form_type: string
          id?: string
          owner_id: string
          pdf_storage_path?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signed_name?: string | null
          status?: string
          tax_year?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          contractor_id?: string | null
          created_at?: string
          data?: Json
          employee_id?: string | null
          form_type?: string
          id?: string
          owner_id?: string
          pdf_storage_path?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signed_name?: string | null
          status?: string
          tax_year?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_forms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_forms_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_forms_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_scorecards: {
        Row: {
          company_id: string
          concerns: string | null
          created_at: string
          id: string
          interview_id: string
          recommendation: string | null
          reviewer_id: string
          scores: Json
          strengths: string | null
        }
        Insert: {
          company_id: string
          concerns?: string | null
          created_at?: string
          id?: string
          interview_id: string
          recommendation?: string | null
          reviewer_id: string
          scores?: Json
          strengths?: string | null
        }
        Update: {
          company_id?: string
          concerns?: string | null
          created_at?: string
          id?: string
          interview_id?: string
          recommendation?: string | null
          reviewer_id?: string
          scores?: Json
          strengths?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_scorecards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_scorecards_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          candidate_id: string
          company_id: string
          created_at: string
          duration_minutes: number
          feedback_summary: string | null
          id: string
          interviewer_id: string | null
          location_or_link: string | null
          mode: Database["public"]["Enums"]["interview_mode"]
          round: number
          scheduled_at: string
          status: Database["public"]["Enums"]["interview_status"]
          updated_at: string
        }
        Insert: {
          candidate_id: string
          company_id: string
          created_at?: string
          duration_minutes?: number
          feedback_summary?: string | null
          id?: string
          interviewer_id?: string | null
          location_or_link?: string | null
          mode?: Database["public"]["Enums"]["interview_mode"]
          round?: number
          scheduled_at: string
          status?: Database["public"]["Enums"]["interview_status"]
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          company_id?: string
          created_at?: string
          duration_minutes?: number
          feedback_summary?: string | null
          id?: string
          interviewer_id?: string | null
          location_or_link?: string | null
          mode?: Database["public"]["Enums"]["interview_mode"]
          round?: number
          scheduled_at?: string
          status?: Database["public"]["Enums"]["interview_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      job_postings: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          employment_type: string | null
          id: string
          location: string | null
          opened_at: string | null
          public_slug: string | null
          requirements: string | null
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          employment_type?: string | null
          id?: string
          location?: string | null
          opened_at?: string | null
          public_slug?: string | null
          requirements?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          employment_type?: string | null
          id?: string
          location?: string | null
          opened_at?: string | null
          public_slug?: string | null
          requirements?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_postings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_tasks: {
        Row: {
          category: string
          company_id: string
          completed_at: string | null
          contractor_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          employee_id: string | null
          id: string
          owner_id: string
          required: boolean
          sort_order: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          company_id: string
          completed_at?: string | null
          contractor_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          employee_id?: string | null
          id?: string
          owner_id: string
          required?: boolean
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string
          completed_at?: string | null
          contractor_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          employee_id?: string | null
          id?: string
          owner_id?: string
          required?: boolean
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tasks_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_template_tasks: {
        Row: {
          assignee_role: string | null
          category: string | null
          company_id: string
          created_at: string
          day_offset: number
          description: string | null
          id: string
          is_required: boolean
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          assignee_role?: string | null
          category?: string | null
          company_id: string
          created_at?: string
          day_offset?: number
          description?: string | null
          id?: string
          is_required?: boolean
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          assignee_role?: string | null
          category?: string | null
          company_id?: string
          created_at?: string
          day_offset?: number
          description?: string | null
          id?: string
          is_required?: boolean
          sort_order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_template_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_templates: {
        Row: {
          company_id: string
          created_at: string
          default_duration_days: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          target_department: string | null
          target_role: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          default_duration_days?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          target_department?: string | null
          target_role?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          default_duration_days?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          target_department?: string | null
          target_role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      open_enrollment_windows: {
        Row: {
          company_id: string
          coverage_effective_date: string
          created_at: string
          ends_at: string
          id: string
          is_active: boolean
          name: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          company_id: string
          coverage_effective_date: string
          created_at?: string
          ends_at: string
          id?: string
          is_active?: boolean
          name: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          coverage_effective_date?: string
          created_at?: string
          ends_at?: string
          id?: string
          is_active?: boolean
          name?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_enrollment_windows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_periods: {
        Row: {
          company_id: string
          created_at: string
          id: string
          pay_date: string
          period_end: string
          period_start: string
          schedule_id: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          pay_date: string
          period_end: string
          period_start: string
          schedule_id?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          pay_date?: string
          period_end?: string
          period_start?: string
          schedule_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_periods_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "pay_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_schedules: {
        Row: {
          anchor_date: string
          company_id: string
          created_at: string
          frequency: Database["public"]["Enums"]["pay_frequency"]
          id: string
          is_default: boolean | null
          name: string
          updated_at: string
          weekend_rule: string | null
        }
        Insert: {
          anchor_date: string
          company_id: string
          created_at?: string
          frequency: Database["public"]["Enums"]["pay_frequency"]
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string
          weekend_rule?: string | null
        }
        Update: {
          anchor_date?: string
          company_id?: string
          created_at?: string
          frequency?: Database["public"]["Enums"]["pay_frequency"]
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
          weekend_rule?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pay_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_corrections: {
        Row: {
          company_id: string
          correcting_run_id: string | null
          created_at: string
          created_by: string | null
          id: string
          original_run_id: string
          reason: string
        }
        Insert: {
          company_id: string
          correcting_run_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          original_run_id: string
          reason: string
        }
        Update: {
          company_id?: string
          correcting_run_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          original_run_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_corrections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_corrections_correcting_run_id_fkey"
            columns: ["correcting_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_corrections_original_run_id_fkey"
            columns: ["original_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          employee_name: string
          federal_tax: number
          gross_pay: number
          id: string
          medicare: number
          net_pay: number
          overtime_hours: number
          owner_id: string
          regular_hours: number
          run_id: string
          social_security: number
          state_tax: number
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          employee_name: string
          federal_tax?: number
          gross_pay?: number
          id?: string
          medicare?: number
          net_pay?: number
          overtime_hours?: number
          owner_id: string
          regular_hours?: number
          run_id: string
          social_security?: number
          state_tax?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          employee_name?: string
          federal_tax?: number
          gross_pay?: number
          id?: string
          medicare?: number
          net_pay?: number
          overtime_hours?: number
          owner_id?: string
          regular_hours?: number
          run_id?: string
          social_security?: number
          state_tax?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_reversals: {
        Row: {
          company_id: string
          id: string
          reason: string
          reversed_at: string
          reversed_by: string | null
          run_id: string
        }
        Insert: {
          company_id: string
          id?: string
          reason: string
          reversed_at?: string
          reversed_by?: string | null
          run_id: string
        }
        Update: {
          company_id?: string
          id?: string
          reason?: string
          reversed_at?: string
          reversed_by?: string | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_reversals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_reversals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          correction_of: string | null
          created_at: string
          gross_total: number
          id: string
          locked_at: string | null
          locked_by: string | null
          net_total: number
          owner_id: string
          pay_date: string
          period_end: string
          period_start: string
          processed_at: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          tax_total: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          correction_of?: string | null
          created_at?: string
          gross_total?: number
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          net_total?: number
          owner_id: string
          pay_date: string
          period_end: string
          period_start: string
          processed_at?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          tax_total?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          correction_of?: string | null
          created_at?: string
          gross_total?: number
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          net_total?: number
          owner_id?: string
          pay_date?: string
          period_end?: string
          period_start?: string
          processed_at?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          tax_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_correction_of_fkey"
            columns: ["correction_of"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_goals: {
        Row: {
          category: string | null
          company_id: string
          created_at: string
          description: string | null
          employee_id: string
          id: string
          parent_goal_id: string | null
          progress_pct: number
          status: Database["public"]["Enums"]["goal_status"]
          target_date: string | null
          title: string
          updated_at: string
          weight: number | null
        }
        Insert: {
          category?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          employee_id: string
          id?: string
          parent_goal_id?: string | null
          progress_pct?: number
          status?: Database["public"]["Enums"]["goal_status"]
          target_date?: string | null
          title: string
          updated_at?: string
          weight?: number | null
        }
        Update: {
          category?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          employee_id?: string
          id?: string
          parent_goal_id?: string | null
          progress_pct?: number
          status?: Database["public"]["Enums"]["goal_status"]
          target_date?: string | null
          title?: string
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_goals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goals_parent_goal_id_fkey"
            columns: ["parent_goal_id"]
            isOneToOne: false
            referencedRelation: "performance_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_notes: {
        Row: {
          author_id: string | null
          category: string | null
          company_id: string
          created_at: string
          employee_id: string
          id: string
          note: string
          occurred_at: string
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          note: string
          occurred_at?: string
        }
        Update: {
          author_id?: string | null
          category?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          note?: string
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_notes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_review_cycles: {
        Row: {
          company_id: string
          created_at: string
          due_date: string | null
          id: string
          include_peer_review: boolean
          include_self_review: boolean
          include_upward_review: boolean
          name: string
          period_end: string
          period_start: string
          rubric: Json
          status: Database["public"]["Enums"]["review_cycle_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          include_peer_review?: boolean
          include_self_review?: boolean
          include_upward_review?: boolean
          name: string
          period_end: string
          period_start: string
          rubric?: Json
          status?: Database["public"]["Enums"]["review_cycle_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          include_peer_review?: boolean
          include_self_review?: boolean
          include_upward_review?: boolean
          name?: string
          period_end?: string
          period_start?: string
          rubric?: Json
          status?: Database["public"]["Enums"]["review_cycle_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_review_cycles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          acknowledged_at: string | null
          comments: string | null
          company_id: string
          created_at: string
          cycle_id: string
          employee_id: string
          id: string
          improvements: string | null
          overall_rating: number | null
          ratings: Json
          review_type: string
          reviewer_id: string | null
          status: Database["public"]["Enums"]["review_status"]
          strengths: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          comments?: string | null
          company_id: string
          created_at?: string
          cycle_id: string
          employee_id: string
          id?: string
          improvements?: string | null
          overall_rating?: number | null
          ratings?: Json
          review_type?: string
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          strengths?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          comments?: string | null
          company_id?: string
          created_at?: string
          cycle_id?: string
          employee_id?: string
          id?: string
          improvements?: string | null
          overall_rating?: number | null
          ratings?: Json
          review_type?: string
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          strengths?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "performance_review_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_integrations: {
        Row: {
          company_id: string
          config: Json
          created_at: string
          id: string
          last_synced_at: string | null
          provider: string
          secret_ref: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          config?: Json
          created_at?: string
          id?: string
          last_synced_at?: string | null
          provider: string
          secret_ref?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          config?: Json
          created_at?: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          secret_ref?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pto_accrual_policies: {
        Row: {
          carryover_hours: number | null
          company_id: string
          created_at: string
          frequency: Database["public"]["Enums"]["pay_frequency"]
          hours_per_period: number
          id: string
          max_balance_hours: number | null
          name: string
        }
        Insert: {
          carryover_hours?: number | null
          company_id: string
          created_at?: string
          frequency?: Database["public"]["Enums"]["pay_frequency"]
          hours_per_period?: number
          id?: string
          max_balance_hours?: number | null
          name: string
        }
        Update: {
          carryover_hours?: number | null
          company_id?: string
          created_at?: string
          frequency?: Database["public"]["Enums"]["pay_frequency"]
          hours_per_period?: number
          id?: string
          max_balance_hours?: number | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pto_accrual_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pto_entries: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          end_date: string
          hours: number
          id: string
          notes: string | null
          owner_id: string
          pto_type: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          end_date: string
          hours?: number
          id?: string
          notes?: string | null
          owner_id: string
          pto_type?: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          end_date?: string
          hours?: number
          id?: string
          notes?: string | null
          owner_id?: string
          pto_type?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pto_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pto_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      pto_ledger: {
        Row: {
          balance_after: number
          company_id: string
          created_at: string
          delta_hours: number
          employee_id: string
          id: string
          reason: string
          ref_id: string | null
          ref_type: string | null
        }
        Insert: {
          balance_after: number
          company_id: string
          created_at?: string
          delta_hours: number
          employee_id: string
          id?: string
          reason: string
          ref_id?: string | null
          ref_type?: string | null
        }
        Update: {
          balance_after?: number
          company_id?: string
          created_at?: string
          delta_hours?: number
          employee_id?: string
          id?: string
          reason?: string
          ref_id?: string | null
          ref_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pto_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pto_ledger_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string | null
          end_at: string
          id: string
          location: string | null
          notes: string | null
          role: string | null
          start_at: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id?: string | null
          end_at: string
          id?: string
          location?: string | null
          notes?: string | null
          role?: string | null
          start_at: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string | null
          end_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          role?: string | null
          start_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_records: {
        Row: {
          company_id: string
          created_at: string
          deposit_status: string | null
          deposited_at: string | null
          id: string
          jurisdiction: string
          liability_date: string | null
          period_end: string
          period_start: string
          run_id: string | null
          tax_amount: number
          tax_type: string
          taxable_wages: number
        }
        Insert: {
          company_id: string
          created_at?: string
          deposit_status?: string | null
          deposited_at?: string | null
          id?: string
          jurisdiction: string
          liability_date?: string | null
          period_end: string
          period_start: string
          run_id?: string | null
          tax_amount?: number
          tax_type: string
          taxable_wages?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          deposit_status?: string | null
          deposited_at?: string | null
          id?: string
          jurisdiction?: string
          liability_date?: string | null
          period_end?: string
          period_start?: string
          run_id?: string | null
          tax_amount?: number
          tax_type?: string
          taxable_wages?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_records_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      time_clock_punches: {
        Row: {
          accuracy_m: number | null
          address: string | null
          company_id: string
          created_at: string
          employee_id: string | null
          id: string
          inside_geofence: boolean | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          punch_type: string
          punched_at: string
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          address?: string | null
          company_id: string
          created_at?: string
          employee_id?: string | null
          id?: string
          inside_geofence?: boolean | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          punch_type: string
          punched_at?: string
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          address?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          inside_geofence?: boolean | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          punch_type?: string
          punched_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_punches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          hours: number
          id: string
          notes: string | null
          overtime_hours: number
          owner_id: string
          work_date: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          hours?: number
          id?: string
          notes?: string | null
          overtime_hours?: number
          owner_id: string
          work_date: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          hours?: number
          id?: string
          notes?: string | null
          overtime_hours?: number
          owner_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["timesheet_status"]
          submitted_at: string | null
          total_double_ot_hours: number | null
          total_holiday_hours: number | null
          total_overtime_hours: number | null
          total_regular_hours: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["timesheet_status"]
          submitted_at?: string | null
          total_double_ot_hours?: number | null
          total_holiday_hours?: number | null
          total_overtime_hours?: number | null
          total_regular_hours?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["timesheet_status"]
          submitted_at?: string | null
          total_double_ot_hours?: number | null
          total_holiday_hours?: number | null
          total_overtime_hours?: number | null
          total_regular_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      bank_connections_safe: {
        Row: {
          account_mask: string | null
          account_name: string | null
          account_subtype: string | null
          account_type: string | null
          company_id: string | null
          contractor_id: string | null
          created_at: string | null
          employee_id: string | null
          id: string | null
          institution_name: string | null
          is_company: boolean | null
          linked_at: string | null
          owner_id: string | null
          provider: string | null
          routing_number_last4: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          account_mask?: string | null
          account_name?: string | null
          account_subtype?: string | null
          account_type?: string | null
          company_id?: string | null
          contractor_id?: string | null
          created_at?: string | null
          employee_id?: string | null
          id?: string | null
          institution_name?: string | null
          is_company?: boolean | null
          linked_at?: string | null
          owner_id?: string | null
          provider?: string | null
          routing_number_last4?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          account_mask?: string | null
          account_name?: string | null
          account_subtype?: string | null
          account_type?: string | null
          company_id?: string | null
          contractor_id?: string | null
          created_at?: string | null
          employee_id?: string | null
          id?: string | null
          institution_name?: string | null
          is_company?: boolean | null
          linked_at?: string | null
          owner_id?: string | null
          provider?: string | null
          routing_number_last4?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connections_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connections_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_employee_id: { Args: { _company_id: string }; Returns: string }
      has_any_role: {
        Args: {
          _company_id: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      announcement_audience: "all" | "department" | "role" | "custom"
      announcement_priority: "normal" | "important" | "urgent"
      announcement_status: "draft" | "scheduled" | "published" | "archived"
      app_role:
        | "owner"
        | "admin"
        | "payroll_admin"
        | "hr_admin"
        | "manager"
        | "employee"
        | "supervisor"
        | "recruiter"
        | "benefits_admin"
        | "accountant"
        | "auditor"
      audit_action:
        | "create"
        | "update"
        | "delete"
        | "approve"
        | "lock"
        | "process"
        | "reverse"
        | "correct"
        | "login"
        | "export"
      benefit_coverage_tier:
        | "employee"
        | "employee_spouse"
        | "employee_children"
        | "family"
      benefit_enrollment_status: "pending" | "active" | "waived" | "terminated"
      benefit_plan_type:
        | "medical"
        | "dental"
        | "vision"
        | "life"
        | "disability"
        | "retirement_401k"
        | "hsa"
        | "fsa"
        | "commuter"
        | "wellness"
        | "other"
      candidate_stage:
        | "applied"
        | "screening"
        | "interview"
        | "final"
        | "offer"
        | "hired"
        | "rejected"
        | "withdrawn"
      compliance_alert_status: "open" | "in_progress" | "resolved" | "dismissed"
      compliance_alert_type:
        | "i9_missing"
        | "w4_missing"
        | "handbook_unsigned"
        | "document_expiring"
        | "certification_expiring"
        | "tax_filing_due"
        | "license_expiring"
        | "training_overdue"
        | "other"
      compliance_doc_type:
        | "i9"
        | "w4"
        | "state_w4"
        | "eeo"
        | "direct_deposit"
        | "handbook"
        | "other"
      compliance_severity: "low" | "medium" | "high" | "critical"
      garnishment_type:
        | "child_support"
        | "tax_levy"
        | "student_loan"
        | "creditor"
        | "bankruptcy"
        | "other"
      goal_status:
        | "not_started"
        | "on_track"
        | "at_risk"
        | "completed"
        | "cancelled"
      interview_mode: "phone" | "video" | "onsite"
      interview_status: "scheduled" | "completed" | "no_show" | "cancelled"
      job_status: "draft" | "open" | "on_hold" | "closed" | "filled"
      pay_frequency: "weekly" | "biweekly" | "semimonthly" | "monthly"
      payroll_status:
        | "draft"
        | "review"
        | "approved"
        | "locked"
        | "processed"
        | "reversed"
        | "corrected"
      review_cycle_status: "draft" | "active" | "closed"
      review_status:
        | "not_started"
        | "in_progress"
        | "submitted"
        | "acknowledged"
      timesheet_status:
        | "open"
        | "submitted"
        | "approved"
        | "rejected"
        | "locked"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      announcement_audience: ["all", "department", "role", "custom"],
      announcement_priority: ["normal", "important", "urgent"],
      announcement_status: ["draft", "scheduled", "published", "archived"],
      app_role: [
        "owner",
        "admin",
        "payroll_admin",
        "hr_admin",
        "manager",
        "employee",
        "supervisor",
        "recruiter",
        "benefits_admin",
        "accountant",
        "auditor",
      ],
      audit_action: [
        "create",
        "update",
        "delete",
        "approve",
        "lock",
        "process",
        "reverse",
        "correct",
        "login",
        "export",
      ],
      benefit_coverage_tier: [
        "employee",
        "employee_spouse",
        "employee_children",
        "family",
      ],
      benefit_enrollment_status: ["pending", "active", "waived", "terminated"],
      benefit_plan_type: [
        "medical",
        "dental",
        "vision",
        "life",
        "disability",
        "retirement_401k",
        "hsa",
        "fsa",
        "commuter",
        "wellness",
        "other",
      ],
      candidate_stage: [
        "applied",
        "screening",
        "interview",
        "final",
        "offer",
        "hired",
        "rejected",
        "withdrawn",
      ],
      compliance_alert_status: ["open", "in_progress", "resolved", "dismissed"],
      compliance_alert_type: [
        "i9_missing",
        "w4_missing",
        "handbook_unsigned",
        "document_expiring",
        "certification_expiring",
        "tax_filing_due",
        "license_expiring",
        "training_overdue",
        "other",
      ],
      compliance_doc_type: [
        "i9",
        "w4",
        "state_w4",
        "eeo",
        "direct_deposit",
        "handbook",
        "other",
      ],
      compliance_severity: ["low", "medium", "high", "critical"],
      garnishment_type: [
        "child_support",
        "tax_levy",
        "student_loan",
        "creditor",
        "bankruptcy",
        "other",
      ],
      goal_status: [
        "not_started",
        "on_track",
        "at_risk",
        "completed",
        "cancelled",
      ],
      interview_mode: ["phone", "video", "onsite"],
      interview_status: ["scheduled", "completed", "no_show", "cancelled"],
      job_status: ["draft", "open", "on_hold", "closed", "filled"],
      pay_frequency: ["weekly", "biweekly", "semimonthly", "monthly"],
      payroll_status: [
        "draft",
        "review",
        "approved",
        "locked",
        "processed",
        "reversed",
        "corrected",
      ],
      review_cycle_status: ["draft", "active", "closed"],
      review_status: [
        "not_started",
        "in_progress",
        "submitted",
        "acknowledged",
      ],
      timesheet_status: ["open", "submitted", "approved", "rejected", "locked"],
    },
  },
} as const
