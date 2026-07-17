import { type NextRequest } from "next/server";
import { jsonError, jsonOk, requireApiUser, requiredString } from "../_utils/supabase";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { data: memberships, error: memberError } = await auth.supabase
    .from("pair_members")
    .select("pair_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (memberError) return jsonError(memberError.message, 400);
  const pairId = memberships?.pair_id || null;
  if (!pairId) return jsonOk({ pair_id: null, pair: null, members: [] });

  const [{ data: pair, error: pairError }, { data: members, error: membersError }] = await Promise.all([
    auth.supabase.from("pairs").select("id, name, icon_url").eq("id", pairId).maybeSingle(),
    auth.supabase.from("pair_member_profiles").select("user_id, display_name").eq("pair_id", pairId),
  ]);

  if (pairError) return jsonError(pairError.message, 400);
  if (membersError) return jsonError(membersError.message, 400);
  return jsonOk({ pair_id: pairId, pair, members: members || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const pairName = requiredString(body?.pair_name) || "ふたりの家計簿";
  const inviteHash = requiredString(body?.invite_hash);
  const displayName = requiredString(body?.display_name);
  if (!inviteHash || !displayName) return jsonError("表示名と招待コードが必要です。", 422);

  const { error } = await auth.supabase.rpc("create_pair_with_invite_hash", {
    pair_name: pairName,
    invite_hash: inviteHash,
    display_name_input: displayName,
    icon_url_input: typeof body?.icon_url === "string" && body.icon_url.trim() ? body.icon_url.trim() : null,
  });

  if (error) return jsonError(error.message, 400);

  const { data: memberships, error: memberError } = await auth.supabase
    .from("pair_members")
    .select("pair_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (memberError) return jsonError(memberError.message, 400);

  const pairId = memberships?.pair_id || null;
  if (!pairId) return jsonOk({ pair_id: null, pair: null, members: [] }, { status: 201 });

  const [{ data: pair, error: pairError }, { data: members, error: membersError }] = await Promise.all([
    auth.supabase.from("pairs").select("id, name, icon_url").eq("id", pairId).maybeSingle(),
    auth.supabase.from("pair_member_profiles").select("user_id, display_name").eq("pair_id", pairId),
  ]);

  if (pairError) return jsonError(pairError.message, 400);
  if (membersError) return jsonError(membersError.message, 400);
  return jsonOk({ pair_id: pairId, pair, members: members || [] }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const pairId = requiredString(body?.pair_id);
  const pairName = requiredString(body?.name);
  const displayName = requiredString(body?.display_name);
  if (!pairId || !pairName || !displayName) return jsonError("ペア名と表示名を入力してください。", 422);

  const [{ error: pairError }, { error: memberError }] = await Promise.all([
    auth.supabase.from("pairs").update({ name: pairName, icon_url: body?.icon_url || null }).eq("id", pairId),
    auth.supabase.from("pair_members").update({ display_name: displayName }).eq("pair_id", pairId).eq("user_id", auth.user.id),
  ]);

  if (pairError) return jsonError(pairError.message, 400);
  if (memberError) return jsonError(memberError.message, 400);
  return jsonOk({ updated: true });
}
