import { type NextRequest } from "next/server";
import { jsonError, jsonOk, positiveInteger, requireApiUser, requiredString } from "../../../_utils/supabase";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const title = requiredString(body?.title);
  const amount = positiveInteger(body?.amount);
  const entryDate = requiredString(body?.entry_date);
  const type = body?.type === "income" || body?.type === "expense" ? body.type : null;
  const entryStatus = body?.entry_status === "planned" ? "planned" : "confirmed";

  if (!title || !amount || !entryDate || !type || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    return jsonError("収支の種類、名前、金額、日付を正しく入力してください。", 422);
  }

  const { data, error } = await auth.supabase
    .from("personal_entries")
    .update({
      type,
      entry_status: entryStatus,
      title,
      amount,
      entry_date: entryDate,
      category: requiredString(body?.category) || "その他",
      source: typeof body?.source === "string" ? body.source : "",
    })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("*")
    .maybeSingle();

  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError("対象の収支が見つかりません。", 404);
  return jsonOk(data);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { data: target, error: findError } = await auth.supabase
    .from("personal_entries")
    .select("id, source_type")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (findError) return jsonError(findError.message, 400);
  if (!target) return jsonError("対象の収支が見つかりません。", 404);

  const result =
    target.source_type && target.source_type !== "manual"
      ? await auth.supabase.from("personal_entries").update({ excluded_at: new Date().toISOString() }).eq("id", id).eq("user_id", auth.user.id)
      : await auth.supabase.from("personal_entries").delete().eq("id", id).eq("user_id", auth.user.id);

  if (result.error) return jsonError(result.error.message, 400);
  return jsonOk({ id });
}
