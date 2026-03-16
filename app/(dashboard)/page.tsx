"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/projects");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen bg-[var(--bg)]">
      <div className="spinner" />
    </div>
  );
}
