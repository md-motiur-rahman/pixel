import { DataEntryScreen } from "./data-entry-screen";
import { listModelEntries } from "./actions";

export default async function DataEntryPage() {
  const entries = await listModelEntries("");
  return <DataEntryScreen initialEntries={entries} />;
}
