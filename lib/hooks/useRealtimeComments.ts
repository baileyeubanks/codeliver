"use client";

import { useEffect } from "react";
import { getSupabaseBrowserDataSchema } from "@/lib/data-authority";
import { hasSupabasePublicConfig } from "@/lib/public-env";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import type { Comment } from "@/lib/types/codeliver";

const HAS_SUPABASE_CONFIG = hasSupabasePublicConfig();

export function useRealtimeComments(
  assetId: string,
  onNewComment: (comment: Comment) => void
) {
  useEffect(() => {
    if (!assetId || !HAS_SUPABASE_CONFIG) return;

    const supabase = createSupabaseBrowser();

    const channel = supabase
      .channel(`comments:${assetId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: getSupabaseBrowserDataSchema(),
          table: "comments",
          filter: `asset_id=eq.${assetId}`,
        },
        (payload) => {
          const comment = payload.new as Comment;
          onNewComment(comment);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [assetId, onNewComment]);
}
