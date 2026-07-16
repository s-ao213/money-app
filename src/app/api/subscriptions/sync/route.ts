import { type NextRequest } from "next/server";
import { jsonError, jsonOk, requireApiUser } from "../../_utils/supabase";

type SubscriptionRow = {
  id: string;
  name: string;
  amount: number;
  payer_user_id: string;
  billing_cycle: "weekly" | "monthly" | "yearly";
  billing_day: number;
  billing_month: number;
  billing_weekday: number;
  renewal_day: number;
  renewal_weekday: number;
  status: "active" | "paused" | "ended";
  stop_billing_from: string | null;
};

function daysInMonth(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(year, monthIndex, 0).getDate();
}

function dateFor(month: string, day: number) {
  return `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, "0")}`;
}

function weekdayDateFor(month: string, weekday: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return dateFor(month, 1 + offset);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function subscriptionOccurs(subscription: SubscriptionRow, month: string) {
  if (subscription.status !== "active") return false;
  if (subscription.stop_billing_from && month >= subscription.stop_billing_from.slice(0, 7)) return false;
  if (subscription.billing_cycle === "weekly") return true;
  if (subscription.billing_cycle === "monthly") return true;
  return Number(month.slice(5, 7)) === subscription.billing_month;
}

function paymentDateForSubscription(subscription: SubscriptionRow, month: string) {
  if (subscription.billing_cycle === "weekly") return weekdayDateFor(month, subscription.billing_weekday ?? subscription.renewal_weekday ?? 1);
  return dateFor(month, subscription.billing_day || subscription.renewal_day || 1);
}

function periodKeyForSubscription(subscription: SubscriptionRow, month: string) {
  if (subscription.billing_cycle === "yearly") return month.slice(0, 4);
  if (subscription.billing_cycle === "weekly") return paymentDateForSubscription(subscription, month);
  return month;
}

function titleForSubscription(subscription: SubscriptionRow, month: string) {
  if (subscription.billing_cycle === "yearly") return `${subscription.name}（${month.slice(0, 4)}年分）`;
  if (subscription.billing_cycle === "weekly") {
    const paymentDate = paymentDateForSubscription(subscription, month);
    return `${subscription.name}（${Number(paymentDate.slice(5, 7))}月${Number(paymentDate.slice(8, 10))}日支払い）`;
  }
  return `${subscription.name}（${Number(month.slice(5, 7))}月分）`;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const month = typeof body?.month === "string" && /^\d{4}-\d{2}$/.test(body.month) ? body.month : null;
  if (!month) return jsonError("対象月をYYYY-MM形式で指定してください。", 422);

  const { data: subscriptions, error } = await auth.supabase.from("subscriptions").select("*");
  if (error) return jsonError(error.message, 400);

  let count = 0;
  for (const subscription of (subscriptions || []) as SubscriptionRow[]) {
    if (subscription.payer_user_id !== auth.user.id) continue;
    if (!subscriptionOccurs(subscription, month)) continue;

    const paymentDate = paymentDateForSubscription(subscription, month);
    const periodKey = periodKeyForSubscription(subscription, month);
    const baseEntry = {
      user_id: auth.user.id,
      type: "expense",
      entry_status: paymentDate <= todayKey() ? "confirmed" : "planned",
      title: titleForSubscription(subscription, month),
      amount: subscription.amount,
      entry_date: paymentDate,
      category: "サブスク",
      source: subscription.name,
      source_type: "subscription",
      source_id: subscription.id,
      period_key: periodKey,
      scheduled_date: paymentDate,
      excluded_at: null,
    };

    const { data: existing, error: existingError } = await auth.supabase
      .from("personal_entries")
      .select("id, excluded_at")
      .eq("user_id", auth.user.id)
      .eq("source_type", "subscription")
      .eq("source_id", subscription.id)
      .eq("period_key", periodKey)
      .eq("scheduled_date", paymentDate)
      .maybeSingle();

    if (existingError) return jsonError(existingError.message, 400);
    if (existing?.excluded_at) continue;

    const write = existing
      ? auth.supabase.from("personal_entries").update(baseEntry).eq("id", existing.id)
      : auth.supabase.from("personal_entries").insert(baseEntry);
    const { error: writeError } = await write;
    if (writeError) return jsonError(writeError.message, 400);
    count += 1;
  }

  return jsonOk({ count });
}
