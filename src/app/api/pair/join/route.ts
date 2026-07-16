import { type NextRequest } from "next/server";
import { jsonError, jsonOk, requireApiUser, requiredString } from "../../_utils/supabase";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const inviteHash = requiredString(body?.invite_hash);
  const displayName = requiredString(body?.display_name);
  if (!inviteHash || !displayName) return jsonError("表示名と招待コードを入力してください。", 422);

  const { error } = await auth.supabase.rpc("join_pair_with_invite_hash", {
    invite_hash: inviteHash,
    display_name_input: displayName,
  });

  if (error) return jsonError(error.message, 400);
  return jsonOk({ joined: true }, { status: 201 });
}
