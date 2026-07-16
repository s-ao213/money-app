import { type NextRequest } from "next/server";
import { jsonError, jsonOk, positiveInteger, requireApiUser, requiredString } from "../../../_utils/supabase";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const amount = positiveInteger(body?.amount);
  const paidAt = requiredString(body?.paid_at) || new Date().toISOString().slice(0, 10);
  if (!amount) return jsonError("返済金額を入力してください。", 422);

  const { data: loan, error: loanError } = await auth.supabase
    .from("loans")
    .select("id, principal_amount, lender_user_id, status, loan_repayments(amount)")
    .eq("id", id)
    .maybeSingle();

  if (loanError) return jsonError(loanError.message, 400);
  if (!loan) return jsonError("貸し借りが見つかりません。", 404);
  if (loan.lender_user_id !== auth.user.id) return jsonError("貸した人だけが返済登録できます。", 403);

  const repaid = (loan.loan_repayments || []).reduce((total: number, repayment: { amount: number }) => total + repayment.amount, 0);
  const remaining = Math.max(0, loan.principal_amount - repaid);
  if (amount > remaining) return jsonError("残金を超える返済は登録できません。", 422);

  const { data, error } = await auth.supabase
    .from("loan_repayments")
    .insert({
      loan_id: id,
      paid_at: paidAt,
      amount,
      method: typeof body?.method === "string" ? body.method : "送金",
      created_by: auth.user.id,
    })
    .select("*")
    .single();

  if (error) return jsonError(error.message, 400);
  if (remaining - amount <= 0) {
    await auth.supabase.from("loans").update({ status: "paid" }).eq("id", id).eq("lender_user_id", auth.user.id);
  }
  return jsonOk(data, { status: 201 });
}
