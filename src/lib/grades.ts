// Grades that are not inventory. Cameras with these grades are kept off the
// Inventory page (and its totals and CSV) and listed on their own pages instead.
// Keep in step with grades.in_inventory (supabase/migration_12_repair_clearance_grades.sql).
export const REPAIR_GRADE = "D";
export const CLEARANCE_GRADE = "E";

const NON_INVENTORY_GRADES = new Set([REPAIR_GRADE, CLEARANCE_GRADE]);

export function isInventoryGrade(code: string): boolean {
  return !NON_INVENTORY_GRADES.has(code);
}
