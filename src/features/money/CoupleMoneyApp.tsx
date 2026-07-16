"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Copy,
  Download,
  Building2,
  HandCoins,
  ImagePlus,
  KeyRound,
  LogOut,
  Menu,
  Pencil,
  PieChart,
  Plus,
  ReceiptText,
  RefreshCcw,
  Save,
  Tag,
  Trash2,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";

type Person = "me" | "partner";
type BillingCycle = "weekly" | "monthly" | "yearly";
type BillingDayMode = "day" | "end_of_month" | "payday";
type ShareType = "percentage" | "fixed";
type RepaymentType = "lump_sum" | "installment" | "flexible";
type MoneyType = "income" | "expense";
type EntryStatus = "planned" | "confirmed";
type SourceType = "manual" | "subscription" | "loan" | "repayment";

type PairMember = { user_id: string; display_name: string };

type PairInfo = {
  id: string;
  name: string;
  icon_url: string | null;
};

type PairApiState = {
  pair_id: string | null;
  pair: PairInfo | null;
  members: PairMember[];
};

type Subscription = {
  id: string;
  pair_id: string | null;
  created_by: string;
  name: string;
  is_shared: boolean;
  owner_user_id: string;
  payer_user_id: string;
  amount: number;
  billing_cycle: BillingCycle;
  renewal_day: number;
  renewal_month: number;
  renewal_weekday: number;
  billing_day: number;
  billing_month: number;
  billing_weekday: number;
  share_type: ShareType;
  partner_share_value: number;
  status: "active" | "paused" | "ended";
  stop_billing_from: string | null;
  memo: string;
};

type Loan = {
  id: string;
  pair_id: string;
  title: string;
  lender_user_id: string;
  borrower_user_id: string;
  principal_amount: number;
  borrowed_at: string;
  due_date: string;
  repayment_type: RepaymentType;
  installment_count: number;
  monthly_amount: number;
  repayment_day: number;
  repayment_day_mode: "day" | "payday";
  repayment_workplace_id: string | null;
  memo: string;
  status: "active" | "paid" | "overdue" | "canceled";
  loan_repayments: Repayment[];
};

type Repayment = {
  id: string;
  loan_id: string;
  paid_at: string;
  amount: number;
  method: string;
};

type PersonalEntry = {
  id: string;
  user_id: string;
  type: MoneyType;
  entry_status: EntryStatus;
  title: string;
  amount: number;
  entry_date: string;
  category: string;
  source: string;
  source_type: SourceType;
  source_id: string | null;
  period_key: string | null;
  scheduled_date: string | null;
  excluded_at: string | null;
};

type PersonalCategory = {
  id: string;
  user_id?: string;
  pair_id?: string | null;
  type: MoneyType;
  name: string;
};

type Workplace = {
  id: string;
  user_id: string;
  name: string;
  payday_day: number | null;
  payday_is_month_end: boolean;
};

type PaymentRow = {
  id: string;
  date: string;
  kind: string;
  payer: Person;
  receiver: string;
  amount: number;
  status: "予定" | "完了" | "不足";
};

export type AppView =
  | "dashboard"
  | "subscriptions"
  | "subscriptionNew"
  | "subscriptionDetail"
  | "subscriptionEdit"
  | "loans"
  | "loanNew"
  | "loanDetail"
  | "loanEdit"
  | "personal"
  | "personalIncomeNew"
  | "personalExpenseNew"
  | "personalCategoryNew"
  | "personalDetail"
  | "myPage";

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const today = new Date();
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

const defaultCategories: PersonalCategory[] = [
  { id: "salary", type: "income", name: "給与" },
  { id: "side-job", type: "income", name: "副業" },
  { id: "food", type: "expense", name: "食費" },
  { id: "daily", type: "expense", name: "日用品" },
  { id: "entertainment", type: "expense", name: "娯楽" },
  { id: "other", type: "expense", name: "その他" },
];

const weekdayOptions: [string, string][] = [
  ["0", "日曜日"],
  ["1", "月曜日"],
  ["2", "火曜日"],
  ["3", "水曜日"],
  ["4", "木曜日"],
  ["5", "金曜日"],
  ["6", "土曜日"],
];

const subscriptionDefaults = {
  name: "",
  is_shared: true,
  owner: "me" as Person,
  payer: "me" as Person,
  amount: 0,
  billing_cycle: "monthly" as BillingCycle,
  billing_day_mode: "day" as BillingDayMode,
  renewal_day: 1,
  renewal_month: 1,
  renewal_weekday: 1,
  billing_day: 1,
  billing_month: 1,
  billing_weekday: 1,
  share_type: "percentage" as ShareType,
  partner_share_value: 50,
  memo: "",
};

const loanDefaults = {
  title: "",
  lender: "me" as Person,
  principal_amount: 0,
  borrowed_at: `${currentMonth}-01`,
  due_date: `${currentMonth}-28`,
  repayment_type: "installment" as RepaymentType,
  installment_count: 6,
  monthly_amount: 0,
  repayment_day: 25,
  repayment_day_mode: "day" as "day" | "payday",
  repayment_workplace_id: "",
  memo: "",
};

function makeEntryDefaults(type: MoneyType) {
  return {
    type,
    title: "",
    amount: 0,
    entry_date: `${currentMonth}-01`,
    category: type === "income" ? "給与" : "その他",
    source: "",
    entry_status: "confirmed" as EntryStatus,
  };
}

function monthOf(date: string) {
  return date.slice(0, 7);
}

function addMonths(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}/${Number(monthNumber)}`;
}

function daysInMonth(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(year, monthIndex, 0).getDate();
}

function dateFor(month: string, day: number) {
  return `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, "0")}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function sum(rows: { amount: number }[]) {
  return rows.reduce((total, row) => total + Number(row.amount), 0);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error("timeout")), timeoutMs);
    }),
  ]);
}

function ownerShare(subscription: Subscription, owner: Person) {
  const partnerSideShare =
    subscription.share_type === "percentage"
      ? Math.round(subscription.amount * (subscription.partner_share_value / 100))
      : Math.min(subscription.partner_share_value, subscription.amount);
  return owner === "me" ? subscription.amount - partnerSideShare : partnerSideShare;
}

function subscriptionOccurs(subscription: Subscription, month: string) {
  if (subscription.status !== "active") return false;
  if (subscription.stop_billing_from && month >= subscription.stop_billing_from.slice(0, 7)) return false;
  if (subscription.billing_cycle === "weekly") return true;
  if (subscription.billing_cycle === "monthly") return true;
  return Number(month.slice(5, 7)) === subscription.billing_month;
}

function weekdayDateFor(month: string, weekday: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return dateFor(month, 1 + offset);
}

function paymentDateForSubscription(subscription: Subscription, month: string) {
  if (subscription.billing_cycle === "weekly") return weekdayDateFor(month, subscription.billing_weekday ?? subscription.renewal_weekday ?? 1);
  return dateFor(month, subscription.billing_day || subscription.renewal_day || 1);
}

function periodKeyForSubscription(subscription: Subscription, month: string) {
  if (subscription.billing_cycle === "yearly") return `${month.slice(0, 4)}`;
  if (subscription.billing_cycle === "weekly") return paymentDateForSubscription(subscription, month);
  return month;
}

function titleForSubscription(subscription: Subscription, month: string) {
  if (subscription.billing_cycle === "yearly") return `${subscription.name}（${month.slice(0, 4)}年分）`;
  if (subscription.billing_cycle === "weekly") {
    const paymentDate = paymentDateForSubscription(subscription, month);
    return `${subscription.name}（${Number(paymentDate.slice(5, 7))}月${Number(paymentDate.slice(8, 10))}日支払分）`;
  }
  return `${subscription.name}（${Number(month.slice(5, 7))}月分）`;
}

function entryStatusForDate(date: string): EntryStatus {
  return date <= todayKey() ? "confirmed" : "planned";
}

function scheduledLoanAmountForIndex(loan: Loan, index: number) {
  if (loan.repayment_type !== "installment") return loan.principal_amount;
  const base = Math.floor(loan.principal_amount / loan.installment_count);
  const remainder = loan.principal_amount % loan.installment_count;
  return base + (index === loan.installment_count - 1 ? remainder : 0);
}

