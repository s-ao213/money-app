import { type NextRequest } from "next/server";
import { jsonError, jsonOk, positiveInteger, requireApiUser, requiredString } from "../_utils/supabase";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("loans")
    .select("*, loan_repayments(*)")
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 400);
  return jsonOk(data || []);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const pairId = requiredString(body?.pair_id);
  const title = requiredString(body?.title);
  const amount = positiveInteger(body?.principal_amount);
  const borrowerUserId = requiredString(body?.borrower_user_id);
  const borrowedAt = requiredString(body?.borrowed_at);
  const dueDate = requiredString(body?.due_date);
  const repaymentType = ["lump_sum", "installment", "flexible"].includes(body?.repayment_type) ? body.repayment_type : "installment";
  const installmentCount = positiveInteger(body?.installment_count) || 1;

  if (!pairId || !title || !amount || !borrowerUserId || !borrowedAt || !dueDate) {
    return jsonError("貸し借り名、金額、借りた人、日付を正しく入力してください。", 422);
  }

  const { data, error } = await auth.supabase
    .from("loans")
    .insert({
      pair_id: pairId,
      title,
      lender_user_id: auth.user.id,
      borrower_user_id: borrowerUserId,
      principal_amount: amount,
      borrowed_at: borrowedAt,
      due_date: dueDate,
      repayment_type: repaymentType,
      installment_count: installmentCount,
      monthly_amount: positiveInteger(body?.monthly_amount) || Math.ceil(amount / installmentCount),
      repayment_day: positiveInteger(body?.repayment_day) || 25,
      repayment_day_mode: body?.repayment_day_mode === "payday" ? "payday" : "day",
      repayment_workplace_id: requiredString(body?.repayment_workplace_id),
      memo: typeof body?.memo === "string" ? body.memo : "",
      status: "active",
    })
    .select("*, loan_repayments(*)")
    .single();

  if (error) return jsonError(error.message, 400);
  return jsonOk(data, { status: 201 });
}
