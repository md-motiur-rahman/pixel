import { REPAIR_GRADE } from "@/lib/grades";
import { loadGradeUnits } from "@/lib/grade-units";
import { GradeUnitsTable } from "@/components/grade-units-table";

export default async function RepairPage() {
  const result = await loadGradeUnits(REPAIR_GRADE, "repair");
  return (
    <GradeUnitsTable
      title="Repair"
      gradeLabel={`Grade ${REPAIR_GRADE}`}
      description="Cameras graded D — Repair. They're kept out of the inventory. Once one is fixed, regrade it in Tester → Find a saved camera and it moves into the inventory."
      result={result}
    />
  );
}
