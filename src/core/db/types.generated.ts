export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      board_columns: {
        Row: {
          board_id: string;
          created_at: string;
          id: string;
          is_done: boolean;
          name: string;
          position: string;
          updated_at: string;
          user_id: string;
          wip_limit: number | null;
        };
        Insert: {
          board_id: string;
          created_at?: string;
          id?: string;
          is_done?: boolean;
          name: string;
          position: string;
          updated_at?: string;
          user_id?: string;
          wip_limit?: number | null;
        };
        Update: {
          board_id?: string;
          created_at?: string;
          id?: string;
          is_done?: boolean;
          name?: string;
          position?: string;
          updated_at?: string;
          user_id?: string;
          wip_limit?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "board_columns_board_id_fkey";
            columns: ["board_id"];
            isOneToOne: false;
            referencedRelation: "boards";
            referencedColumns: ["id"];
          },
        ];
      };
      boards: {
        Row: {
          archived_at: string | null;
          created_at: string;
          id: string;
          is_default: boolean;
          name: string;
          position: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name: string;
          position?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name?: string;
          position?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      calendar_events: {
        Row: {
          all_day: boolean;
          attendees: Json;
          calendar_id: string;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          end_at: string;
          etag: string | null;
          external_id: string;
          html_link: string | null;
          id: string;
          location: string | null;
          recurring_event_id: string | null;
          remote_updated_at: string | null;
          start_at: string;
          status: string;
          sync_status: string;
          timezone: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          all_day?: boolean;
          attendees?: Json;
          calendar_id: string;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          end_at: string;
          etag?: string | null;
          external_id: string;
          html_link?: string | null;
          id?: string;
          location?: string | null;
          recurring_event_id?: string | null;
          remote_updated_at?: string | null;
          start_at: string;
          status?: string;
          sync_status?: string;
          timezone?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          all_day?: boolean;
          attendees?: Json;
          calendar_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          end_at?: string;
          etag?: string | null;
          external_id?: string;
          html_link?: string | null;
          id?: string;
          location?: string | null;
          recurring_event_id?: string | null;
          remote_updated_at?: string | null;
          start_at?: string;
          status?: string;
          sync_status?: string;
          timezone?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_events_calendar_id_fkey";
            columns: ["calendar_id"];
            isOneToOne: false;
            referencedRelation: "calendars";
            referencedColumns: ["id"];
          },
        ];
      };
      calendars: {
        Row: {
          color: string | null;
          created_at: string;
          external_id: string;
          id: string;
          integration_id: string;
          is_primary: boolean;
          last_synced_at: string | null;
          name: string;
          selected: boolean;
          sync_token: string | null;
          updated_at: string;
          user_id: string;
          writable: boolean;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          external_id: string;
          id?: string;
          integration_id: string;
          is_primary?: boolean;
          last_synced_at?: string | null;
          name: string;
          selected?: boolean;
          sync_token?: string | null;
          updated_at?: string;
          user_id?: string;
          writable?: boolean;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          external_id?: string;
          id?: string;
          integration_id?: string;
          is_primary?: boolean;
          last_synced_at?: string | null;
          name?: string;
          selected?: boolean;
          sync_token?: string | null;
          updated_at?: string;
          user_id?: string;
          writable?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "calendars_integration_id_fkey";
            columns: ["integration_id"];
            isOneToOne: false;
            referencedRelation: "integrations";
            referencedColumns: ["id"];
          },
        ];
      };
      cards: {
        Row: {
          archived_at: string | null;
          board_id: string;
          calendar_event_id: string | null;
          checklist: Json;
          column_id: string;
          completed_at: string | null;
          created_at: string;
          description_md: string;
          due_at: string | null;
          due_has_time: boolean;
          id: string;
          labels: string[];
          meeting_id: string | null;
          position: string;
          priority: number;
          source: Json;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          board_id: string;
          calendar_event_id?: string | null;
          checklist?: Json;
          column_id: string;
          completed_at?: string | null;
          created_at?: string;
          description_md?: string;
          due_at?: string | null;
          due_has_time?: boolean;
          id?: string;
          labels?: string[];
          meeting_id?: string | null;
          position: string;
          priority?: number;
          source?: Json;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          archived_at?: string | null;
          board_id?: string;
          calendar_event_id?: string | null;
          checklist?: Json;
          column_id?: string;
          completed_at?: string | null;
          created_at?: string;
          description_md?: string;
          due_at?: string | null;
          due_has_time?: boolean;
          id?: string;
          labels?: string[];
          meeting_id?: string | null;
          position?: string;
          priority?: number;
          source?: Json;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cards_board_id_fkey";
            columns: ["board_id"];
            isOneToOne: false;
            referencedRelation: "boards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cards_column_id_fkey";
            columns: ["column_id"];
            isOneToOne: false;
            referencedRelation: "board_columns";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: {
          created_at: string;
          id: string;
          parts: Json;
          role: string;
          thread_id: string;
          tokens: number | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          parts?: Json;
          role: string;
          thread_id: string;
          tokens?: number | null;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          parts?: Json;
          role?: string;
          thread_id?: string;
          tokens?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "chat_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_threads: {
        Row: {
          created_at: string;
          id: string;
          last_message_at: string;
          scope: Json | null;
          summary: string | null;
          summary_upto_message_id: string | null;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_message_at?: string;
          scope?: Json | null;
          summary?: string | null;
          summary_upto_message_id?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_message_at?: string;
          scope?: Json | null;
          summary?: string | null;
          summary_upto_message_id?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      domain_events: {
        Row: {
          actor: string;
          entity_id: string;
          entity_type: string;
          id: number;
          occurred_at: string;
          payload: Json;
          type: string;
          user_id: string;
        };
        Insert: {
          actor?: string;
          entity_id: string;
          entity_type: string;
          id?: never;
          occurred_at?: string;
          payload?: Json;
          type: string;
          user_id?: string;
        };
        Update: {
          actor?: string;
          entity_id?: string;
          entity_type?: string;
          id?: never;
          occurred_at?: string;
          payload?: Json;
          type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      integrations: {
        Row: {
          account_email: string | null;
          created_at: string;
          id: string;
          last_error: string | null;
          last_synced_at: string | null;
          provider: string;
          scopes: string[];
          status: string;
          sync_cursor: Json;
          updated_at: string;
          user_id: string;
          vault_secret_id: string | null;
        };
        Insert: {
          account_email?: string | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          last_synced_at?: string | null;
          provider: string;
          scopes?: string[];
          status?: string;
          sync_cursor?: Json;
          updated_at?: string;
          user_id?: string;
          vault_secret_id?: string | null;
        };
        Update: {
          account_email?: string | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          last_synced_at?: string | null;
          provider?: string;
          scopes?: string[];
          status?: string;
          sync_cursor?: Json;
          updated_at?: string;
          user_id?: string;
          vault_secret_id?: string | null;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          attempts: number;
          created_at: string;
          dedupe_key: string | null;
          id: string;
          last_error: string | null;
          locked_at: string | null;
          max_attempts: number;
          payload: Json;
          run_at: string;
          status: string;
          type: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          dedupe_key?: string | null;
          id?: string;
          last_error?: string | null;
          locked_at?: string | null;
          max_attempts?: number;
          payload?: Json;
          run_at?: string;
          status?: string;
          type: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          dedupe_key?: string | null;
          id?: string;
          last_error?: string | null;
          locked_at?: string | null;
          max_attempts?: number;
          payload?: Json;
          run_at?: string;
          status?: string;
          type?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      llm_usage: {
        Row: {
          audio_seconds: number;
          cached_tokens: number;
          cost_usd: number;
          created_at: string;
          feature: string;
          id: string;
          input_tokens: number;
          latency_ms: number | null;
          meta: Json | null;
          model: string;
          output_tokens: number;
          provider: string;
          reasoning_tokens: number;
          ref: Json | null;
          unit_prices: Json | null;
          user_id: string;
        };
        Insert: {
          audio_seconds?: number;
          cached_tokens?: number;
          cost_usd?: number;
          created_at?: string;
          feature: string;
          id?: string;
          input_tokens?: number;
          latency_ms?: number | null;
          meta?: Json | null;
          model: string;
          output_tokens?: number;
          provider: string;
          reasoning_tokens?: number;
          ref?: Json | null;
          unit_prices?: Json | null;
          user_id?: string;
        };
        Update: {
          audio_seconds?: number;
          cached_tokens?: number;
          cost_usd?: number;
          created_at?: string;
          feature?: string;
          id?: string;
          input_tokens?: number;
          latency_ms?: number | null;
          meta?: Json | null;
          model?: string;
          output_tokens?: number;
          provider?: string;
          reasoning_tokens?: number;
          ref?: Json | null;
          unit_prices?: Json | null;
          user_id?: string;
        };
        Relationships: [];
      };
      memories: {
        Row: {
          content: string;
          created_at: string;
          embedding: string | null;
          id: string;
          importance: number;
          kind: string;
          last_used_at: string | null;
          pinned: boolean;
          source: Json;
          status: string;
          updated_at: string;
          use_count: number;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          embedding?: string | null;
          id?: string;
          importance?: number;
          kind: string;
          last_used_at?: string | null;
          pinned?: boolean;
          source?: Json;
          status?: string;
          updated_at?: string;
          use_count?: number;
          user_id?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          embedding?: string | null;
          id?: string;
          importance?: number;
          kind?: string;
          last_used_at?: string | null;
          pinned?: boolean;
          source?: Json;
          status?: string;
          updated_at?: string;
          use_count?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          locale: string;
          settings: Json;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          locale?: string;
          settings?: Json;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          locale?: string;
          settings?: Json;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      search_chunks: {
        Row: {
          chunk_index: number;
          content: string;
          embedding: string | null;
          id: string;
          metadata: Json;
          source_id: string;
          source_type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          chunk_index?: number;
          content: string;
          embedding?: string | null;
          id?: string;
          metadata?: Json;
          source_id: string;
          source_type: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          chunk_index?: number;
          content?: string;
          embedding?: string | null;
          id?: string;
          metadata?: Json;
          source_id?: string;
          source_type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      undo_tokens: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          output: Json;
          tool: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          output: Json;
          tool: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          output?: Json;
          tool?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      v_llm_usage_by_feature: {
        Row: {
          audio_seconds: number | null;
          cached_tokens: number | null;
          calls: number | null;
          cost_usd: number | null;
          feature: string | null;
          input_tokens: number | null;
          model: string | null;
          month: string | null;
          output_tokens: number | null;
          provider: string | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      v_llm_usage_daily: {
        Row: {
          calls: number | null;
          cost_usd: number | null;
          day: string | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      v_llm_usage_monthly: {
        Row: {
          audio_seconds: number | null;
          cached_tokens: number | null;
          calls: number | null;
          cost_usd: number | null;
          input_tokens: number | null;
          month: string | null;
          output_tokens: number | null;
          user_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      claim_jobs: {
        Args: { p_batch?: number };
        Returns: {
          attempts: number;
          created_at: string;
          dedupe_key: string | null;
          id: string;
          last_error: string | null;
          locked_at: string | null;
          max_attempts: number;
          payload: Json;
          run_at: string;
          status: string;
          type: string;
          updated_at: string;
          user_id: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      enqueue_job: {
        Args: {
          p_dedupe_key?: string;
          p_payload?: Json;
          p_run_at?: string;
          p_type: string;
          p_user_id?: string;
        };
        Returns: string;
      };
      integration_secret_delete: {
        Args: { p_integration_id: string };
        Returns: undefined;
      };
      integration_secret_get: {
        Args: { p_integration_id: string };
        Returns: string;
      };
      integration_secret_set: {
        Args: { p_integration_id: string; p_secret: string };
        Returns: string;
      };
      match_memories: {
        Args: {
          p_embedding: string;
          p_include_archived?: boolean;
          p_k?: number;
          p_min_similarity?: number;
          p_user_id: string;
        };
        Returns: {
          content: string;
          id: string;
          importance: number;
          kind: string;
          pinned: boolean;
          similarity: number;
          source: Json;
        }[];
      };
      search_chunks_hybrid: {
        Args: {
          p_embedding: string;
          p_k?: number;
          p_query: string;
          p_types?: string[];
          p_user_id: string;
        };
        Returns: {
          chunk_index: number;
          content: string;
          id: string;
          metadata: Json;
          score: number;
          source_id: string;
          source_type: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
