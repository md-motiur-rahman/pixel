import { CLEARANCE_GRADE } from "@/lib/grades";
import { loadGradeUnits } from "@/lib/grade-units";
import { GradeUnitsTable } from "@/components/grade-units-table";

export default async function ClearancePage() {
  const result = await loadGradeUnits(CLEARANCE_GRADE, "clearance");
  return (
    <GradeUnitsTable
      title="Clearance"
      gradeLabel={`Grade ${CLEARANCE_GRADE}`}
      description="Items graded E — Clearance. They're kept out of the inventory and listed here."
      result={result}
    />
  );
}
