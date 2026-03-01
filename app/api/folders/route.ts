import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

type FolderRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  position: number;
  created_by: string | null;
  created_at: string;
};

type FolderTree = FolderRow & { children: FolderTree[] };

function buildTree(rows: FolderRow[]): FolderTree[] {
  const map = new Map<string, FolderTree>();
  const roots: FolderTree[] = [];

  for (const row of rows) {
    map.set(row.id, { ...row, children: [] });
  }

  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortByPosition = (list: FolderTree[]) => {
    list.sort((a, b) => a.position - b.position);
    list.forEach((n) => sortByPosition(n.children));
  };
  sortByPosition(roots);
  return roots;
}

export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json(
      { error: "project_id is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(buildTree(data || []));
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { project_id, name, parent_id } = body;

  if (!project_id || !name) {
    return NextResponse.json(
      { error: "project_id and name are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  // Get next position
  const { data: siblings } = await supabase
    .from("folders")
    .select("position")
    .eq("project_id", project_id)
    .is("parent_id", parent_id || null)
    .order("position", { ascending: false })
    .limit(1);

  const nextPos = siblings && siblings.length > 0 ? siblings[0].position + 1 : 0;

  const { data, error } = await supabase
    .from("folders")
    .insert({
      project_id,
      name,
      parent_id: parent_id || null,
      position: nextPos,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, name, parent_id, position } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (parent_id !== undefined) updates.parent_id = parent_id || null;
  if (position !== undefined) updates.position = position;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("folders")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Get folder to find its parent
  const { data: folder } = await supabase
    .from("folders")
    .select("parent_id")
    .eq("id", id)
    .single();

  // Move children to deleted folder's parent
  if (folder) {
    await supabase
      .from("folders")
      .update({ parent_id: folder.parent_id })
      .eq("parent_id", id);
  }

  // Move assets in this folder to no folder
  await supabase
    .from("assets")
    .update({ folder_id: null })
    .eq("folder_id", id);

  const { error } = await supabase.from("folders").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
