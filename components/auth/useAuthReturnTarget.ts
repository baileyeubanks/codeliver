"use client";

import { useEffect, useState } from "react";

export default function useAuthReturnTarget() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    function syncTarget() {
      setTarget(new URLSearchParams(window.location.search).get("next"));
    }

    syncTarget();
    window.addEventListener("popstate", syncTarget);
    return () => window.removeEventListener("popstate", syncTarget);
  }, []);

  return target;
}
