import { type NextRequest } from "next/server";
import { jsonError, jsonOk, positiveInteger, requireApiUser, requiredString } from "../_utils/supabase";

function readWorkplacePayload(body: any) {
  const name = requiredString(body?.name);
  const isMonthEnd = body?.payday_is_month_end === true;
  const paydayDay = isMonthEnd ? null : positiveInteger(body?.payday_day);
  if (!name) return { error: "勤務先を入力してください。" as const };
  if (!isMonthEnd && !paydayDay) return { error: "給料日を入力してください。" as const };
  return { data: { name, payday_day: paydayDay, payday_is_month_end: isMonthEnd } };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("workplaces")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 400);
  return jsonOk(data || []);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const payload = readWorkplacePayload(body);
  if ("error" in payload) return jsonError(payload.error || "勤務先と給料日を入力してください。", 422);

  const { data, error } = await auth.supabase
    .from("workplaces")
    .insert({ user_id: auth.user.id, ...payload.data })
    .select("*")
    .single();

  if (error) return jsonError(error.message, 400);
  return jsonOk(data, { status: 201 });
}

export { readWorkplacePayload };
