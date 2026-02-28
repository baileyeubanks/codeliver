import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-[var(--muted)] mb-4">Page not found</p>
        <Link
          href="/"
          className="text-sm text-[var(--accent)] hover:underline"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
