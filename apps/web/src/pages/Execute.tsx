import { Link, useLocation, useParams } from "react-router-dom";

// Placeholder only — implement once the Execute page manual is provided.
export default function Execute() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const cameFromProfile = (location.state as { from?: string } | null)?.from === "profile";

  return (
    <div className="min-h-screen bg-ink text-white flex flex-col items-center justify-center gap-4">
      <p className="text-muted">Execute page — coming soon{id ? ` (workflow: ${id})` : ""}.</p>
      {cameFromProfile ? (
        <Link to="/profile" className="text-mint hover:underline">
          ← 프로필로 돌아가기
        </Link>
      ) : (
        <Link to="/marketplace" className="text-mint hover:underline">
          ← Marketplace로 돌아가기
        </Link>
      )}
    </div>
  );
}
