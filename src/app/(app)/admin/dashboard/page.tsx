import { DashboardScreen } from "./dashboard-screen";

// The numbers load in the browser so "today" and "this week" follow the admin's
// own clock, not the server's.
export default function DashboardPage() {
  return <DashboardScreen />;
}