export default function CoupleMoneyApp({
  view,
  subscriptionId,
  entryId,
  loanId,
}: {
  view: AppView;
  subscriptionId?: string;
  entryId?: string;
  loanId?: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;

    async function restoreSession() {
      try {
        const url = new URL(window.location.href);
        const authCode = url.searchParams.get("code");
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");

        if (authCode) {
          await client.auth.exchangeCodeForSession(authCode);
          url.searchParams.delete("code");
          window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        } else if (accessToken && refreshToken) {
          await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }

        const { data } = await withTimeout(client.auth.getSession(), 8000);
        setSession(data.session);
      } catch {
        setSession(null);
      } finally {
        setLoading(false);
      }
    }

    void restoreSession();
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (!supabase) return <FullPageMessage title="Supabase設定が必要です" body="環境変数を確認してください。" />;
  if (loading) return <FullPageMessage title="読み込み中" body="認証状態を確認しています。" />;
  if (!session) return <AuthScreen supabase={supabase} />;

  return <MoneyApp supabase={supabase} user={session.user} view={view} subscriptionId={subscriptionId} entryId={entryId} loanId={loanId} />;
}

function MoneyApp({
  supabase,
  user,
  view,
  subscriptionId,
  entryId,
  loanId,
}: {
  supabase: SupabaseClient;
  user: User;
  view: AppView;
  subscriptionId?: string;
  entryId?: string;
  loanId?: string;
}) {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [menuOpen, setMenuOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [pairId, setPairId] = useState<string | null>(null);
  const [pairInfo, setPairInfo] = useState<PairInfo | null>(null);
  const [members, setMembers] = useState<PairMember[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [entries, setEntries] = useState<PersonalEntry[]>([]);
  const [categories, setCategories] = useState<PersonalCategory[]>(defaultCategories);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [message, setMessage] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [pairForm, setPairForm] = useState({ name: "ふたりの家計簿", displayName: "", iconUrl: "" });
  const [subscriptionForm, setSubscriptionForm] = useState(subscriptionDefaults);
  const [loanForm, setLoanForm] = useState(loanDefaults);
  const [entryForm, setEntryForm] = useState(makeEntryDefaults(view === "personalIncomeNew" ? "income" : "expense"));
  const [categoryForm, setCategoryForm] = useState({ type: "expense" as MoneyType, name: "" });
  const [workplaceForm, setWorkplaceForm] = useState({ name: "", payday_day: 25, payday_is_month_end: false });
  const [editingWorkplaceId, setEditingWorkplaceId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [repaymentDrafts, setRepaymentDrafts] = useState<Record<string, { amount: number; paid_at: string }>>({});

  const partner = members.find((member) => member.user_id !== user.id);
  const selfName = members.find((member) => member.user_id === user.id)?.display_name || displayName || "私";
  const partnerName = partner?.display_name || "相方";

  useEffect(() => {
    if (view === "personalIncomeNew") setEntryForm(makeEntryDefaults("income"));
    if (view === "personalExpenseNew") setEntryForm(makeEntryDefaults("expense"));
  }, [view]);

  function personId(person: Person) {
    if (person === "me") return user.id;
    return partner?.user_id || user.id;
  }

  function toPerson(userId: string): Person {
    return userId === user.id ? "me" : "partner";
  }

  function personLabel(person: Person) {
    return person === "me" ? selfName : partnerName;
  }

  async function apiRequest<T>(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ログインが必要です。");

    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "API処理に失敗しました。");
    return payload.data as T;
  }

  async function refreshAll() {
    setMessage("");
    const profile = await apiRequest<{ display_name: string; avatar_url: string | null }>("/api/profile");
    setDisplayName(profile?.display_name || "");
    setProfileAvatarUrl(profile?.avatar_url || "");

    try {
      const personalEntries = await apiRequest<PersonalEntry[]>(`/api/personal/entries`);
      setEntries(personalEntries || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "個人収支を読み込めませんでした。");
    }

    try {
      const savedWorkplaces = await apiRequest<Workplace[]>("/api/workplaces");
      setWorkplaces(savedWorkplaces || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "勤務先を読み込めませんでした。");
    }

    try {
      const apiSubscriptions = await apiRequest<Subscription[]>("/api/subscriptions");
      setSubscriptions(apiSubscriptions || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "サブスクを読み込めませんでした。");
    }

    const pairState = await apiRequest<PairApiState>("/api/pair");
    const nextPairId = pairState.pair_id;
    setPairId(nextPairId);

    try {
      const savedCategories = await apiRequest<PersonalCategory[]>(`/api/personal/categories${nextPairId ? `?pair_id=${nextPairId}` : ""}`);
      setCategories((savedCategories?.length ? savedCategories : defaultCategories) as PersonalCategory[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "カテゴリを読み込めませんでした。");
    }

    if (!nextPairId) {
      setMembers([]);
      setLoans([]);
      setPairInfo(null);
      return;
    }

    const currentPair = pairState.pair;
    const pairMembers = pairState.members || [];
    try {
      const apiLoans = await apiRequest<Loan[]>("/api/loans");
      setLoans(apiLoans || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "貸し借りを読み込めませんでした。");
    }

    setPairInfo(currentPair as PairInfo | null);
    setPairForm({
      name: currentPair?.name || "ふたりの家計簿",
      displayName: pairMembers?.find((member) => member.user_id === user.id)?.display_name || profile?.display_name || "",
      iconUrl: currentPair?.icon_url || "",
    });
    setMembers(pairMembers as PairMember[]);
  }

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!subscriptions.length && !loans.length) return;
    void syncGeneratedEntries(selectedMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, subscriptions.length, loans.length]);

  const paymentRows = useMemo(() => {
    const subscriptionPayments = subscriptions.flatMap((subscription) => {
      if (!subscriptionOccurs(subscription, selectedMonth)) return [];
      const owner = toPerson(subscription.owner_user_id);
      const other = owner === "me" ? "partner" : "me";
      const settlement = ownerShare(subscription, other);
      const dueDate = dateFor(selectedMonth, subscription.billing_day);
      const rows: PaymentRow[] = [
        {
          id: `${subscription.id}-external-${selectedMonth}`,
          date: dueDate,
          kind: "共有サブスク外部支払い",
          payer: owner,
          receiver: subscription.name,
          amount: subscription.amount,
          status: "予定",
        },
      ];
      if (settlement > 0) {
        rows.push({
          id: `${subscription.id}-settlement-${selectedMonth}`,
          date: dueDate,
          kind: "共有サブスク精算",
          payer: other,
          receiver: personLabel(owner),
          amount: settlement,
          status: "予定",
        });
      }
      return rows;
    });

    const loanPayments = loans
      .map((loan) => {
        const scheduled = scheduledLoanAmount(loan, selectedMonth);
        const paidThisMonth = sum(loan.loan_repayments.filter((repayment) => monthOf(repayment.paid_at) === selectedMonth));
        const amount = Math.max(0, scheduled - paidThisMonth);
        if (scheduled === 0 && paidThisMonth === 0) return null;
        return {
          id: `${loan.id}-loan-${selectedMonth}`,
          date: dateFor(selectedMonth, loan.repayment_day),
          kind: "貸し借り返済",
          payer: toPerson(loan.borrower_user_id),
          receiver: personLabel(toPerson(loan.lender_user_id)),
          amount,
          status: amount === 0 ? "完了" : paidThisMonth > 0 ? "不足" : "予定",
        } satisfies PaymentRow;
      })
      .filter(Boolean) as PaymentRow[];

    return [...subscriptionPayments, ...loanPayments].sort((a, b) => a.date.localeCompare(b.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptions, loans, selectedMonth, members]);

  const monthEntries = entries.filter((entry) => monthOf(entry.entry_date) === selectedMonth);
  const incomeTotal = sum(monthEntries.filter((entry) => entry.type === "income"));
  const expenseTotal = sum(monthEntries.filter((entry) => entry.type === "expense"));
  const myOutgoing = sum(paymentRows.filter((row) => row.payer === "me"));
  const myIncoming = sum(paymentRows.filter((row) => row.receiver === selfName));
  const selectedSubscription = subscriptions.find((subscription) => subscription.id === subscriptionId);
  const selectedEntry = entries.find((entry) => entry.id === entryId);
  const selectedLoan = loans.find((loan) => loan.id === loanId);
  const canAddLoan = !loans.length || loans.some((loan) => loan.lender_user_id === user.id);

  useEffect(() => {
    if (view !== "subscriptionEdit" || !selectedSubscription) return;
    setSubscriptionForm({
      name: selectedSubscription.name,
      is_shared: selectedSubscription.is_shared,
      owner: toPerson(selectedSubscription.owner_user_id),
      payer: toPerson(selectedSubscription.payer_user_id),
      amount: selectedSubscription.amount,
      billing_cycle: selectedSubscription.billing_cycle,
      billing_day_mode: selectedSubscription.billing_day >= 31 ? "end_of_month" : "day",
      renewal_day: selectedSubscription.renewal_day,
      renewal_month: selectedSubscription.renewal_month,
      renewal_weekday: selectedSubscription.renewal_weekday,
      billing_day: selectedSubscription.billing_day,
      billing_month: selectedSubscription.billing_month,
      billing_weekday: selectedSubscription.billing_weekday,
      share_type: selectedSubscription.share_type,
      partner_share_value: selectedSubscription.partner_share_value,
      memo: selectedSubscription.memo || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedSubscription?.id]);

  useEffect(() => {
    if (view !== "loanEdit" || !selectedLoan) return;
    setLoanForm({
      title: selectedLoan.title,
      lender: toPerson(selectedLoan.lender_user_id),
      principal_amount: selectedLoan.principal_amount,
      borrowed_at: selectedLoan.borrowed_at,
      due_date: selectedLoan.due_date,
      repayment_type: selectedLoan.repayment_type,
      installment_count: selectedLoan.installment_count,
      monthly_amount: selectedLoan.monthly_amount,
      repayment_day: selectedLoan.repayment_day,
      repayment_day_mode: selectedLoan.repayment_day_mode,
      repayment_workplace_id: selectedLoan.repayment_workplace_id || "",
      memo: selectedLoan.memo || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedLoan?.id]);

  async function saveProfile() {
    if (!displayName.trim()) return;
    try {
      await apiRequest("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ display_name: displayName.trim(), avatar_url: profileAvatarUrl || null }),
      });
      setMessage("表示名を保存しました。");
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "プロフィールを保存できませんでした。");
    }
  }

  async function savePairSettings() {
    if (!pairId) return;
    if (!pairForm.name.trim() || !pairForm.displayName.trim()) {
      setMessage("ペア名とペア内の表示名を入力してください。");
      return;
    }
    try {
      await apiRequest("/api/pair", {
        method: "PATCH",
        body: JSON.stringify({ pair_id: pairId, name: pairForm.name.trim(), display_name: pairForm.displayName.trim(), icon_url: pairForm.iconUrl || null }),
      });
      setMessage("ペア設定を保存しました。");
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ペア設定を保存できませんでした。");
    }
  }

  function resetWorkplaceForm() {
    setEditingWorkplaceId(null);
    setWorkplaceForm({ name: "", payday_day: 25, payday_is_month_end: false });
  }

  async function saveWorkplace() {
    if (!workplaceForm.name.trim()) {
      setMessage("勤務先を入力してください。");
      return;
    }
    const payload = {
      name: workplaceForm.name.trim(),
      payday_day: workplaceForm.payday_is_month_end ? null : workplaceForm.payday_day,
      payday_is_month_end: workplaceForm.payday_is_month_end,
    };
    try {
      if (editingWorkplaceId) {
        await apiRequest<Workplace>(`/api/workplaces/${editingWorkplaceId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiRequest<Workplace>("/api/workplaces", { method: "POST", body: JSON.stringify(payload) });
      }
      setMessage(editingWorkplaceId ? "勤務先を更新しました。" : "勤務先を追加しました。");
      resetWorkplaceForm();
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "勤務先を保存できませんでした。");
    }
  }

  async function deleteWorkplace(id: string) {
    if (!window.confirm("この勤務先を本当に削除しますか？")) return;
    try {
      await apiRequest<{ id: string }>(`/api/workplaces/${id}`, { method: "DELETE" });
      setMessage("勤務先を削除しました。");
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "勤務先を削除できませんでした。");
    }
  }

  async function createPair() {
    const nameForPair = pairForm.name.trim() || "ふたりの家計簿";
    const nameForMe = pairForm.displayName.trim() || displayName.trim();
    if (!nameForMe) {
      setMessage("ペア内で使用する自分の表示名を入力してください。");
      return;
    }
    const code = makeInviteCode();
    const codeHash = await sha256(code);
    try {
      await apiRequest("/api/pair", {
        method: "POST",
        body: JSON.stringify({ pair_name: nameForPair, invite_hash: codeHash, display_name: nameForMe, icon_url: pairForm.iconUrl || null }),
      });
      setInviteCode(code);
      setMessage("ペアを作成しました。");
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ペアを作成できませんでした。");
    }
  }

  async function regenerateInvite() {
    if (!pairId || partner) return;
    const code = makeInviteCode();
    const codeHash = await sha256(code);
    try {
      await apiRequest("/api/pair/invite", {
        method: "PATCH",
        body: JSON.stringify({ pair_id: pairId, invite_hash: codeHash }),
      });
      setInviteCode(code);
      setMessage("新しい招待コードを発行しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "招待コードを発行できませんでした。");
    }
  }

  async function joinPair() {
    if (!displayName.trim() || !joinCode.trim()) {
      setMessage("表示名と招待コードを入力してください。");
      return;
    }
    const codeHash = await sha256(joinCode.trim().toUpperCase());
    try {
      await apiRequest("/api/pair/join", {
        method: "POST",
        body: JSON.stringify({ invite_hash: codeHash, display_name: displayName.trim() }),
      });
      setJoinCode("");
      setMessage("ペアに参加しました。");
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ペアに参加できませんでした。");
    }
  }

  function buildSubscriptionPayload() {
    const billingDay =
      !subscriptionForm.is_shared
        ? subscriptionForm.renewal_day
        : subscriptionForm.billing_cycle === "monthly" && subscriptionForm.billing_day_mode === "end_of_month"
          ? 31
          : subscriptionForm.billing_cycle === "monthly" && subscriptionForm.billing_day_mode === "payday"
            ? 25
            : subscriptionForm.billing_day;

    return {
      ...subscriptionForm,
      pair_id: subscriptionForm.is_shared ? pairId : null,
      owner_user_id: subscriptionForm.is_shared ? personId(subscriptionForm.owner) : user.id,
      payer_user_id: subscriptionForm.is_shared ? personId(subscriptionForm.payer) : user.id,
      billing_day: billingDay,
      billing_month: subscriptionForm.is_shared ? subscriptionForm.billing_month : subscriptionForm.renewal_month,
      billing_weekday: subscriptionForm.is_shared ? subscriptionForm.billing_weekday : subscriptionForm.renewal_weekday,
    };
  }

  async function addSubscription() {
    if (!subscriptionForm.name.trim() || subscriptionForm.amount <= 0) {
      setMessage("サブスク名と金額を入力してください。");
      return;
    }
    if (subscriptionForm.is_shared && !pairId) {
      setMessage("共有サブスクは先にペアを作成してください。");
      return;
    }
    try {
      await apiRequest<Subscription>("/api/subscriptions", {
        method: "POST",
        body: JSON.stringify(buildSubscriptionPayload()),
      });
      window.location.href = "/subscriptions";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "サブスクを登録できませんでした。");
    }
  }

  async function updateSubscription() {
    if (!selectedSubscription) return;
    if (!subscriptionForm.name.trim() || subscriptionForm.amount <= 0) {
      setMessage("サブスク名と金額を入力してください。");
      return;
    }
    try {
      await apiRequest<Subscription>(`/api/subscriptions/${selectedSubscription.id}`, {
        method: "PATCH",
        body: JSON.stringify(buildSubscriptionPayload()),
      });
      setMessage("サブスクを更新しました。");
      window.location.href = `/subscriptions/${selectedSubscription.id}`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "サブスクを更新できませんでした。");
    }
  }

  async function deleteSubscription(subscriptionIdToDelete: string) {
    if (!window.confirm("このサブスクを停止しますか？")) return;
    const stopNextMonth = window.confirm("来月分から停止しますか？\nOK: 来月分から停止\nキャンセル: 今月分から停止");
    try {
      await apiRequest<Subscription>(`/api/subscriptions/${subscriptionIdToDelete}`, {
        method: "DELETE",
        body: JSON.stringify({ stop_mode: stopNextMonth ? "next_month" : "this_month" }),
      });
      setMessage("サブスクを停止しました。");
      window.location.href = "/subscriptions";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "サブスクを停止できませんでした。");
    }
  }

  async function addLoan() {
    if (!pairId || !loanForm.title.trim() || loanForm.principal_amount <= 0) return;
    const lenderId = personId(loanForm.lender);
    const borrowerId = loanForm.lender === "me" ? personId("partner") : user.id;
    try {
      await apiRequest<Loan>("/api/loans", {
        method: "POST",
        body: JSON.stringify({
          ...loanForm,
          pair_id: pairId,
          lender_user_id: lenderId,
          borrower_user_id: borrowerId,
        }),
      });
      window.location.href = "/loans";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "貸し借りを登録できませんでした。");
    }
  }

  async function updateLoan() {
    if (!selectedLoan) return;
    if (!loanForm.title.trim() || loanForm.principal_amount <= 0) {
      setMessage("貸し借り名と金額を入力してください。");
      return;
    }
    try {
      await apiRequest<Loan>(`/api/loans/${selectedLoan.id}`, {
        method: "PATCH",
        body: JSON.stringify(loanForm),
      });
      setMessage("貸し借りを更新しました。");
      window.location.href = `/loans/${selectedLoan.id}`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "貸し借りを更新できませんでした。");
    }
  }

  async function deleteLoan(loanIdToDelete: string) {
    if (!window.confirm("この貸し借りを本当に削除しますか？")) return;
    try {
      await apiRequest<{ id: string }>(`/api/loans/${loanIdToDelete}`, { method: "DELETE" });
      setMessage("貸し借りを削除しました。");
      window.location.href = "/loans";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "貸し借りを削除できませんでした。");
    }
  }

  async function addRepayment(loanId: string) {
    const loan = loans.find((item) => item.id === loanId);
    if (!loan) return;
    const repaid = sum(loan.loan_repayments);
    const remaining = Math.max(0, loan.principal_amount - repaid);
    const draft = repaymentDrafts[loanId] ?? { amount: 0, paid_at: "" };
    if (draft.amount <= 0) {
      setMessage("返済金額を入力してください。");
      return;
    }
    if (draft.amount > remaining) {
      setMessage("残金を超える返済金額は登録できません。");
      return;
    }
    const paidAt = draft.paid_at || new Date().toISOString().slice(0, 10);
    try {
      await apiRequest<Repayment>(`/api/loans/${loanId}/repayments`, {
        method: "POST",
        body: JSON.stringify({ amount: draft.amount, paid_at: paidAt }),
      });
      await confirmRepaymentEntries(loan, draft.amount, paidAt);
      setMessage("返済を登録しました。");
      setRepaymentDrafts((current) => ({ ...current, [loanId]: { amount: 0, paid_at: "" } }));
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "返済を登録できませんでした。");
    }
  }

  async function addEntry() {
    if (!entryForm.title.trim() || entryForm.amount <= 0) {
      setMessage("名前と金額を入力してください。");
      return;
    }
    try {
      await apiRequest<PersonalEntry>("/api/personal/entries", {
        method: "POST",
        body: JSON.stringify(entryForm),
      });
      window.location.href = "/personal";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "収支を登録できませんでした。");
    }
  }

  async function updateEntry(entryIdToUpdate: string) {
    if (!entryForm.title.trim() || entryForm.amount <= 0) {
      setMessage("名前と金額を入力してください。");
      return;
    }
    try {
      await apiRequest<PersonalEntry>(`/api/personal/entries/${entryIdToUpdate}`, {
        method: "PATCH",
        body: JSON.stringify(entryForm),
      });
      setMessage("収支を更新しました。");
      setEditingEntryId(null);
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "収支を更新できませんでした。");
    }
  }

  async function deleteEntry(entryIdToDelete: string) {
    if (!window.confirm("この収支を本当に削除しますか？")) return;
    try {
      await apiRequest<{ id: string }>(`/api/personal/entries/${entryIdToDelete}`, { method: "DELETE" });
      setMessage("収支を削除しました。");
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "収支を削除できませんでした。");
    }
  }

  async function upsertGeneratedEntry(entry: Omit<PersonalEntry, "id">) {
    try {
      await apiRequest<PersonalEntry | { skipped: boolean; id: string }>("/api/personal/entries/generated", {
        method: "POST",
        body: JSON.stringify(entry),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "予定収支を同期できませんでした。");
    }
  }

  async function syncGeneratedEntries(month: string) {
    try {
      await apiRequest<{ count: number }>("/api/subscriptions/sync", {
        method: "POST",
        body: JSON.stringify({ month }),
      });
      const personalEntries = await apiRequest<PersonalEntry[]>("/api/personal/entries");
      setEntries(personalEntries || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "サブスク予定の同期に失敗しました。");
    }

    const generated: Omit<PersonalEntry, "id">[] = [];

    ([] as Subscription[]).forEach((subscription) => {
      if (!subscriptionOccurs(subscription, month)) return;
      if (subscription.payer_user_id !== user.id) return;
      const paymentDate = paymentDateForSubscription(subscription, month);
      generated.push({
        user_id: user.id,
        type: "expense",
        entry_status: entryStatusForDate(paymentDate),
        title: titleForSubscription(subscription, month),
        amount: subscription.amount,
        entry_date: paymentDate,
        category: "サブスク",
        source: subscription.name,
        source_type: "subscription",
        source_id: subscription.id,
        period_key: periodKeyForSubscription(subscription, month),
        scheduled_date: paymentDate,
        excluded_at: null,
      });
    });

    loans.forEach((loan) => {
      const isLender = loan.lender_user_id === user.id;
      const isBorrower = loan.borrower_user_id === user.id;
      if (!isLender && !isBorrower) return;
      const otherName = personLabel(toPerson(isLender ? loan.borrower_user_id : loan.lender_user_id));
      if (monthOf(loan.borrowed_at) === month) {
        generated.push({
          user_id: user.id,
          type: isLender ? "expense" : "income",
          entry_status: "confirmed",
          title: isLender ? `${otherName}さんへ貸付：${loan.title}` : `${otherName}さんから借入：${loan.title}`,
          amount: loan.principal_amount,
          entry_date: loan.borrowed_at,
          category: isLender ? "貸付" : "借入",
          source: loan.title,
          source_type: "loan",
          source_id: loan.id,
          period_key: `${loan.id}:principal`,
          scheduled_date: loan.borrowed_at,
          excluded_at: null,
        });
      }

      const scheduled = scheduledLoanAmount(loan, month);
      if (scheduled <= 0 || loan.status === "paid" || loan.status === "canceled") return;
      const dueDate = dateFor(month, loan.repayment_day);
      generated.push({
        user_id: user.id,
        type: isLender ? "income" : "expense",
        entry_status: entryStatusForDate(dueDate),
        title: isLender ? `返済予定：${loan.title}` : `返済予定：${loan.title}`,
        amount: scheduled,
        entry_date: dueDate,
        category: isLender ? "返済予定" : "返済",
        source: loan.title,
        source_type: "repayment",
        source_id: loan.id,
        period_key: month,
        scheduled_date: dueDate,
        excluded_at: null,
      });
    });

    for (const entry of generated) {
      await upsertGeneratedEntry(entry);
    }
  }

  async function confirmRepaymentEntries(loan: Loan, amount: number, paidAt: string) {
    const isLender = loan.lender_user_id === user.id;
    const isBorrower = loan.borrower_user_id === user.id;
    if (!isLender && !isBorrower) return;
    await upsertGeneratedEntry({
      user_id: user.id,
      type: isLender ? "income" : "expense",
      entry_status: "confirmed",
      title: isLender ? `返済受取：${loan.title}` : `返済：${loan.title}`,
      amount,
      entry_date: paidAt,
      category: isLender ? "返済" : "返済",
      source: loan.title,
      source_type: "repayment",
      source_id: loan.id,
      period_key: `paid:${paidAt}`,
      scheduled_date: paidAt,
      excluded_at: null,
    });
  }

  async function addCategory() {
    if (!categoryForm.name.trim()) {
      setMessage("カテゴリ名を入力してください。");
      return;
    }
    try {
      await apiRequest<PersonalCategory>("/api/personal/categories", {
        method: "POST",
        body: JSON.stringify({ pair_id: pairId, type: categoryForm.type, name: categoryForm.name.trim() }),
      });
      setMessage("カテゴリを追加しました。");
      setCategoryForm({ type: "expense", name: "" });
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "カテゴリを追加できませんでした。");
    }
  }

  async function updateCategory(category: PersonalCategory) {
    if (!editingCategoryName.trim()) {
      setMessage("カテゴリ名を入力してください。");
      return;
    }
    try {
      await apiRequest<PersonalCategory>(`/api/personal/categories/${category.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editingCategoryName.trim() }),
      });
      setMessage("カテゴリを更新しました。");
      setEditingCategoryId(null);
      setEditingCategoryName("");
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "カテゴリを更新できませんでした。");
    }
  }

  async function deleteCategory(category: PersonalCategory) {
    if (!window.confirm("このカテゴリを本当に削除しますか？")) return;
    try {
      await apiRequest<{ id: string }>(`/api/personal/categories/${category.id}`, { method: "DELETE" });
      setMessage("カテゴリを削除しました。");
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "カテゴリを削除できませんでした。");
    }
  }

  async function changePassword() {
    const nextPassword = window.prompt("新しいパスワードを入力してください");
    if (!nextPassword) return;
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    setMessage(error ? error.message : "パスワードを変更しました。");
  }

  function exportWorkbook(rows: unknown[], sheetName: string, filename: string) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), sheetName);
    XLSX.writeFile(workbook, filename);
  }

  return (
    <main className="app-shell">
      <header className="mobile-header">
        <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="メニューを開く">
          <Menu size={22} />
        </button>
        <div className="brand compact-brand">
          <div className="brand-mark"><WalletCards size={20} /></div>
          <h1>ふたり家計簿</h1>
        </div>
      </header>

      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="drawer-head">
          <div className="brand">
            <div className="brand-mark"><WalletCards size={22} /></div>
            <div>
              <p className="eyebrow">Couple Money</p>
              <h1>ふたり家計簿</h1>
            </div>
          </div>
          <button className="icon-button close-menu" onClick={() => setMenuOpen(false)} aria-label="メニューを閉じる">
            <X size={20} />
          </button>
        </div>

        <nav className="nav" onClick={() => setMenuOpen(false)}>
          <NavButton icon={<PieChart />} label="ダッシュボード" href="/" active={view === "dashboard"} />
          <NavButton icon={<RefreshCcw />} label="サブスク" href="/subscriptions" active={view.startsWith("subscription")} disabled={!pairId} />
          {pairId && <NavButton icon={<HandCoins />} label="貸し借り" href="/loans" active={view.startsWith("loan")} />}
          <NavButton icon={<Banknote />} label="個人収支" href="/personal" active={view.startsWith("personal")} />
          <NavButton icon={<UserRound />} label="Myページ" href="/my-page" active={view === "myPage"} />
        </nav>
      </aside>
      {menuOpen && <button className="drawer-backdrop" onClick={() => setMenuOpen(false)} aria-label="メニューを閉じる" />}

      <section className="workspace">
        <div className="topbar">
          <label className="month-control">
            <span>対象月</span>
            <input className="month-input" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
          </label>
          <button className="button ghost" onClick={() => refreshAll()}>
            <RefreshCcw size={16} />
            更新
          </button>
        </div>

        {message && <div className="notice">{message}</div>}

        {view === "dashboard" && (
          <DashboardView
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            entries={entries}
            monthEntries={monthEntries}
            incomeTotal={incomeTotal}
            expenseTotal={expenseTotal}
            myOutgoing={myOutgoing}
            myIncoming={myIncoming}
          />
        )}

        {view === "subscriptions" && (
          <SubscriptionsList
            subscriptions={subscriptions}
            selectedMonth={selectedMonth}
            personLabel={personLabel}
            toPerson={toPerson}
            deleteSubscription={deleteSubscription}
            exportRows={() => exportWorkbook(subscriptions, "サブスク", `サブスク_${selectedMonth}.xlsx`)}
          />
        )}

        {view === "subscriptionNew" && (
          <SubscriptionFormView
            form={subscriptionForm}
            setForm={setSubscriptionForm}
            selfName={selfName}
            partnerName={partnerName}
            onSubmit={addSubscription}
          />
        )}

        {view === "subscriptionDetail" && (
          <SubscriptionDetailView
            subscription={selectedSubscription}
            selectedMonth={selectedMonth}
            personLabel={personLabel}
            toPerson={toPerson}
            deleteSubscription={deleteSubscription}
          />
        )}

        {view === "subscriptionEdit" && (
          <SubscriptionFormView
            form={subscriptionForm}
            setForm={setSubscriptionForm}
            selfName={selfName}
            partnerName={partnerName}
            onSubmit={updateSubscription}
            title="サブスク編集"
            submitLabel="更新する"
          />
        )}

        {view === "loans" && (
          pairId ? (
            <LoansList
              loans={loans}
              canAddLoan={canAddLoan}
              currentUserId={user.id}
              deleteLoan={deleteLoan}
              exportRows={() => exportWorkbook(loans, "貸し借り", `貸し借り_${selectedMonth}.xlsx`)}
            />
          ) : (
            <EmptyState text="ペアを作成すると貸し借り機能を使えます。" />
          )
        )}

        {view === "loanNew" && (
          <LoanFormView form={loanForm} setForm={setLoanForm} selfName={selfName} partnerName={partnerName} onSubmit={addLoan} />
        )}

        {view === "loanDetail" && (
          <LoanDetailView
            loan={selectedLoan}
            selectedMonth={selectedMonth}
            personLabel={personLabel}
            toPerson={toPerson}
            repaymentDrafts={repaymentDrafts}
            setRepaymentDrafts={setRepaymentDrafts}
            addRepayment={addRepayment}
            currentUserId={user.id}
            deleteLoan={deleteLoan}
          />
        )}

        {view === "loanEdit" && (
          <LoanFormView
            form={loanForm}
            setForm={setLoanForm}
            selfName={selfName}
            partnerName={partnerName}
            onSubmit={updateLoan}
            title="貸し借り編集"
            submitLabel="更新する"
          />
        )}

        {view === "personal" && (
          <PersonalList
            entries={monthEntries}
            incomeTotal={incomeTotal}
            expenseTotal={expenseTotal}
            editingEntryId={editingEntryId}
            entryForm={entryForm}
            categories={categories}
            setEntryForm={setEntryForm}
            setEditingEntryId={setEditingEntryId}
            updateEntry={updateEntry}
            deleteEntry={deleteEntry}
            exportRows={() => exportWorkbook(monthEntries, "個人収支", `個人収支_${selectedMonth}.xlsx`)}
          />
        )}

        {(view === "personalIncomeNew" || view === "personalExpenseNew") && (
          <PersonalEntryFormView form={entryForm} setForm={setEntryForm} categories={categories} onSubmit={addEntry} />
        )}

        {view === "personalCategoryNew" && (
          <CategoryFormView
            form={categoryForm}
            setForm={setCategoryForm}
            categories={categories}
            entries={entries}
            editingCategoryId={editingCategoryId}
            editingCategoryName={editingCategoryName}
            setEditingCategoryId={setEditingCategoryId}
            setEditingCategoryName={setEditingCategoryName}
            onSubmit={addCategory}
            updateCategory={updateCategory}
            deleteCategory={deleteCategory}
          />
        )}

        {view === "personalDetail" && <PersonalDetailView entry={selectedEntry} />}

        {view === "myPage" && (
          <MyPageView
            user={user}
            displayName={displayName}
            setDisplayName={setDisplayName}
            saveProfile={saveProfile}
            profileAvatarUrl={profileAvatarUrl}
            setProfileAvatarUrl={setProfileAvatarUrl}
            pairInfo={pairInfo}
            pairForm={pairForm}
            setPairForm={setPairForm}
            savePairSettings={savePairSettings}
            members={members}
            currentUserId={user.id}
            pairId={pairId}
            partner={partner}
            inviteCode={inviteCode}
            joinCode={joinCode}
            setJoinCode={setJoinCode}
            createPair={createPair}
            joinPair={joinPair}
            regenerateInvite={regenerateInvite}
            changePassword={changePassword}
            signOut={() => supabase.auth.signOut()}
            setMessage={setMessage}
            workplaces={workplaces}
            workplaceForm={workplaceForm}
            setWorkplaceForm={setWorkplaceForm}
            editingWorkplaceId={editingWorkplaceId}
            setEditingWorkplaceId={setEditingWorkplaceId}
            saveWorkplace={saveWorkplace}
            deleteWorkplace={deleteWorkplace}
            resetWorkplaceForm={resetWorkplaceForm}
          />
        )}
      </section>
    </main>
  );
}

