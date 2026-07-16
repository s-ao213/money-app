import { type NextRequest } from "next/server";
import { jsonError, jsonOk, positiveInteger, requireApiUser, requiredString } from "../../_utils/supabase";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { data, error } = await auth.supabase.from("loans").select("*, loan_repayments(*)").eq("id", id).maybeSingle();
  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError("貸し借りが見つかりません。", 404);
  return jsonOk(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const title = requiredString(body?.title);
  const amount = positiveInteger(body?.principal_amount);
  if (!title || !amount) return jsonError("貸し借り名と金額を入力してください。", 422);

  const { data, error } = await auth.supabase
    .from("loans")
    .update({
      title,
      principal_amount: amount,
      due_date: requiredString(body?.due_date),
      repayment_type: ["lump_sum", "installment", "flexible"].includes(body?.repayment_type) ? body.repayment_type : "installment",
      installment_count: positiveInteger(body?.installment_count) || 1,
      monthly_amount: positiveInteger(body?.monthly_amount) || 0,
      repayment_day: positiveInteger(body?.repayment_day) || 25,
      repayment_day_mode: body?.repayment_day_mode === "payday" ? "payday" : "day",
      repayment_workplace_id: requiredString(body?.repayment_workplace_id),
      memo: typeof body?.memo === "string" ? body.memo : "",
    })
    .eq("id", id)
    .eq("lender_user_id", auth.user.id)
    .select("*, loan_repayments(*)")
    .maybeSingle();

  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError("貸した人だけが編集できます。", 403);
  return jsonOk(data);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { data, error } = await auth.supabase
    .from("loans")
    .update({ status: "canceled" })
    .eq("id", id)
    .eq("lender_user_id", auth.user.id)
    .select("id")
    .maybeSingle();

  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError("貸した人だけが削除できます。", 403);
  return jsonOk(data);
}
