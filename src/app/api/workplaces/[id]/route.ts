import { type NextRequest } from "next/server";
import { jsonError, jsonOk, requireApiUser } from "../../_utils/supabase";
import { readWorkplacePayload } from "../route";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const payload = readWorkplacePayload(body);
  if ("error" in payload) return jsonError(payload.error || "勤務先と給料日を入力してください。", 422);

  const { data, error } = await auth.supabase
    .from("workplaces")
    .update(payload.data)
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("*")
    .maybeSingle();

  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError("更新できる勤務先が見つかりません。", 404);
  return jsonOk(data);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { data, error } = await auth.supabase
    .from("workplaces")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("id")
    .maybeSingle();

  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError("削除できる勤務先が見つかりません。", 404);
  return jsonOk(data);
}
