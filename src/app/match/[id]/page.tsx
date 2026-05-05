import { AppHeader } from "@/components/AppHeader";
import { MatchViewer } from "@/components/MatchViewer";

export default function MatchPage({ params }: { params: { id: string } }) {
  return (
    <>
      <AppHeader />
      <MatchViewer matchId={params.id} />
    </>
  );
}
