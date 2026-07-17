import { type NextRequest } from "next/server";
import { jsonError, jsonOk, requireApiUser, requiredString } from "../../_utils/supabase";

export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const pairId = requiredString(body?.pair_id);
  if (!pairId) return jsonError("取り消す解消申請を確認できません。", 422);

  const { error } = await auth.supabase.rpc("cancel_pair_dissolution", { pair_id_input: pairId });
  if (error) return jsonError(error.message, 400);
  return jsonOk({ canceled: true });
}
