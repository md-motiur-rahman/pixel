import { listGrades } from "./search-actions";
import { TesterForm } from "./tester-form";
import { EditUnitPanel } from "./edit-unit-panel";

export default async function TesterPage() {
  const grades = await listGrades();
  return (
    <div className="space-y-4">
      <TesterForm grades={grades} />
      <EditUnitPanel grades={grades} />
    </div>
  );
}
