import { type NextRequest } from "next/server";
import { jsonError, jsonOk, requireApiUser, requiredString } from "../../_utils/supabase";

export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const pairId = requiredString(body?.pair_id);
  const inviteHash = requiredString(body?.invite_hash);
  if (!pairId || !inviteHash) return jsonError("招待コードを発行できません。", 422);

  const { error } = await auth.supabase.rpc("regenerate_pair_invite_hash", {
    pair_id_input: pairId,
    invite_hash: inviteHash,
  });

  if (error) return jsonError(error.message, 400);
  return jsonOk({ updated: true });
}
