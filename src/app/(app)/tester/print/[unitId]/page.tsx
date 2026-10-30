import { LabelScreen } from "./label-screen";

export default async function PrintLabelPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  return <LabelScreen unitId={unitId} heading="Item saved" back={{ href: "/tester", label: "Test another item" }} />;
}
