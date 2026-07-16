import { type NextRequest } from "next/server";
import { jsonError, jsonOk, positiveInteger, requireApiUser, requiredString } from "../../../_utils/supabase";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const type = body?.type === "income" || body?.type === "expense" ? body.type : null;
  const entryStatus = body?.entry_status === "planned" ? "planned" : "confirmed";
  const sourceType = ["subscription", "loan", "repayment"].includes(body?.source_type) ? body.source_type : null;
  const amount = positiveInteger(body?.amount);
  const title = requiredString(body?.title);
  const entryDate = requiredString(body?.entry_date);
  const category = requiredString(body?.category);
  const source = typeof body?.source === "string" ? body.source : "";
  const sourceId = requiredString(body?.source_id);
  const periodKey = requiredString(body?.period_key);
  const scheduledDate = requiredString(body?.scheduled_date);

  if (!type || !sourceType || !amount || !title || !entryDate || !category || !sourceId || !periodKey || !scheduledDate) {
    return jsonError("生成する収支データの必須項目が不足しています。", 422);
  }

  const entry = {
    user_id: auth.user.id,
    type,
    entry_status: entryStatus,
    title,
    amount,
    entry_date: entryDate,
    category,
    source,
    source_type: sourceType,
    source_id: sourceId,
    period_key: periodKey,
    scheduled_date: scheduledDate,
    excluded_at: null,
  };

  const { data: existing, error: existingError } = await auth.supabase
    .from("personal_entries")
    .select("id, excluded_at")
    .eq("user_id", auth.user.id)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .eq("period_key", periodKey)
    .eq("scheduled_date", scheduledDate)
    .maybeSingle();

  if (existingError) return jsonError(existingError.message, 400);
  if (existing?.excluded_at) return jsonOk({ skipped: true, id: existing.id });

  const query = existing
    ? auth.supabase.from("personal_entries").update(entry).eq("id", existing.id).select("*").single()
    : auth.supabase.from("personal_entries").insert(entry).select("*").single();

  const { data, error } = await query;
  if (error) return jsonError(error.message, 400);
  return jsonOk(data, { status: existing ? 200 : 201 });
}
