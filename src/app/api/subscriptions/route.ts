import { type NextRequest } from "next/server";
import { jsonError, jsonOk, positiveInteger, requireApiUser, requiredString } from "../_utils/supabase";

export function readSubscriptionPayload(body: any, userId: string) {
  const isShared = body?.is_shared !== false;
  const name = requiredString(body?.name);
  const amount = positiveInteger(body?.amount);
  const billingCycle = ["weekly", "monthly", "yearly"].includes(body?.billing_cycle) ? body.billing_cycle : null;
  if (!name || !amount || !billingCycle) return { error: "サブスク名、金額、支払い周期を正しく入力してください。" as const };

  const ownerUserId = isShared ? requiredString(body?.owner_user_id) : userId;
  const payerUserId = isShared ? requiredString(body?.payer_user_id) : userId;
  const pairId = isShared ? requiredString(body?.pair_id) : null;
  if (isShared && (!pairId || !ownerUserId || !payerUserId)) return { error: "共有サブスクはペア、契約者、支払者が必要です。" as const };

  return {
    data: {
      pair_id: pairId,
      created_by: userId,
      name,
      is_shared: isShared,
      owner_user_id: ownerUserId,
      payer_user_id: payerUserId,
      amount,
      billing_cycle: billingCycle,
      renewal_day: positiveInteger(body?.renewal_day) || 1,
      renewal_month: positiveInteger(body?.renewal_month) || 1,
      renewal_weekday: typeof body?.renewal_weekday === "number" ? Math.max(0, Math.min(6, body.renewal_weekday)) : 1,
      billing_day: isShared ? positiveInteger(body?.billing_day) || positiveInteger(body?.renewal_day) || 1 : positiveInteger(body?.renewal_day) || 1,
      billing_month: isShared ? positiveInteger(body?.billing_month) || positiveInteger(body?.renewal_month) || 1 : positiveInteger(body?.renewal_month) || 1,
      billing_weekday: isShared
        ? typeof body?.billing_weekday === "number" ? Math.max(0, Math.min(6, body.billing_weekday)) : typeof body?.renewal_weekday === "number" ? body.renewal_weekday : 1
        : typeof body?.renewal_weekday === "number" ? body.renewal_weekday : 1,
      share_type: body?.share_type === "fixed" ? "fixed" : "percentage",
      partner_share_value: Math.max(0, Number(body?.partner_share_value || 0)),
      memo: typeof body?.memo === "string" ? body.memo : "",
      status: "active",
    },
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("subscriptions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 400);
  return jsonOk(data || []);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const payload = readSubscriptionPayload(body, auth.user.id);
  if ("error" in payload) return jsonError(payload.error || "入力内容を確認してください。", 422);

  const { data, error } = await auth.supabase
    .from("subscriptions")
    .insert(payload.data)
    .select("*")
    .single();

  if (error) return jsonError(error.message, 400);
  return jsonOk(data, { status: 201 });
}