function DashboardView({
  selectedMonth,
  setSelectedMonth,
  entries,
  monthEntries,
  incomeTotal,
  expenseTotal,
  myOutgoing,
  myIncoming,
}: {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  entries: PersonalEntry[];
  monthEntries: PersonalEntry[];
  incomeTotal: number;
  expenseTotal: number;
  myOutgoing: number;
  myIncoming: number;
}) {
  const pieTotal = Math.max(incomeTotal + expenseTotal, 1);
  const incomeDeg = (incomeTotal / pieTotal) * 360;
  const months = Array.from({ length: 12 }, (_, index) => addMonths(selectedMonth, index - 11));
  const monthSummaries = months.map((month) => {
    const rows = entries.filter((entry) => monthOf(entry.entry_date) === month);
    return {
      month,
      income: sum(rows.filter((entry) => entry.type === "income")),
      expense: sum(rows.filter((entry) => entry.type === "expense")),
    };
  });
  const maxBar = Math.max(...monthSummaries.map((row) => Math.max(row.income, row.expense)), 1);

  return (
    <section className="view">
      <div className="button-row month-jump">
        <button className="button ghost" onClick={() => setSelectedMonth(addMonths(selectedMonth, -12))}>1年前</button>
        <button className="button ghost" onClick={() => setSelectedMonth(addMonths(selectedMonth, -1))}>前月</button>
        <button className="button ghost" onClick={() => setSelectedMonth(currentMonth)}>今月</button>
        <button className="button ghost" onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}>翌月</button>
      </div>

      <div className="summary-grid dashboard-summary">
        <Metric icon={<Banknote />} label="収入" value={yen.format(incomeTotal)} tone="blue" />
        <Metric icon={<ReceiptText />} label="支出" value={yen.format(expenseTotal)} tone="red" />
        <Metric icon={<CalendarDays />} label="収支" value={yen.format(incomeTotal - expenseTotal)} tone="dark" />
        <Metric icon={<HandCoins />} label="今月払う予定" value={yen.format(myOutgoing)} tone="red" />
        <Metric icon={<Banknote />} label="今月受け取る予定" value={yen.format(myIncoming)} tone="blue" />
      </div>

      <div className="analytics-grid">
        <Panel title="収支の円グラフ" action={`${monthEntries.length}件`}>
          <div className="pie-layout">
            <div
              className="pie-chart"
              style={{ background: `conic-gradient(var(--blue) 0deg ${incomeDeg}deg, var(--red) ${incomeDeg}deg 360deg)` }}
              aria-label="収支円グラフ"
            />
            <div className="legend-list">
              <span><i className="legend blue" />収入 {yen.format(incomeTotal)}</span>
              <span><i className="legend red" />支出 {yen.format(expenseTotal)}</span>
            </div>
          </div>
        </Panel>

        <Panel title="12か月の推移" action="棒グラフ">
          <div className="bar-chart">
            {monthSummaries.map((row) => (
              <div className="bar-month" key={row.month}>
                <div className="bar-pair">
                  <span className="bar income" style={{ height: `${Math.max(6, (row.income / maxBar) * 140)}px` }} />
                  <span className="bar expense" style={{ height: `${Math.max(6, (row.expense / maxBar) * 140)}px` }} />
                </div>
                <small>{monthLabel(row.month)}</small>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function SubscriptionsList({
  subscriptions,
  selectedMonth,
  personLabel,
  toPerson,
  deleteSubscription,
  exportRows,
}: {
  subscriptions: Subscription[];
  selectedMonth: string;
  personLabel: (person: Person) => string;
  toPerson: (id: string) => Person;
  deleteSubscription: (subscriptionId: string) => void;
  exportRows: () => void;
}) {
  return (
    <section className="view">
      <PageHead title="サブスク一覧" backHref="/" actions={<><Link className="button primary" href="/subscriptions/new"><Plus size={16} />追加</Link><button className="button ghost" onClick={exportRows}><Download size={16} />Excel</button></>} />
      <div className="ledger-list">
        {subscriptions.map((subscription) => (
          <div className="ledger-row action-row" key={subscription.id}>
            <Link className="ledger-main clickable-row" href={`/subscriptions/${subscription.id}`}>
              <span className={subscription.is_shared ? "pill blue" : "pill"}>{subscription.is_shared ? "共有" : "個人"}</span>
              <div>
                <strong>{subscription.name}</strong>
                <small>{personLabel(toPerson(subscription.owner_user_id))}が契約者 / {subscriptionOccurs(subscription, selectedMonth) ? "今月支払いあり" : "今月なし"}</small>
              </div>
              <b>{yen.format(subscription.amount)}</b>
            </Link>
            <div className="icon-actions">
              <Link className="icon-button" aria-label="サブスクを編集" title="編集" href={`/subscriptions/${subscription.id}/edit`}>
                <Pencil size={18} />
              </Link>
              <button className="icon-button danger-icon" aria-label="サブスクを停止" title="停止" onClick={() => deleteSubscription(subscription.id)}>
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {!subscriptions.length && <EmptyState text="登録済みのサブスクはありません。" />}
    </section>
  );
}

function SubscriptionDetailView({
  subscription,
  selectedMonth,
  personLabel,
  toPerson,
  deleteSubscription,
}: {
  subscription?: Subscription;
  selectedMonth: string;
  personLabel: (person: Person) => string;
  toPerson: (id: string) => Person;
  deleteSubscription: (subscriptionId: string) => void;
}) {
  if (!subscription) {
    return (
      <section className="view">
        <PageHead title="サブスク詳細" backHref="/subscriptions" />
        <EmptyState text="サブスクが見つかりません。" />
      </section>
    );
  }
  const paymentDate = subscriptionOccurs(subscription, selectedMonth) ? paymentDateForSubscription(subscription, selectedMonth) : "なし";
  return (
    <section className="view">
      <PageHead
        title="サブスク詳細"
        backHref="/subscriptions"
        actions={<><Link className="button ghost" href={`/subscriptions/${subscription.id}/edit`}><Pencil size={16} />編集</Link><button className="button danger" onClick={() => deleteSubscription(subscription.id)}><Trash2 size={16} />停止</button></>}
      />
      <Panel title={subscription.name} action={subscription.status === "active" ? "利用中" : "停止済み"}>
        <dl className="detail-list">
          <div><dt>種類</dt><dd>{subscription.is_shared ? "共有サブスク" : "個人サブスク"}</dd></div>
          <div><dt>契約者</dt><dd>{personLabel(toPerson(subscription.owner_user_id))}</dd></div>
          <div><dt>実際に支払う人</dt><dd>{personLabel(toPerson(subscription.payer_user_id))}</dd></div>
          <div><dt>金額</dt><dd>{yen.format(subscription.amount)}</dd></div>
          <div><dt>支払い周期</dt><dd>{subscription.billing_cycle === "weekly" ? "週払い" : subscription.billing_cycle === "yearly" ? "年払い" : "月払い"}</dd></div>
          <div><dt>今月の支払日</dt><dd>{paymentDate}</dd></div>
          <div><dt>相方側の負担</dt><dd>{subscription.share_type === "percentage" ? `${subscription.partner_share_value}%` : yen.format(subscription.partner_share_value)}</dd></div>
          <div><dt>停止開始月</dt><dd>{subscription.stop_billing_from || "未設定"}</dd></div>
          <div><dt>メモ</dt><dd>{subscription.memo || "なし"}</dd></div>
        </dl>
      </Panel>
    </section>
  );
}

function SubscriptionFormView({
  form,
  setForm,
  selfName,
  partnerName,
  onSubmit,
  title = "サブスク追加",
  submitLabel = "登録する",
}: {
  form: typeof subscriptionDefaults;
  setForm: (form: typeof subscriptionDefaults) => void;
  selfName: string;
  partnerName: string;
  onSubmit: () => void;
  title?: string;
  submitLabel?: string;
}) {
  return (
    <section className="view">
      <PageHead title={title} backHref="/subscriptions" />
      <Panel title="サブスク情報">
        <div className="stack-form">
          <TextField label="サブスク名" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <SelectField label="共有設定" value={form.is_shared ? "shared" : "private"} onChange={(value) => setForm({ ...form, is_shared: value === "shared" })} options={[["shared", "共有する"], ["private", "共有しない"]]} />
          <SelectField label="支払い周期" value={form.billing_cycle} onChange={(value) => setForm({ ...form, billing_cycle: value as BillingCycle })} options={[["weekly", "週払い"], ["monthly", "月払い"], ["yearly", "年払い"]]} />
          <NumberField label="金額" unit={form.billing_cycle === "weekly" ? "円/週" : form.billing_cycle === "yearly" ? "円/年" : "円/月"} value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} />
          {form.is_shared ? (
            <>
              <SelectField label="契約者" value={form.owner} onChange={(value) => setForm({ ...form, owner: value as Person })} options={[["me", selfName], ["partner", partnerName]]} />
              <SelectField label="実際に支払う人" value={form.payer} onChange={(value) => setForm({ ...form, payer: value as Person })} options={[["me", selfName], ["partner", partnerName]]} />
            </>
          ) : (
            <>
              <div className="readonly-field"><span>契約者</span><strong>{selfName}</strong></div>
              <div className="readonly-field"><span>実際に支払う人</span><strong>{selfName}</strong></div>
            </>
          )}
          {form.billing_cycle === "monthly" ? (
            <>
              <NumberField label="更新日" unit="毎月の日" value={form.renewal_day} onChange={(value) => setForm({ ...form, renewal_day: value })} />
              {form.is_shared && (
                <>
                  <SelectField label="支払日の種類" value={form.billing_day_mode} onChange={(value) => setForm({ ...form, billing_day_mode: value as BillingDayMode })} options={[["day", "日付を指定"], ["end_of_month", "月末"], ["payday", "給料日"]]} />
                  {form.billing_day_mode === "day" && <NumberField label="支払日" unit="日" value={form.billing_day} onChange={(value) => setForm({ ...form, billing_day: value })} />}
                </>
              )}
            </>
          ) : form.billing_cycle === "yearly" ? (
            <>
              <NumberField label="更新月" unit="月" value={form.renewal_month} onChange={(value) => setForm({ ...form, renewal_month: value })} />
              <NumberField label="更新日" unit="日" value={form.renewal_day} onChange={(value) => setForm({ ...form, renewal_day: value })} />
              {form.is_shared && (
                <>
                  <NumberField label="支払月" unit="月" value={form.billing_month} onChange={(value) => setForm({ ...form, billing_month: value })} />
                  <NumberField label="支払日" unit="日" value={form.billing_day} onChange={(value) => setForm({ ...form, billing_day: value })} />
                </>
              )}
            </>
          ) : (
            <>
              <SelectField label="更新曜日" value={String(form.renewal_weekday)} onChange={(value) => setForm({ ...form, renewal_weekday: Number(value) })} options={weekdayOptions} />
              {form.is_shared && <SelectField label="支払曜日" value={String(form.billing_weekday)} onChange={(value) => setForm({ ...form, billing_weekday: Number(value) })} options={weekdayOptions} />}
            </>
          )}
          {form.is_shared && (
            <>
              <SelectField label="負担方式" value={form.share_type} onChange={(value) => setForm({ ...form, share_type: value as ShareType })} options={[["percentage", "比率"], ["fixed", "固定額"]]} />
              <NumberField label={form.share_type === "percentage" ? "相方側の負担率" : "相方側の負担額"} unit={form.share_type === "percentage" ? "%" : "円"} value={form.partner_share_value} onChange={(value) => setForm({ ...form, partner_share_value: value })} />
            </>
          )}
          <TextField label="メモ" unit="任意" value={form.memo} onChange={(value) => setForm({ ...form, memo: value })} />
        </div>
        <button className="button primary form-submit" onClick={onSubmit}>{submitLabel}</button>
      </Panel>
    </section>
  );
}

function LoansList({
  loans,
  canAddLoan,
  currentUserId,
  deleteLoan,
  exportRows,
}: {
  loans: Loan[];
  canAddLoan: boolean;
  currentUserId: string;
  deleteLoan: (loanId: string) => void;
  exportRows: () => void;
}) {
  return (
    <section className="view">
      <PageHead
        title="貸し借り一覧"
        backHref="/"
        actions={<>{canAddLoan && <Link className="button primary" href="/loans/new"><Plus size={16} />追加</Link>}<button className="button ghost" onClick={exportRows}><Download size={16} />Excel</button></>}
      />
      <div className="ledger-list">
        {loans.map((loan) => {
          const canManage = loan.lender_user_id === currentUserId;
          return (
            <div className="ledger-row action-row" key={loan.id}>
              <Link className="ledger-main clickable-row" href={`/loans/${loan.id}`}>
                <span className={loan.status === "paid" ? "pill blue" : "pill"}>{loan.status === "paid" ? "完済" : "進行中"}</span>
                <div>
                  <strong>{loan.title}</strong>
                  <small>{loan.status === "paid" ? "完済済み" : "詳細を表示"}</small>
                </div>
                <b>{yen.format(loan.principal_amount)}</b>
              </Link>
              {canManage && (
                <div className="icon-actions">
                  <Link className="icon-button" aria-label="貸し借りを編集" title="編集" href={`/loans/${loan.id}/edit`}>
                    <Pencil size={18} />
                  </Link>
                  <button className="icon-button danger-icon" aria-label="貸し借りを削除" title="削除" onClick={() => deleteLoan(loan.id)}>
                    <Trash2 size={18} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!loans.length && <EmptyState text="貸し借りはまだ登録されていません。" />}
    </section>
  );
}

function LoanDetailView({
  loan,
  selectedMonth,
  personLabel,
  toPerson,
  repaymentDrafts,
  setRepaymentDrafts,
  addRepayment,
  currentUserId,
  deleteLoan,
}: {
  loan?: Loan;
  selectedMonth: string;
  personLabel: (person: Person) => string;
  toPerson: (id: string) => Person;
  repaymentDrafts: Record<string, { amount: number; paid_at: string }>;
  setRepaymentDrafts: (drafts: Record<string, { amount: number; paid_at: string }>) => void;
  addRepayment: (loanId: string) => void;
  currentUserId: string;
  deleteLoan: (loanId: string) => void;
}) {
  if (!loan) {
    return (
      <section className="view">
        <PageHead title="貸し借り詳細" backHref="/loans" />
        <EmptyState text="貸し借りデータが見つかりません。" />
      </section>
    );
  }
  const repaid = sum(loan.loan_repayments);
  const remaining = Math.max(0, loan.principal_amount - repaid);
  const draft = repaymentDrafts[loan.id] ?? { amount: 0, paid_at: "" };
  const canManage = loan.lender_user_id === currentUserId;
  return (
    <section className="view">
      <PageHead
        title="貸し借り詳細"
        backHref="/loans"
        actions={canManage ? <><Link className="button ghost" href={`/loans/${loan.id}/edit`}><Pencil size={16} />編集</Link><button className="button danger" onClick={() => deleteLoan(loan.id)}><Trash2 size={16} />削除</button></> : undefined}
      />
      <Panel title={loan.title} action={remaining === 0 ? "完済済み" : `残金 ${yen.format(remaining)}`}>
        <dl className="detail-list">
          <div><dt>貸した人</dt><dd>{personLabel(toPerson(loan.lender_user_id))}</dd></div>
          <div><dt>借りた人</dt><dd>{personLabel(toPerson(loan.borrower_user_id))}</dd></div>
          <div><dt>貸し借りの総額</dt><dd>{yen.format(loan.principal_amount)}</dd></div>
          <div><dt>返済済み金額</dt><dd>{yen.format(repaid)}</dd></div>
          <div><dt>残金</dt><dd>{yen.format(remaining)}</dd></div>
          <div><dt>返済期限</dt><dd>{loan.due_date || "未設定"}</dd></div>
          <div><dt>登録日</dt><dd>{loan.borrowed_at}</dd></div>
          <div><dt>今月の予定</dt><dd>{yen.format(scheduledLoanAmount(loan, selectedMonth))}</dd></div>
        </dl>
      </Panel>

      {remaining > 0 && canManage && (
        <Panel title="返済登録" action="金額のみで登録できます">
          <div className="repayment-form detail-repayment-form">
            <NumberField label="返済金額" unit="円" value={draft.amount} onChange={(amount) => setRepaymentDrafts({ ...repaymentDrafts, [loan.id]: { ...draft, amount } })} />
            <TextField label="返済日" unit="年月日・任意" type="date" value={draft.paid_at} onChange={(paid_at) => setRepaymentDrafts({ ...repaymentDrafts, [loan.id]: { ...draft, paid_at } })} />
            <button className="button dark" onClick={() => addRepayment(loan.id)}><CheckCircle2 size={16} />返済登録</button>
          </div>
        </Panel>
      )}

      <Panel title="返済履歴">
        <div className="ledger-list">
          {loan.loan_repayments
            .slice()
            .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
            .map((repayment) => (
              <div className="ledger-row" key={repayment.id}>
                <span className="pill blue">返済</span>
                <div>
                  <strong>{repayment.paid_at}</strong>
                  <small>{repayment.method || "送金"}</small>
                </div>
                <b>{yen.format(repayment.amount)}</b>
              </div>
            ))}
        </div>
        {!loan.loan_repayments.length && <EmptyState text="返済履歴はまだありません。" />}
      </Panel>
    </section>
  );
}

function LoanFormView({
  form,
  setForm,
  selfName,
  partnerName,
  onSubmit,
  title = "貸し借り追加",
  submitLabel = "登録する",
}: {
  form: typeof loanDefaults;
  setForm: (form: typeof loanDefaults) => void;
  selfName: string;
  partnerName: string;
  onSubmit: () => void;
  title?: string;
  submitLabel?: string;
}) {
  return (
    <section className="view">
      <PageHead title={title} backHref="/loans" />
      <Panel title="貸し借り情報">
        <div className="stack-form">
          <TextField label="取引名" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
          <NumberField label="金額" unit="円" value={form.principal_amount} onChange={(value) => setForm({ ...form, principal_amount: value })} />
          <div className="readonly-field"><span>貸した人</span><strong>{selfName}</strong></div>
          <SelectField label="返済方法" value={form.repayment_type} onChange={(value) => setForm({ ...form, repayment_type: value as RepaymentType })} options={[["installment", "分割"], ["lump_sum", "一括"], ["flexible", "任意"]]} />
          <TextField label="借りた日" type="date" value={form.borrowed_at} onChange={(value) => setForm({ ...form, borrowed_at: value })} />
          <TextField label="返済期限" unit="年月日" type="date" value={form.due_date} onChange={(value) => setForm({ ...form, due_date: value })} />
          <NumberField label="分割回数" unit="回" value={form.installment_count} onChange={(value) => setForm({ ...form, installment_count: value })} />
          <NumberField label="月の返済額" unit="円" value={form.monthly_amount} onChange={(value) => setForm({ ...form, monthly_amount: value })} />
          <SelectField label="返済日の種類" value={form.repayment_day_mode} onChange={(value) => setForm({ ...form, repayment_day_mode: value as "day" | "payday" })} options={[["day", "日付を指定"], ["payday", "給料日"]]} />
          {form.repayment_day_mode === "day" && <NumberField label="返済予定日" unit="日" value={form.repayment_day} onChange={(value) => setForm({ ...form, repayment_day: value })} />}
          <TextField label="メモ" unit="任意" value={form.memo} onChange={(value) => setForm({ ...form, memo: value })} />
        </div>
        <button className="button primary form-submit" onClick={onSubmit}>{submitLabel}</button>
      </Panel>
    </section>
  );
}

function PersonalList({
  entries,
  incomeTotal,
  expenseTotal,
  editingEntryId,
  entryForm,
  categories,
  setEntryForm,
  setEditingEntryId,
  updateEntry,
  deleteEntry,
  exportRows,
}: {
  entries: PersonalEntry[];
  incomeTotal: number;
  expenseTotal: number;
  editingEntryId: string | null;
  entryForm: ReturnType<typeof makeEntryDefaults>;
  categories: PersonalCategory[];
  setEntryForm: (form: ReturnType<typeof makeEntryDefaults>) => void;
  setEditingEntryId: (id: string | null) => void;
  updateEntry: (entryId: string) => void;
  deleteEntry: (entryId: string) => void;
  exportRows: () => void;
}) {
  return (
    <section className="view">
      <PageHead title="個人収支一覧" backHref="/" actions={<button className="button ghost" onClick={exportRows}><Download size={16} />Excel</button>} />
      <div className="button-row action-grid">
        <Link className="button primary" href="/personal/income/new"><Plus size={16} />収入を追加</Link>
        <Link className="button dark" href="/personal/expense/new"><Plus size={16} />支出を追加</Link>
        <Link className="button ghost" href="/personal/categories/new"><Tag size={16} />カテゴリ追加</Link>
      </div>
      <div className="summary-grid two">
        <Metric icon={<Banknote />} label="収入" value={yen.format(incomeTotal)} tone="blue" />
        <Metric icon={<ReceiptText />} label="支出" value={yen.format(expenseTotal)} tone="red" />
      </div>
      <div className="ledger-list">
        {entries.map((entry) => (
          <div className="ledger-edit-block" key={entry.id}>
            <div className="ledger-row action-row">
              <Link className="ledger-main clickable-row" href={`/personal/${entry.id}`}>
                <span className={entry.type === "income" ? "pill blue" : "pill red"}>{entry.type === "income" ? "収入" : "支出"}</span>
                <div>
                  <strong>{entry.title}</strong>
                  <small>{entry.entry_date} / {entry.category}{entry.source ? ` / ${entry.source}` : ""}</small>
                </div>
                <b>{yen.format(entry.amount)}</b>
              </Link>
              <div className="icon-actions">
                <button
                  className="icon-button"
                  aria-label="収支を編集"
                  title="編集"
                  onClick={() => {
                    setEditingEntryId(entry.id);
                    setEntryForm({
                      type: entry.type,
                      entry_status: entry.entry_status || "confirmed",
                      title: entry.title,
                      amount: entry.amount,
                      entry_date: entry.entry_date,
                      category: entry.category,
                      source: entry.source,
                    });
                  }}
                >
                  <Pencil size={18} />
                </button>
                <button className="icon-button danger-icon" aria-label="収支を削除" title="削除" onClick={() => deleteEntry(entry.id)}>
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            {editingEntryId === entry.id && (
              <div className="inline-editor">
                <PersonalEntryFields form={entryForm} setForm={setEntryForm} categories={categories} />
                <div className="button-row">
                  <button className="button primary" onClick={() => updateEntry(entry.id)}><Save size={16} />保存</button>
                  <button className="button ghost" onClick={() => setEditingEntryId(null)}>キャンセル</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {!entries.length && <EmptyState text="この月の個人収支はありません。" />}
    </section>
  );
}

function PersonalEntryFormView({
  form,
  setForm,
  categories,
  onSubmit,
}: {
  form: ReturnType<typeof makeEntryDefaults>;
  setForm: (form: ReturnType<typeof makeEntryDefaults>) => void;
  categories: PersonalCategory[];
  onSubmit: () => void;
}) {
  const options = categories.filter((category) => category.type === form.type).map((category) => [category.name, category.name] as [string, string]);
  return (
    <section className="view">
      <PageHead title={form.type === "income" ? "収入追加" : "支出追加"} backHref="/personal" />
      <Panel title="内容">
        <PersonalEntryFields form={form} setForm={setForm} categories={categories} />
        <button className="button primary form-submit" onClick={onSubmit}>登録する</button>
      </Panel>
    </section>
  );
}

function PersonalEntryFields({
  form,
  setForm,
  categories,
}: {
  form: ReturnType<typeof makeEntryDefaults>;
  setForm: (form: ReturnType<typeof makeEntryDefaults>) => void;
  categories: PersonalCategory[];
}) {
  const options = categories.filter((category) => category.type === form.type).map((category) => [category.name, category.name] as [string, string]);
  return (
    <div className="stack-form">
      <TextField label="名前" unit="文字" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
      <NumberField label="金額" unit="円" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} />
      <TextField label="日付" unit="年月日" type="date" value={form.entry_date} onChange={(value) => setForm({ ...form, entry_date: value })} />
      <SelectField label="カテゴリ" value={form.category} onChange={(value) => setForm({ ...form, category: value })} options={options} />
      <TextField label="収入源・支払先" unit="任意" value={form.source} onChange={(value) => setForm({ ...form, source: value })} />
    </div>
  );
}

function CategoryFormView({
  form,
  setForm,
  categories,
  entries,
  editingCategoryId,
  editingCategoryName,
  setEditingCategoryId,
  setEditingCategoryName,
  onSubmit,
  updateCategory,
  deleteCategory,
}: {
  form: { type: MoneyType; name: string };
  setForm: (form: { type: MoneyType; name: string }) => void;
  categories: PersonalCategory[];
  entries: PersonalEntry[];
  editingCategoryId: string | null;
  editingCategoryName: string;
  setEditingCategoryId: (id: string | null) => void;
  setEditingCategoryName: (name: string) => void;
  onSubmit: () => void;
  updateCategory: (category: PersonalCategory) => void;
  deleteCategory: (category: PersonalCategory) => void;
}) {
  return (
    <section className="view">
      <PageHead title="カテゴリ追加" backHref="/personal" />
      <Panel title="カテゴリ">
        <div className="stack-form">
          <SelectField label="種類" value={form.type} onChange={(value) => setForm({ ...form, type: value as MoneyType })} options={[["income", "収入"], ["expense", "支出"]]} />
          <TextField label="カテゴリ名" unit="文字" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
        </div>
        <button className="button primary form-submit" onClick={onSubmit}>追加する</button>
      </Panel>

      <Panel title="登録済みカテゴリ">
        <div className="ledger-list">
          {categories.map((category) => {
            const inUse = entries.some((entry) => entry.category === category.name && entry.type === category.type);
            return (
              <div className="category-row" key={category.id}>
                <span className={category.type === "income" ? "pill blue" : "pill red"}>{category.type === "income" ? "収入" : "支出"}</span>
                {editingCategoryId === category.id ? (
                  <TextField label="カテゴリ名" unit="文字" value={editingCategoryName} onChange={setEditingCategoryName} />
                ) : (
                  <div className="category-name">
                    <strong>{category.name}</strong>
                    <small>{inUse ? "使用中" : "未使用"}</small>
                  </div>
                )}
                <div className="icon-actions">
                  {editingCategoryId === category.id ? (
                    <>
                      <button className="icon-button" aria-label="カテゴリを保存" title="保存" onClick={() => updateCategory(category)}><Save size={18} /></button>
                      <button className="icon-button" aria-label="編集をキャンセル" title="キャンセル" onClick={() => setEditingCategoryId(null)}><X size={18} /></button>
                    </>
                  ) : (
                    <>
                      <button className="icon-button" aria-label="カテゴリを編集" title="編集" onClick={() => { setEditingCategoryId(category.id); setEditingCategoryName(category.name); }}><Pencil size={18} /></button>
                      <button className="icon-button danger-icon" aria-label="カテゴリを削除" title="削除" onClick={() => deleteCategory(category)}><Trash2 size={18} /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </section>
  );
}

function PersonalDetailView({ entry }: { entry?: PersonalEntry }) {
  if (!entry) {
    return (
      <section className="view">
        <PageHead title="収支詳細" backHref="/personal" />
        <EmptyState text="データが見つかりません。" />
      </section>
    );
  }
  return (
    <section className="view">
      <PageHead title="収支詳細" backHref="/personal" />
      <Panel title={entry.title} action={entry.type === "income" ? "収入" : "支出"}>
        <dl className="detail-list">
          <div><dt>金額</dt><dd>{yen.format(entry.amount)}</dd></div>
          <div><dt>日付</dt><dd>{entry.entry_date}</dd></div>
          <div><dt>カテゴリ</dt><dd>{entry.category}</dd></div>
          <div><dt>収入源・支払先</dt><dd>{entry.source || "未設定"}</dd></div>
        </dl>
      </Panel>
    </section>
  );
}

function MyPageView({
  user,
  displayName,
  setDisplayName,
  saveProfile,
  profileAvatarUrl,
  setProfileAvatarUrl,
  pairInfo,
  pairForm,
  setPairForm,
  savePairSettings,
  members,
  currentUserId,
  pairId,
  partner,
  inviteCode,
  joinCode,
  setJoinCode,
  createPair,
  joinPair,
  regenerateInvite,
  changePassword,
  signOut,
  setMessage,
  workplaces,
  workplaceForm,
  setWorkplaceForm,
  editingWorkplaceId,
  setEditingWorkplaceId,
  saveWorkplace,
  deleteWorkplace,
  resetWorkplaceForm,
}: {
  user: User;
  displayName: string;
  setDisplayName: (value: string) => void;
  saveProfile: () => void;
  profileAvatarUrl: string;
  setProfileAvatarUrl: (value: string) => void;
  pairInfo: PairInfo | null;
  pairForm: { name: string; displayName: string; iconUrl: string };
  setPairForm: (form: { name: string; displayName: string; iconUrl: string }) => void;
  savePairSettings: () => void;
  members: PairMember[];
  currentUserId: string;
  pairId: string | null;
  partner?: PairMember;
  inviteCode: string;
  joinCode: string;
  setJoinCode: (value: string) => void;
  createPair: () => void;
  joinPair: () => void;
  regenerateInvite: () => void;
  changePassword: () => void;
  signOut: () => void;
  setMessage: (message: string) => void;
  workplaces: Workplace[];
  workplaceForm: { name: string; payday_day: number; payday_is_month_end: boolean };
  setWorkplaceForm: (form: { name: string; payday_day: number; payday_is_month_end: boolean }) => void;
  editingWorkplaceId: string | null;
  setEditingWorkplaceId: (id: string | null) => void;
  saveWorkplace: () => void;
  deleteWorkplace: (id: string) => void;
  resetWorkplaceForm: () => void;
}) {
  async function copyInviteCode() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setMessage("招待コードをコピーしました。");
    } catch {
      setMessage("コピーできませんでした。表示されたコードを長押ししてコピーしてください。");
    }
  }

  return (
    <section className="view">
      <PageHead title="Myページ" backHref="/" />
      <Panel title="自分の情報" action={user.email || ""}>
        <ImagePicker label="プロフィールアイコン" imageUrl={profileAvatarUrl} onChange={setProfileAvatarUrl} onMessage={setMessage} />
        <div className="stack-form">
          <TextField label="表示名" unit="文字" value={displayName} onChange={setDisplayName} />
        </div>
        <div className="button-row">
          <button className="button primary" onClick={saveProfile}>保存</button>
          <button className="button ghost" onClick={changePassword}><KeyRound size={16} />パスワード変更</button>
          <button className="button danger" onClick={signOut}><LogOut size={16} />ログアウト</button>
        </div>
      </Panel>

      <Panel title="ペア設定" action={pairId ? `${members.length}/2人` : "未設定"}>
        {pairId ? (
          <>
            <div className="stack-form pair-settings-form">
              <ImagePicker label="グループアイコン" imageUrl={pairForm.iconUrl} onChange={(iconUrl) => setPairForm({ ...pairForm, iconUrl })} onMessage={setMessage} />
              <TextField label="ペア名" unit="文字" value={pairForm.name} onChange={(name) => setPairForm({ ...pairForm, name })} />
              <TextField label="ペア内で使用する自分の表示名" unit="文字" value={pairForm.displayName} onChange={(displayNameValue) => setPairForm({ ...pairForm, displayName: displayNameValue })} />
              <button className="button primary" onClick={savePairSettings}><Save size={16} />ペア設定を保存</button>
            </div>
            <div className="member-list">
              {members.map((member) => (
                <div className="member-row" key={member.user_id}>
                  <UserRound size={18} />
                  <strong>{member.display_name}</strong>
                  <span>{member.user_id === currentUserId ? "あなた" : "相方"}</span>
                </div>
              ))}
            </div>
            {!partner && (
              <>
                <div className="button-row">
                  <button className="button primary" onClick={regenerateInvite}>招待コードを発行</button>
                  {inviteCode && <button className="button ghost" onClick={copyInviteCode}><Copy size={16} />コピー</button>}
                </div>
                {inviteCode && <div className="invite-code">{inviteCode}</div>}
              </>
            )}
          </>
        ) : (
          <>
            <div className="stack-form">
              <ImagePicker label="グループアイコン" imageUrl={pairForm.iconUrl} onChange={(iconUrl) => setPairForm({ ...pairForm, iconUrl })} onMessage={setMessage} />
              <TextField label="ペア名" unit="文字" value={pairForm.name} onChange={(name) => setPairForm({ ...pairForm, name })} />
              <TextField label="ペア内で使用する自分の表示名" unit="文字" value={pairForm.displayName} onChange={(displayNameValue) => setPairForm({ ...pairForm, displayName: displayNameValue })} />
            </div>
            <div className="button-row">
              <button className="button primary" onClick={createPair}>ペアを作成</button>
            </div>
            {inviteCode && <div className="invite-code">{inviteCode}</div>}
            <div className="stack-form join-form">
              <TextField label="招待コード" value={joinCode} onChange={(value) => setJoinCode(value.toUpperCase())} />
              <button className="button dark" onClick={joinPair}>ペアに参加</button>
            </div>
          </>
        )}
      </Panel>

      <Panel title="勤務先・給料日">
        <div className="stack-form">
          <TextField label="勤務先" unit="会社名・店舗名" value={workplaceForm.name} onChange={(name) => setWorkplaceForm({ ...workplaceForm, name })} />
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={workplaceForm.payday_is_month_end}
              onChange={(event) => setWorkplaceForm({ ...workplaceForm, payday_is_month_end: event.target.checked })}
            />
            <span>月末払い</span>
          </label>
          {!workplaceForm.payday_is_month_end && (
            <NumberField label="給料日" unit="日" value={workplaceForm.payday_day} onChange={(payday_day) => setWorkplaceForm({ ...workplaceForm, payday_day })} />
          )}
        </div>
        <div className="button-row">
          <button className="button primary" onClick={saveWorkplace}>{editingWorkplaceId ? "更新する" : "追加する"}</button>
          {editingWorkplaceId && <button className="button ghost" onClick={resetWorkplaceForm}>キャンセル</button>}
        </div>
        <div className="ledger-list workplace-list">
          {workplaces.map((workplace) => (
            <div className="category-row" key={workplace.id}>
              <Building2 size={18} />
              <div className="category-name">
                <strong>{workplace.name}</strong>
                <small>給料日: {workplace.payday_is_month_end ? "月末" : `${workplace.payday_day}日`}</small>
              </div>
              <div className="icon-actions">
                <button
                  className="icon-button"
                  aria-label="勤務先を編集"
                  title="編集"
                  onClick={() => {
                    setEditingWorkplaceId(workplace.id);
                    setWorkplaceForm({
                      name: workplace.name,
                      payday_day: workplace.payday_day || 25,
                      payday_is_month_end: workplace.payday_is_month_end,
                    });
                  }}
                >
                  <Pencil size={18} />
                </button>
                <button className="icon-button danger-icon" aria-label="勤務先を削除" title="削除" onClick={() => deleteWorkplace(workplace.id)}>
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function scheduledLoanAmount(loan: Loan, month: string) {
  if (month < monthOf(loan.borrowed_at)) return 0;
  if (loan.repayment_type === "flexible") return 0;
  if (loan.repayment_type === "lump_sum") return monthOf(loan.due_date) === month ? loan.principal_amount : 0;
  const start = new Date(`${monthOf(loan.borrowed_at)}-01T00:00:00`);
  const current = new Date(`${month}-01T00:00:00`);
  const index = (current.getFullYear() - start.getFullYear()) * 12 + current.getMonth() - start.getMonth();
  if (index < 0 || index >= loan.installment_count) return 0;
  const paidBeforeMonth = sum(loan.loan_repayments.filter((repayment) => monthOf(repayment.paid_at) < month));
  const remaining = Math.max(0, loan.principal_amount - paidBeforeMonth);
  return Math.min(loan.monthly_amount || Math.ceil(loan.principal_amount / loan.installment_count), remaining);
}

function AuthScreen({ supabase }: { supabase: SupabaseClient }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    setMessage("");
    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || window.location.origin}/auth/confirm`,
            },
          });
    if (result.error) setMessage(result.error.message);
    else if (mode === "signup") setMessage("登録しました。メールを確認してください。");
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand auth-brand">
          <div className="brand-mark"><WalletCards size={22} /></div>
          <div>
            <p className="eyebrow">Couple Money</p>
            <h1>ふたり家計簿</h1>
          </div>
        </div>
        <div className="segmented">
          <button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>ログイン</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>新規登録</button>
        </div>
        <TextField label="メールアドレス" value={email} onChange={setEmail} />
        <TextField label="パスワード" type="password" value={password} onChange={setPassword} />
        {message && <div className="notice">{message}</div>}
        <button className="button primary wide" onClick={submit}>{mode === "signin" ? "ログイン" : "登録する"}</button>
      </section>
    </main>
  );
}

function PageHead({ title, backHref, actions }: { title: string; backHref?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {backHref && <Link className="back-link" href={backHref}><ArrowLeft size={16} />戻る</Link>}
        <h2>{title}</h2>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function FullPageMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>{title}</h1>
        <p>{body}</p>
      </section>
    </main>
  );
}

function NavButton({
  icon,
  label,
  href,
  active,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  active: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="nav-button" aria-disabled="true">
        {icon}
        <span>{label}</span>
      </span>
    );
  }
  return (
    <Link className={active ? "nav-button active" : "nav-button"} href={href}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "dark" | "blue" | "red" }) {
  return (
    <article className={`metric ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function Panel({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        {action && <span>{action}</span>}
      </div>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  type = "text",
  unit,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  unit?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}{unit ? <em>{unit}</em> : null}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, unit, onChange }: { label: string; value: number; unit?: string; onChange: (value: number) => void }) {
  const displayValue = value > 0 ? String(value) : "";
  return (
    <label className="field">
      <span>{label}{unit ? <em>{unit}</em> : null}</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={displayValue}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^\d]/g, "");
          onChange(digits ? Number(digits) : 0);
        }}
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function ImagePicker({
  label,
  imageUrl,
  onChange,
  onMessage,
}: {
  label: string;
  imageUrl: string;
  onChange: (value: string) => void;
  onMessage: (message: string) => void;
}) {
  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onMessage("画像ファイルを選択してください。");
      return;
    }
    if (file.size > 600_000) {
      onMessage("画像は600KB以下にしてください。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  return (
    <div className="image-picker">
      <div className="image-preview" aria-label={`${label}のプレビュー`}>
        {imageUrl ? <img src={imageUrl} alt={label} /> : <ImagePlus size={24} />}
      </div>
      <div className="image-controls">
        <label className="button ghost">
          <ImagePlus size={16} />
          画像を選択
          <input type="file" accept="image/*" onChange={(event) => void handleFile(event.target.files?.[0])} />
        </label>
        {imageUrl && <button className="button danger" onClick={() => onChange("")}><Trash2 size={16} />削除</button>}
      </div>
    </div>
  );
}

function makeInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
