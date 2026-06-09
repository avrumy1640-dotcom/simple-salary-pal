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
      company_settings: {
        Row: {
          business_address: string | null
          business_city: string | null
          business_state: string | null
          business_zip: string | null
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
        Relationships: []
      }
      deductions: {
        Row: {
          active: boolean
          amount: number
          amount_type: string
          category: string
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
          id: string
          job_title: string | null
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
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          bank_account_last4?: string | null
          bank_account_type?: string | null
          bank_routing_last4?: string | null
          city?: string | null
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
          id?: string
          job_title?: string | null
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
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          bank_account_last4?: string | null
          bank_account_type?: string | null
          bank_routing_last4?: string | null
          city?: string | null
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
          id?: string
          job_title?: string | null
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
          zip?: string | null
        }
        Relationships: []
      }
      payroll_items: {
        Row: {
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
      payroll_runs: {
        Row: {
          created_at: string
          gross_total: number
          id: string
          net_total: number
          owner_id: string
          pay_date: string
          period_end: string
          period_start: string
          status: string
          tax_total: number
        }
        Insert: {
          created_at?: string
          gross_total?: number
          id?: string
          net_total?: number
          owner_id: string
          pay_date: string
          period_end: string
          period_start: string
          status?: string
          tax_total?: number
        }
        Update: {
          created_at?: string
          gross_total?: number
          id?: string
          net_total?: number
          owner_id?: string
          pay_date?: string
          period_end?: string
          period_start?: string
          status?: string
          tax_total?: number
        }
        Relationships: []
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
      pto_entries: {
        Row: {
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
            foreignKeyName: "pto_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
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
            foreignKeyName: "time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
