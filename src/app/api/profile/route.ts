import { type NextRequest } from "next/server";
import { jsonError, jsonOk, requireApiUser, requiredString } from "../_utils/supabase";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) return jsonError(error.message, 400);
  return jsonOk(data || { display_name: "", avatar_url: null });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const displayName = requiredString(body?.display_name);
  if (!displayName) return jsonError("表示名を入力してください。", 422);

  const { data, error } = await auth.supabase
    .from("profiles")
    .upsert({
      id: auth.user.id,
      display_name: displayName,
      avatar_url: typeof body?.avatar_url === "string" && body.avatar_url.trim() ? body.avatar_url.trim() : null,
    })
    .select("display_name, avatar_url")
    .single();

  if (error) return jsonError(error.message, 400);
  return jsonOk(data);
}
