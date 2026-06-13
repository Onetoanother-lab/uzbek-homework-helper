// src/integrations/supabase/types.ts
// Updated to include new tables and columns added in migration 001.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          added_at: string
          tg_user_id: number
        }
        Insert: {
          added_at?: string
          tg_user_id: number
        }
        Update: {
          added_at?: string
          tg_user_id?: number
        }
        Relationships: []
      }
      conversation_state: {
        Row: {
          draft: Json
          step: string
          tg_user_id: number
          updated_at: string
        }
        Insert: {
          draft?: Json
          step: string
          tg_user_id: number
          updated_at?: string
        }
        Update: {
          draft?: Json
          step?: string
          tg_user_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          created_at: string
          id: string
          name: string
          parents_chat_id: number | null
          teachers_chat_id: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parents_chat_id?: number | null
          teachers_chat_id?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parents_chat_id?: number | null
          teachers_chat_id?: number | null
        }
        Relationships: []
      }
      processed_updates: {
        Row: {
          processed_at: string
          update_id: number
        }
        Insert: {
          processed_at?: string
          update_id: number
        }
        Update: {
          processed_at?: string
          update_id?: number
        }
        Relationships: []
      }
      review_edits: {
        Row: {
          id: number
          submission_id: number
          editor_tg_id: number
          old_grade: string | null
          new_grade: string | null
          old_feedback: string | null
          new_feedback: string | null
          edited_at: string
        }
        Insert: {
          id?: number
          submission_id: number
          editor_tg_id: number
          old_grade?: string | null
          new_grade?: string | null
          old_feedback?: string | null
          new_feedback?: string | null
          edited_at?: string
        }
        Update: {
          id?: number
          submission_id?: number
          editor_tg_id?: number
          old_grade?: string | null
          new_grade?: string | null
          old_feedback?: string | null
          new_feedback?: string | null
          edited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_edits_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          }
        ]
      }
      submission_rate_limits: {
        Row: {
          tg_user_id: number
          submitted_at: string
        }
        Insert: {
          tg_user_id: number
          submitted_at?: string
        }
        Update: {
          tg_user_id?: number
          submitted_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          created_at: string
          full_name: string
          group_id: string | null
          id: string
          tg_user_id: number
        }
        Insert: {
          created_at?: string
          full_name: string
          group_id?: string | null
          id?: string
          tg_user_id: number
        }
        Update: {
          created_at?: string
          full_name?: string
          group_id?: string | null
          id?: string
          tg_user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "students_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          }
        ]
      }
      submissions: {
        Row: {
          ai_draft_feedback: string | null
          ai_draft_grade: string | null
          caption: string | null
          created_at: string
          file_id: string
          file_type: string
          final_feedback: string | null
          final_grade: string | null
          group_id: string | null
          id: number
          pending_grade: string | null
          reviewed_at: string | null
          reviewer_tg_id: number | null
          status: string
          student_id: string | null
          teacher_chat_id: number | null
          teacher_message_id: number | null
          resubmit_count: number
          last_resubmit_at: string | null
        }
        Insert: {
          ai_draft_feedback?: string | null
          ai_draft_grade?: string | null
          caption?: string | null
          created_at?: string
          file_id: string
          file_type: string
          final_feedback?: string | null
          final_grade?: string | null
          group_id?: string | null
          id?: number
          pending_grade?: string | null
          reviewed_at?: string | null
          reviewer_tg_id?: number | null
          status?: string
          student_id?: string | null
          teacher_chat_id?: number | null
          teacher_message_id?: number | null
          resubmit_count?: number
          last_resubmit_at?: string | null
        }
        Update: {
          ai_draft_feedback?: string | null
          ai_draft_grade?: string | null
          caption?: string | null
          created_at?: string
          file_id?: string
          file_type?: string
          final_feedback?: string | null
          final_grade?: string | null
          group_id?: string | null
          id?: number
          pending_grade?: string | null
          reviewed_at?: string | null
          reviewer_tg_id?: number | null
          status?: string
          student_id?: string | null
          teacher_chat_id?: number | null
          teacher_message_id?: number | null
          resubmit_count?: number
          last_resubmit_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          }
        ]
      }
      teachers_chats: {
        Row: {
          chat_id: number
          created_at: string
          label: string | null
        }
        Insert: {
          chat_id: number
          created_at?: string
          label?: string | null
        }
        Update: {
          chat_id?: number
          created_at?: string
          label?: string | null
        }
        Relationships: []
      }
      weekly_reports: {
        Row: {
          id: number
          group_id: string
          week_start: string
          sent_at: string
        }
        Insert: {
          id?: number
          group_id: string
          week_start: string
          sent_at?: string
        }
        Update: {
          id?: number
          group_id?: string
          week_start?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends { Row: infer R }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const