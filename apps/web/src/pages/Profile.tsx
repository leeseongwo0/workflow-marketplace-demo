import { Link } from "react-router-dom";

// Placeholder only — implement once the Profile page manual is provided.
export default function Profile() {
  return (
    <div className="min-h-screen bg-ink text-white flex flex-col items-center justify-center gap-4">
      <p className="text-muted">Profile page — coming soon.</p>
      <Link to="/marketplace" className="text-mint hover:underline">
        ← Marketplace로 돌아가기
      </Link>
    </div>
  );
}
