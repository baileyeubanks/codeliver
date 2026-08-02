import { NextResponse } from "next/server";
import { getAssetAccess, getAssetComment } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_REACTION_EMOJIS = ["👍", "❤️", "👀", "🔥", "✅"] as const;
const REACTION_ORDER = new Map(
  ALLOWED_REACTION_EMOJIS.map((emoji, index) => [emoji, index]),
);

type ReactionEmoji = (typeof ALLOWED_REACTION_EMOJIS)[number];
type DataClient = ReturnType<typeof getSupabase>;
type JsonObject = Record<string, unknown>;
type AuthorizedComment = {
  commentId: string;
  assetId: string;
  versionId: string | null;
};
type ReactionRow = {
  emoji?: unknown;
  user_id?: unknown;
};
type ReactionAggregate = {
  emoji: ReactionEmoji;
  count: number;
  reacted_by_me: boolean;
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function internalErrorResponse() {
  return errorResponse("Unable to process reaction request", 500);
}

function accessFailureResponse(status: number) {
  return status >= 500
    ? internalErrorResponse()
    : errorResponse("Comment not found", 404);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return (
    typeof value === "string" &&
    (ALLOWED_REACTION_EMOJIS as readonly string[]).includes(value)
  );
}

async function authenticatedUser() {
  try {
    return await requireAuth();
  } catch {
    return null;
  }
}

async function readJsonObject(request: Request): Promise<JsonObject | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as JsonObject)
      : null;
  } catch {
    return null;
  }
}

async function authorizeComment(
  supabase: DataClient,
  commentId: string,
  userId: string,
): Promise<
  | { ok: true; comment: AuthorizedComment }
  | { ok: false; response: NextResponse }
> {
  const { data: locator, error: locatorError } = await supabase
    .from("comments")
    .select("id, asset_id")
    .eq("id", commentId)
    .maybeSingle();

  if (locatorError) {
    return { ok: false, response: internalErrorResponse() };
  }
  if (!locator || typeof locator.asset_id !== "string") {
    return {
      ok: false,
      response: errorResponse("Comment not found", 404),
    };
  }

  const comment = await getAssetComment(
    commentId,
    locator.asset_id,
    supabase,
  );
  if (!comment.ok) {
    return {
      ok: false,
      response: accessFailureResponse(comment.status),
    };
  }
  if (
    comment.data.asset_id !== locator.asset_id ||
    (comment.data.version_id !== null &&
      typeof comment.data.version_id !== "string")
  ) {
    return { ok: false, response: internalErrorResponse() };
  }

  const assetAccess = await getAssetAccess(
    comment.data.asset_id,
    userId,
    "viewer",
    supabase,
  );
  if (!assetAccess.ok) {
    return {
      ok: false,
      response: accessFailureResponse(assetAccess.status),
    };
  }

  return {
    ok: true,
    comment: {
      commentId: comment.data.id,
      assetId: comment.data.asset_id,
      versionId: comment.data.version_id,
    },
  };
}

function aggregateReactions(rows: ReactionRow[], userId: string) {
  const aggregates = new Map<ReactionEmoji, ReactionAggregate>();

  for (const row of rows) {
    if (!isReactionEmoji(row.emoji)) continue;
    const existing = aggregates.get(row.emoji) ?? {
      emoji: row.emoji,
      count: 0,
      reacted_by_me: false,
    };
    existing.count += 1;
    existing.reacted_by_me ||= row.user_id === userId;
    aggregates.set(row.emoji, existing);
  }

  return [...aggregates.values()].sort(
    (left, right) =>
      (REACTION_ORDER.get(left.emoji) ?? Number.MAX_SAFE_INTEGER) -
      (REACTION_ORDER.get(right.emoji) ?? Number.MAX_SAFE_INTEGER),
  );
}

async function loadReactionAggregates(
  supabase: DataClient,
  commentId: string,
  userId: string,
): Promise<
  | { ok: true; reactions: ReactionAggregate[] }
  | { ok: false; response: NextResponse }
