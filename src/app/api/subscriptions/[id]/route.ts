import { type NextRequest } from "next/server";
import { jsonError, jsonOk, requireApiUser } from "../../_utils/supabase";
import { readSubscriptionPayload } from "../route";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { data, error } = await auth.supabase.from("subscriptions").select("*").eq("id", id).maybeSingle();
  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError("サブスクが見つかりません。", 404);
  return jsonOk(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const payload = readSubscriptionPayload(body, auth.user.id);
  if ("error" in payload) return jsonError(payload.error || "入力内容を確認してください。", 422);

  const { data, error } = await auth.supabase
    .from("subscriptions")
    .update(payload.data)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError("更新できるサブスクが見つかりません。", 404);
  return jsonOk(data);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const stopMode = body?.stop_mode === "next_month" ? "next_month" : "this_month";
  const now = new Date();
  const stopDate =
    stopMode === "next_month"
      ? `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, "0")}-01`
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const { data, error } = await auth.supabase
    .from("subscriptions")
    .update({ status: "ended", stop_billing_from: stopDate })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError("停止できるサブスクが見つかりません。", 404);

  if (stopMode === "this_month") {
    await auth.supabase
      .from("personal_entries")
      .update({ excluded_at: new Date().toISOString() })
      .eq("source_type", "subscription")
      .eq("source_id", id)
      .eq("entry_status", "planned");
  }

  return jsonOk(data);
}
