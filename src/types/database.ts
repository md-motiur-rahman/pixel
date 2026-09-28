// Hand-written to match supabase/schema.sql. Once the project is linked,
// replace with: npx supabase gen types typescript --linked > src/types/database.ts

export type Role = "admin" | "tester" | "dispatcher" | "checker";
export type UnitStatus = "in_stock" | "picked" | "shipped";

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        {
          id: string;
          full_name: string;
          email: string;
          role: Role;
          is_active: boolean;
          created_at: string;
        },
        { id: string; full_name: string; email: string; role?: Role; is_active?: boolean },
        { full_name?: string; role?: Role; is_active?: boolean }
      >;
      brands: Table<{ id: string; name: string }, { name: string }, { name?: string }>;
      models: Table<
        { id: string; brand_id: string; name: string },
        { brand_id: string; name: string },
        { brand_id?: string; name?: string }
      >;
      model_variants: Table<
        { id: string; model_id: string; color: string },
        { model_id: string; color: string },
        { model_id?: string; color?: string }
      >;
      grades: Table<
        { id: string; code: string; label: string; sort_order: number },
        { code: string; label: string; sort_order?: number },
        { code?: string; label?: string; sort_order?: number }
      >;
      sku_lines: Table<
        {
          id: string;
          code: string;
          model_variant_id: string;
          grade_id: string;
          quantity: number;
          created_at: string;
        },
        { code?: string; model_variant_id: string; grade_id: string },
        { quantity?: number }
      >;
      units: Table<
        {
          id: string;
          sku_line_id: string;
          serial_number: string;
          note: string | null;
          status: UnitStatus;
          tester_id: string;
          tested_at: string;
          picked_by: string | null;
          picked_at: string | null;
        },
        {
          sku_line_id: string;
          serial_number: string;
          note?: string | null;
          tester_id: string;
          status?: UnitStatus;
        },
        {
          sku_line_id?: string;
          serial_number?: string;
          note?: string | null;
          status?: UnitStatus;
          picked_by?: string | null;
          picked_at?: string | null;
        }
      >;
      stock_counts: Table<
        {
          id: string;
          checker_id: string;
          started_at: string;
          finished_at: string | null;
          note: string | null;
        },
        { checker_id: string; note?: string | null },
        { finished_at?: string | null; note?: string | null }
      >;
      stock_count_scans: Table<
        { id: string; stock_count_id: string; unit_id: string; scanned_at: string },
        { stock_count_id: string; unit_id: string },
        Record<string, never>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      next_sku_code: { Args: Record<string, never>; Returns: string };
      app_role: { Args: Record<string, never>; Returns: Role };
      merge_brands: { Args: { source_id: string; target_id: string }; Returns: undefined };
      merge_models: { Args: { source_id: string; target_id: string }; Returns: undefined };
      merge_variants: { Args: { source_id: string; target_id: string }; Returns: undefined };
      get_stock_count_tally: {
        Args: { p_stock_count_id: string };
        Returns: {
          sku_line_id: string;
          brand: string;
          model: string;
          color: string;
          grade: string;
          system_qty: number;
          scanned_qty: number;
        }[];
      };
    };
  };
}
