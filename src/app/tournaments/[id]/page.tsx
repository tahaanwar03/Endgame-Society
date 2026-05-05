import { AppHeader } from "@/components/AppHeader";
import { TournamentDashboard } from "@/components/TournamentDashboard";

function decodeParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function TournamentDashboardPage({ params }: { params: { id: string } }) {
  return (
    <>
      <AppHeader />
      <TournamentDashboard tournamentId={decodeParam(params.id)} />
    </>
  );
}
