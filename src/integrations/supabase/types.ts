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
          edited_at: string
          editor_tg_id: number
          id: number
          new_feedback: string | null
          new_grade: string | null
          old_feedback: string | null
          old_grade: string | null
          submission_id: number
        }
        Insert: {
          edited_at?: string
          editor_tg_id: number
          id?: number
          new_feedback?: string | null
          new_grade?: string | null
          old_feedback?: string | null
          old_grade?: string | null
          submission_id: number
        }
        Update: {
          edited_at?: string
          editor_tg_id?: number
          id?: number
          new_feedback?: string | null
          new_grade?: string | null
          old_feedback?: string | null
          old_grade?: string | null
          submission_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "review_edits_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
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
          },
        ]
      }
      submission_rate_limits: {
        Row: {
          id: number
          submitted_at: string
          tg_user_id: number
        }
        Insert: {
          id?: number
          submitted_at?: string
          tg_user_id: number
        }
        Update: {
          id?: number
          submitted_at?: string
          tg_user_id?: number
        }
        Relationships: []
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
          last_resubmit_at: string | null
          pending_grade: string | null
          resubmit_count: number
          reviewed_at: string | null
          reviewer_tg_id: number | null
          status: string
          student_id: string | null
          teacher_chat_id: number | null
          teacher_message_id: number | null
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
          last_resubmit_at?: string | null
          pending_grade?: string | null
          resubmit_count?: number
          reviewed_at?: string | null
          reviewer_tg_id?: number | null
          status?: string
          student_id?: string | null
          teacher_chat_id?: number | null
          teacher_message_id?: number | null
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
          last_resubmit_at?: string | null
          pending_grade?: string | null
          resubmit_count?: number
          reviewed_at?: string | null
          reviewer_tg_id?: number | null
          status?: string
          student_id?: string | null
          teacher_chat_id?: number | null
          teacher_message_id?: number | null
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
          },
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
          group_id: string
          id: number
          sent_at: string
          week_start: string
        }
        Insert: {
          group_id: string
          id?: number
          sent_at?: string
          week_start: string
        }
        Update: {
          group_id?: string
          id?: number
          sent_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
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
