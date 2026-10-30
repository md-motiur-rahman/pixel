import { REPAIR_GRADE } from "@/lib/grades";
import { loadGradeUnits } from "@/lib/grade-units";
import { GradeUnitsTable } from "@/components/grade-units-table";
import { listGradeOptions } from "../amazon/actions";

export default async function RepairPage() {
  const [result, grades] = await Promise.all([loadGradeUnits(REPAIR_GRADE, "repair"), listGradeOptions()]);
  return (
    <GradeUnitsTable
      title="Repair"
      gradeLabel={`Grade ${REPAIR_GRADE}`}
      description="Items graded D — Repair. They're kept out of the inventory. Once one is fixed, press Repaired and give it its new grade: it goes back into the inventory and onto the Amazon list, and you print its new label."
      labelFrom="repair"
      repairGrades={grades.filter((g) => g.code !== REPAIR_GRADE)}
      result={result}
    />
  );
}
