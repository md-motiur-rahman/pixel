// Hand-written to match supabase/schema.sql. Once the project is linked,
// replace with: npx supabase gen types typescript --linked > src/types/database.ts

export type Role = "admin" | "tester" | "dispatcher" | "checker" | "data_entry" | "master_stocker";
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
          /** Primary role — kept in step with `roles` by the database. */
          role: Role;
          /** Every role the person holds (admin first when they have it). */
          roles: Role[];
          is_active: boolean;
          created_at: string;
        },
        { id: string; full_name: string; email: string; role?: Role; roles?: Role[]; is_active?: boolean },
        { full_name?: string; role?: Role; roles?: Role[]; is_active?: boolean }
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
          quantity_adjustment: number;
          created_at: string;
        },
        { code?: string; model_variant_id: string; grade_id: string },
        { quantity?: number }
      >;
      units: Table<
        {
          id: string;
          sku_line_id: string;
          serial_number: string | null;
          note: string | null;
          status: UnitStatus;
          tester_id: string;
          tested_at: string;
          picked_by: string | null;
          picked_at: string | null;
          /** What the camera cost, entered by the tester. Null for cameras tested before this was recorded. */
          buying_price: number | null;
        },
        {
          sku_line_id: string;
          serial_number?: string | null;
          note?: string | null;
          tester_id: string;
          status?: UnitStatus;
          buying_price?: number | null;
        },
        {
          sku_line_id?: string;
          serial_number?: string | null;
          note?: string | null;
          status?: UnitStatus;
          picked_by?: string | null;
          picked_at?: string | null;
          buying_price?: number | null;
        }
      >;
      master_stock: Table<
        {
          unit_id: string;
          picked_by: string | null;
          picked_at: string;
          selling_price: number | null;
          priced_by: string | null;
          priced_at: string | null;
          /** Null while the camera is on hold, waiting for the master stocker. */
          accepted_at: string | null;
          accepted_by: string | null;
        },
        Record<string, never>,
        Record<string, never>
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
      model_asins: Table<
        { id: string; model_id: string; asin: string; created_by: string | null; created_at: string },
        { model_id: string; asin: string; created_by?: string | null },
        Record<string, never>
      >;
      variant_asins: Table<
        { id: string; variant_id: string; asin: string; position: number; created_at: string },
        Record<string, never>,
        Record<string, never>
      >;
      stock_adjustments: Table<
        {
          id: string;
          sku_line_id: string;
          adjusted_by: string;
          old_quantity: number;
          new_quantity: number;
          source: "inventory" | "stock_count";
          stock_count_id: string | null;
          note: string | null;
          created_at: string;
        },
        Record<string, never>,
        Record<string, never>
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
      attach_model_asin_to_variant: {
        Args: { p_variant_id: string; p_asin: string };
        Returns: undefined;
      };
      set_variant_asins: {
        Args: { p_variant_id: string; p_asins: string[] };
        Returns: undefined;
      };
      has_any_role: { Args: { p_roles: string[] }; Returns: boolean };
      set_master_stock_details: {
        Args: { p_unit_id: string; p_selling_price?: number | null; p_serial?: string | null };
        Returns: undefined;
      };
      refuse_master_stock: { Args: { p_unit_id: string }; Returns: undefined };
      empty_inventory: { Args: { p_admin_id: string }; Returns: number };
      delete_inventory_entry: {
        Args: { p_admin_id: string; p_variant_id: string };
        Returns: { cameras: number; model_removed: boolean; brand_removed: boolean };
      };
      zero_inventory: { Args: { p_admin_id: string }; Returns: number };
      resolve_stock_count_line: {
        Args: { p_stock_count_id: string; p_sku_line_id: string; p_expected_quantity: number };
        Returns: number;
      };
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
