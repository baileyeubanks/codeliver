"use client";

import { useEffect } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import type { Comment } from "@/lib/types/codeliver";

export function useRealtimeComments(
  assetId: string,
  onNewComment: (comment: Comment) => void
) {
  useEffect(() => {
    const supabase = createSupabaseBrowser();

    const channel = supabase
      .channel(`comments:${assetId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
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
