import { type NextRequest } from "next/server";
import { jsonError, jsonOk, positiveInteger, requireApiUser, requiredString } from "../../_utils/supabase";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const month = request.nextUrl.searchParams.get("month");
  let query = auth.supabase
    .from("personal_entries")
    .select("*")
    .eq("user_id", auth.user.id)
    .is("excluded_at", null)
    .order("entry_date", { ascending: false });

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    query = query.gte("entry_date", `${month}-01`).lt("entry_date", `${month}-32`);
  }

  const { data, error } = await query;
  if (error) return jsonError(error.message, 400);
  return jsonOk(data || []);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const title = requiredString(body?.title);
  const amount = positiveInteger(body?.amount);
  const entryDate = requiredString(body?.entry_date);
  const type = body?.type === "income" || body?.type === "expense" ? body.type : null;

  if (!title || !amount || !entryDate || !type || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    return jsonError("収支の種類、名前、金額、日付を正しく入力してください。", 422);
  }

  const { data, error } = await auth.supabase
    .from("personal_entries")
    .insert({
      user_id: auth.user.id,
      type,
      entry_status: "confirmed",
      title,
      amount,
      entry_date: entryDate,
      category: requiredString(body?.category) || "その他",
      source: typeof body?.source === "string" ? body.source : "",
      source_type: "manual",
    })
    .select("*")
    .single();

  if (error) return jsonError(error.message, 400);
  return jsonOk(data, { status: 201 });
}
