import { type NextRequest } from "next/server";
import { jsonError, jsonOk, requireApiUser, requiredString } from "../_utils/supabase";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { data: memberships, error: memberError } = await auth.supabase
    .from("pair_members")
    .select("pair_id")
    .eq("user_id", auth.user.id)
    .is("ended_at", null)
    .maybeSingle();

  if (memberError) return jsonError(memberError.message, 400);
  const pairId = memberships?.pair_id || null;
  if (!pairId) return jsonOk({ pair_id: null, pair: null, members: [] });

  const [{ data: pair, error: pairError }, { data: members, error: membersError }] = await Promise.all([
    auth.supabase.from("pairs").select("id, name, icon_url, created_by, deleted_at, dissolution_requested_by, dissolution_requested_at").eq("id", pairId).maybeSingle(),
    auth.supabase.from("pair_member_profiles").select("user_id, display_name, avatar_url, role").eq("pair_id", pairId).is("ended_at", null),
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
    .is("ended_at", null)
    .maybeSingle();
  if (memberError) return jsonError(memberError.message, 400);

  const pairId = memberships?.pair_id || null;
  if (!pairId) return jsonOk({ pair_id: null, pair: null, members: [] }, { status: 201 });

  const [{ data: pair, error: pairError }, { data: members, error: membersError }] = await Promise.all([
    auth.supabase.from("pairs").select("id, name, icon_url, created_by, deleted_at, dissolution_requested_by, dissolution_requested_at").eq("id", pairId).maybeSingle(),
    auth.supabase.from("pair_member_profiles").select("user_id, display_name, avatar_url, role").eq("pair_id", pairId).is("ended_at", null),
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

  const { error } = await auth.supabase.rpc("update_pair_settings", {
    pair_id_input: pairId,
    pair_name: pairName,
    icon_url_input: typeof body?.icon_url === "string" ? body.icon_url : "",
    display_name_input: displayName,
  });
  if (error) return jsonError(error.message, 400);
  return jsonOk({ updated: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const pairId = requiredString(body?.pair_id);
  if (!pairId) return jsonError("解消するペアを確認できません。", 422);
  const { data: status, error } = await auth.supabase.rpc("request_or_confirm_pair_dissolution", { pair_id_input: pairId });
  if (error) return jsonError(error.message, 400);
  return jsonOk({ status });
}
