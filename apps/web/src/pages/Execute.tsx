import { Link, useParams } from "react-router-dom";

// Placeholder only — implement once the Execute page manual is provided.
export default function Execute() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="min-h-screen bg-ink text-white flex flex-col items-center justify-center gap-4">
      <p className="text-muted">Execute page — coming soon{id ? ` (workflow: ${id})` : ""}.</p>
      <Link to="/marketplace" className="text-mint hover:underline">
        ← Marketplace로 돌아가기
      </Link>
    </div>
  );
}
