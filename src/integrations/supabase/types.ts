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
      assessment_answers: {
        Row: {
          answer_meta: Json
          answer_value: string
          assessment_id: string
          created_at: string
          id: string
          question_key: string
        }
        Insert: {
          answer_meta?: Json
          answer_value: string
          assessment_id: string
          created_at?: string
          id?: string
          question_key: string
        }
        Update: {
          answer_meta?: Json
          answer_value?: string
          assessment_id?: string
          created_at?: string
          id?: string
          question_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_answers_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          completed_at: string | null
          created_at: string
          email: string | null
          id: string
          rsid: string | null
          session_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          rsid?: string | null
          session_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          rsid?: string | null
          session_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          entity: string | null
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entity?: string | null
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entity?: string | null
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      candy_leads: {
        Row: {
          activity: string
          created_at: string
          email: string | null
          goal: string
          id: string
          metadata: Json
          phone: string | null
          source: string | null
          status: string
          updated_at: string
          user_id: string | null
          weight_kg: number
        }
        Insert: {
          activity: string
          created_at?: string
          email?: string | null
          goal: string
          id?: string
          metadata?: Json
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          weight_kg: number
        }
        Update: {
          activity?: string
          created_at?: string
          email?: string | null
          goal?: string
          id?: string
          metadata?: Json
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          weight_kg?: number
        }
        Relationships: []
      }
      currency_routes: {
        Row: {
          country_code: string
          created_at: string
          crypto_threshold_minor: number
          currency: string
          hub_tier: string | null
          id: string
          is_default: boolean
          provider: string | null
          rail: string
          region: string | null
          updated_at: string
        }
        Insert: {
          country_code: string
          created_at?: string
          crypto_threshold_minor?: number
          currency: string
          hub_tier?: string | null
          id?: string
          is_default?: boolean
          provider?: string | null
          rail: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          crypto_threshold_minor?: number
          currency?: string
          hub_tier?: string | null
          id?: string
          is_default?: boolean
          provider?: string | null
          rail?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      domain_events: {
        Row: {
          aggregate: string
          aggregate_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          aggregate: string
          aggregate_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Update: {
          aggregate?: string
          aggregate_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: []
      }
      fulfillment_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          from_status: string | null
          fulfillment_order_id: string
          id: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          from_status?: string | null
          fulfillment_order_id: string
          id?: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          from_status?: string | null
          fulfillment_order_id?: string
          id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_events_fulfillment_order_id_fkey"
            columns: ["fulfillment_order_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_orders: {
        Row: {
          created_at: string
          hub_id: string | null
          id: string
          notes: string | null
          order_id: string
          status: string
          tracking_ref: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          hub_id?: string | null
          id?: string
          notes?: string | null
          order_id: string
          status?: string
          tracking_ref?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          hub_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          status?: string
          tracking_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_orders_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_events: {
        Row: {
          event_name: string
          id: string
          occurred_at: string
          props: Json
          rsid: string | null
        }
        Insert: {
          event_name: string
          id?: string
          occurred_at?: string
          props?: Json
          rsid?: string | null
        }
        Update: {
          event_name?: string
          id?: string
          occurred_at?: string
          props?: Json
          rsid?: string | null
        }
        Relationships: []
      }
      gallery_images: {
        Row: {
          created_at: string
          height: number | null
          id: string
          label: string
          slot: string
          sort_order: number
          storage_path: string | null
          updated_at: string
          url: string
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          label?: string
          slot?: string
          sort_order?: number
          storage_path?: string | null
          updated_at?: string
          url: string
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          label?: string
          slot?: string
          sort_order?: number
          storage_path?: string | null
          updated_at?: string
          url?: string
          width?: number | null
        }
        Relationships: []
      }
      generated_content: {
        Row: {
          asset_url: string | null
          bpm: number | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          metadata: Json
          music_track: string | null
          status: string
          tags: string[]
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          asset_url?: string | null
          bpm?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          metadata?: Json
          music_track?: string | null
          status?: string
          tags?: string[]
          thumbnail_url?: string | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          asset_url?: string | null
          bpm?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          metadata?: Json
          music_track?: string | null
          status?: string
          tags?: string[]
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      health_profiles: {
        Row: {
          assessment_id: string | null
          budget_band: string | null
          created_at: string
          equipment_access: string | null
          experience_level: string | null
          id: string
          mobility_notes: string | null
          nutrition_preference: string | null
          primary_goal: string | null
          time_availability: string | null
          updated_at: string
          user_id: string | null
          weight_kg: number | null
        }
        Insert: {
          assessment_id?: string | null
          budget_band?: string | null
          created_at?: string
          equipment_access?: string | null
          experience_level?: string | null
          id?: string
          mobility_notes?: string | null
          nutrition_preference?: string | null
          primary_goal?: string | null
          time_availability?: string | null
          updated_at?: string
          user_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          assessment_id?: string | null
          budget_band?: string | null
          created_at?: string
          equipment_access?: string | null
          experience_level?: string | null
          id?: string
          mobility_notes?: string | null
          nutrition_preference?: string | null
          primary_goal?: string | null
          time_availability?: string | null
          updated_at?: string
          user_id?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "health_profiles_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      hubs: {
        Row: {
          address: string
          city: string
          country_code: string
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          name: string
          sort_order: number | null
          tier: string
        }
        Insert: {
          address: string
          city: string
          country_code: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          sort_order?: number | null
          tier: string
        }
        Update: {
          address?: string
          city?: string
          country_code?: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          sort_order?: number | null
          tier?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          created_at: string
          hub_id: string
          id: string
          on_hand: number
          reorder_level: number
          reserved: number
          sku: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hub_id: string
          id?: string
          on_hand?: number
          reorder_level?: number
          reserved?: number
          sku: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hub_id?: string
          id?: string
          on_hand?: number
          reorder_level?: number
          reserved?: number
          sku?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_ledger: {
        Row: {
          created_at: string
          delta: number
          hub_id: string | null
          id: string
          order_id: string | null
          reason: string
          sku: string
        }
        Insert: {
          created_at?: string
          delta: number
          hub_id?: string | null
          id?: string
          order_id?: string | null
          reason?: string
          sku: string
        }
        Update: {
          created_at?: string
          delta?: number
          hub_id?: string | null
          id?: string
          order_id?: string | null
          reason?: string
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_ledger_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          category: string | null
          id: string
          order_id: string
          quantity: number
          sku: string
          title: string
          unit_amount_minor: number
        }
        Insert: {
          category?: string | null
          id?: string
          order_id: string
          quantity?: number
          sku: string
          title: string
          unit_amount_minor: number
        }
        Update: {
          category?: string | null
          id?: string
          order_id?: string
          quantity?: number
          sku?: string
          title?: string
          unit_amount_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_minor: number
          assigned_hub_id: string | null
          created_at: string
          currency: string
          customer_country: string | null
          customer_email: string | null
          customer_name: string | null
          id: string
          metadata: Json | null
          rail: string
          reference: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          assigned_hub_id?: string | null
          created_at?: string
          currency: string
          customer_country?: string | null
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          metadata?: Json | null
          rail: string
          reference: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          assigned_hub_id?: string | null
          created_at?: string
          currency?: string
          customer_country?: string | null
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          metadata?: Json | null
          rail?: string
          reference?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_hub_id_fkey"
            columns: ["assigned_hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          event_key: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          reference: string | null
        }
        Insert: {
          created_at?: string
          event_key: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider: string
          reference?: string | null
        }
        Update: {
          created_at?: string
          event_key?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          reference?: string | null
        }
        Relationships: []
      }
      payment_providers: {
        Row: {
          code: string
          created_at: string
          display_name: string
          enabled: boolean
          live: boolean
          sort_order: number
          supported_currencies: string[]
          updated_at: string
          webhook_path: string | null
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
          enabled?: boolean
          live?: boolean
          sort_order?: number
          supported_currencies?: string[]
          updated_at?: string
          webhook_path?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
          enabled?: boolean
          live?: boolean
          sort_order?: number
          supported_currencies?: string[]
          updated_at?: string
          webhook_path?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          id: string
          metadata: Json
          order_id: string | null
          provider: string
          reference: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency: string
          id?: string
          metadata?: Json
          order_id?: string | null
          provider: string
          reference: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          order_id?: string | null
          provider?: string
          reference?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          points: number
          tier: string
          updated_at: string
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          points?: number
          tier?: string
          updated_at?: string
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          points?: number
          tier?: string
          updated_at?: string
          xp?: number
        }
        Relationships: []
      }
      recommendation_results: {
        Row: {
          assessment_id: string
          confidence_score: number
          created_at: string
          engine_version: string
          equipment_skus: string[]
          id: string
          membership_sku: string | null
          nutrition_sku: string | null
          primary_program_sku: string | null
          snapshot: Json
          upsell_score: number
          user_id: string | null
        }
        Insert: {
          assessment_id: string
          confidence_score?: number
          created_at?: string
          engine_version?: string
          equipment_skus?: string[]
          id?: string
          membership_sku?: string | null
          nutrition_sku?: string | null
          primary_program_sku?: string | null
          snapshot?: Json
          upsell_score?: number
          user_id?: string | null
        }
        Update: {
          assessment_id?: string
          confidence_score?: number
          created_at?: string
          engine_version?: string
          equipment_skus?: string[]
          id?: string
          membership_sku?: string | null
          nutrition_sku?: string | null
          primary_program_sku?: string | null
          snapshot?: Json
          upsell_score?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_results_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_events: {
        Row: {
          amount_minor: number
          confidence_score: number | null
          created_at: string
          currency: string
          email: string | null
          id: string
          lifecycle_stage: string
          occurred_at: string
          predicted_revenue_lift: number | null
          product_sku: string | null
          reference: string
          rsid: string | null
          source: string | null
          status: string
          utm: Json
          variant: string | null
        }
        Insert: {
          amount_minor: number
          confidence_score?: number | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          lifecycle_stage?: string
          occurred_at?: string
          predicted_revenue_lift?: number | null
          product_sku?: string | null
          reference: string
          rsid?: string | null
          source?: string | null
          status?: string
          utm?: Json
          variant?: string | null
        }
        Update: {
          amount_minor?: number
          confidence_score?: number | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          lifecycle_stage?: string
          occurred_at?: string
          predicted_revenue_lift?: number | null
          product_sku?: string | null
          reference?: string
          rsid?: string | null
          source?: string | null
          status?: string
          utm?: Json
          variant?: string | null
        }
        Relationships: []
      }
      revenue_predictions: {
        Row: {
          confidence_score: number
          created_at: string
          id: string
          model_version: string
          predicted_conversion_rate: number
          predicted_revenue: number
          rsid: string | null
          sku: string | null
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          id?: string
          model_version?: string
          predicted_conversion_rate?: number
          predicted_revenue?: number
          rsid?: string | null
          sku?: string | null
        }
        Update: {
          confidence_score?: number
          created_at?: string
          id?: string
          model_version?: string
          predicted_conversion_rate?: number
          predicted_revenue?: number
          rsid?: string | null
          sku?: string | null
        }
        Relationships: []
      }
      upsell_events: {
        Row: {
          accepted: boolean
          amount_minor: number | null
          created_at: string
          id: string
          offer_sku: string | null
          order_id: string | null
          rsid: string | null
          trigger: string
        }
        Insert: {
          accepted?: boolean
          amount_minor?: number | null
          created_at?: string
          id?: string
          offer_sku?: string | null
          order_id?: string | null
          rsid?: string | null
          trigger?: string
        }
        Update: {
          accepted?: boolean
          amount_minor?: number | null
          created_at?: string
          id?: string
          offer_sku?: string | null
          order_id?: string | null
          rsid?: string | null
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "upsell_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weight_logs: {
        Row: {
          created_at: string
          id: string
          logged_at: string
          note: string | null
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          logged_at?: string
          note?: string | null
          user_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          id?: string
          logged_at?: string
          note?: string | null
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "coach" | "member"
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
      app_role: ["admin", "coach", "member"],
    },
  },
} as const