> {
  const { data, error } = await supabase
    .from("comment_reactions")
    .select("emoji, user_id")
    .eq("comment_id", commentId)
    .order("created_at", { ascending: true });

  if (error || !Array.isArray(data)) {
    return { ok: false, response: internalErrorResponse() };
  }

  return {
    ok: true,
    reactions: aggregateReactions(data as ReactionRow[], userId),
  };
}

function reactionForEmoji(
  reactions: ReactionAggregate[],
  emoji: ReactionEmoji,
): ReactionAggregate {
  return (
    reactions.find((reaction) => reaction.emoji === emoji) ?? {
      emoji,
      count: 0,
      reacted_by_me: false,
    }
  );
}

export async function GET(request: Request) {
  const user = await authenticatedUser();
  if (!user?.id) {
    return errorResponse("Unauthorized", 401);
  }

  const commentId = new URL(request.url).searchParams.get("comment_id")?.trim();
  if (!isUuid(commentId)) {
    return errorResponse("A valid comment_id is required", 400);
  }

  try {
    const supabase = getSupabase();
    const access = await authorizeComment(supabase, commentId, user.id);
    if (!access.ok) return access.response;

    const reactions = await loadReactionAggregates(
      supabase,
      access.comment.commentId,
      user.id,
    );
    if (!reactions.ok) return reactions.response;

    return NextResponse.json({ reactions: reactions.reactions });
  } catch {
    return internalErrorResponse();
  }
}

export async function POST(request: Request) {
  const user = await authenticatedUser();
  if (!user?.id) {
    return errorResponse("Unauthorized", 401);
  }

  const body = await readJsonObject(request);
  const commentId = body?.comment_id;
  const emoji = body?.emoji;
  if (!isUuid(commentId) || !isReactionEmoji(emoji)) {
    return errorResponse(
      "A valid comment_id and supported emoji are required",
      400,
    );
  }

  try {
    const supabase = getSupabase();
    const access = await authorizeComment(supabase, commentId, user.id);
    if (!access.ok) return access.response;

    const { error } = await supabase.from("comment_reactions").upsert(
      {
        comment_id: access.comment.commentId,
        user_id: user.id,
        emoji,
      },
      { onConflict: "comment_id,user_id,emoji" },
    );
    if (error) {
      return internalErrorResponse();
    }

    const reactions = await loadReactionAggregates(
      supabase,
      access.comment.commentId,
      user.id,
    );
    if (!reactions.ok) return reactions.response;

    return NextResponse.json(
      { reaction: reactionForEmoji(reactions.reactions, emoji) },
      { status: 201 },
    );
  } catch {
    return internalErrorResponse();
  }
}

export async function DELETE(request: Request) {
  const user = await authenticatedUser();
  if (!user?.id) {
    return errorResponse("Unauthorized", 401);
  }

  const body = await readJsonObject(request);
  const commentId = body?.comment_id;
  const emoji = body?.emoji;
  if (!isUuid(commentId) || !isReactionEmoji(emoji)) {
    return errorResponse(
      "A valid comment_id and supported emoji are required",
      400,
    );
  }

  try {
    const supabase = getSupabase();
    const access = await authorizeComment(supabase, commentId, user.id);
    if (!access.ok) return access.response;

    const { error } = await supabase
      .from("comment_reactions")
      .delete()
      .eq("comment_id", access.comment.commentId)
      .eq("user_id", user.id)
      .eq("emoji", emoji);
    if (error) {
      return internalErrorResponse();
    }

    const reactions = await loadReactionAggregates(
      supabase,
      access.comment.commentId,
      user.id,
    );
    if (!reactions.ok) return reactions.response;

    return NextResponse.json({
      ok: true,
      reaction: reactionForEmoji(reactions.reactions, emoji),
    });
  } catch {
    return internalErrorResponse();
  }
}
