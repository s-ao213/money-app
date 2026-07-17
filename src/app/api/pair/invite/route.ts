import { type NextRequest } from "next/server";
import { jsonError, requireApiUser } from "../../_utils/supabase";

export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;
  return jsonError("ペア作成後に招待コードを再発行することはできません。", 410);
}
