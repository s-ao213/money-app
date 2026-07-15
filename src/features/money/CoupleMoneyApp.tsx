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
type BillingCycle = "monthly" | "yearly";
type BillingDayMode = "day" | "end_of_month" | "payday";
type ShareType = "percentage" | "fixed";
type RepaymentType = "lump_sum" | "installment" | "flexible";
type MoneyType = "income" | "expense";

type PairMember = { user_id: string; display_name: string };

type PairInfo = {
  id: string;
  name: string;
  icon_url: string | null;
};

type Subscription = {
  id: string;
  pair_id: string;
  name: string;
  owner_user_id: string;
  amount: number;
  billing_cycle: BillingCycle;
  billing_day: number;
  billing_month: number;
  share_type: ShareType;
  partner_share_value: number;
  status: "active" | "paused";
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
  title: string;
  amount: number;
  entry_date: string;
  category: string;
  source: string;
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
  | "loans"
  | "loanNew"
  | "loanDetail"
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

const subscriptionDefaults = {
  name: "",
  owner: "me" as Person,
  amount: 0,
  billing_cycle: "monthly" as BillingCycle,
  billing_day_mode: "day" as BillingDayMode,
  billing_day: 1,
  billing_month: 1,
  share_type: "percentage" as ShareType,
  partner_share_value: 50,
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
};

function makeEntryDefaults(type: MoneyType) {
  return {
    type,
    title: "",
    amount: 0,
    entry_date: `${currentMonth}-01`,
    category: type === "income" ? "給与" : "その他",
    source: "",
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
  if (subscription.billing_cycle === "monthly") return true;
  return Number(month.slice(5, 7)) === subscription.billing_month;
}

export default function CoupleMoneyApp({
  view,
  entryId,
  loanId,
}: {
  view: AppView;
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

  return <MoneyApp supabase={supabase} user={session.user} view={view} entryId={entryId} loanId={loanId} />;
}

function MoneyApp({
  supabase,
  user,
  view,
  entryId,
  loanId,
}: {
  supabase: SupabaseClient;
  user: User;
  view: AppView;
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

  async function refreshAll() {
    setMessage("");
    const { data: profile } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle();
    setDisplayName(profile?.display_name || "");
    setProfileAvatarUrl(profile?.avatar_url || "");

    const { data: personalEntries } = await supabase
      .from("personal_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("entry_date", { ascending: false });
    setEntries((personalEntries || []) as PersonalEntry[]);

    const { data: savedWorkplaces } = await supabase
      .from("workplaces")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setWorkplaces((savedWorkplaces || []) as Workplace[]);

    const { data: memberships, error: memberError } = await supabase
      .from("pair_members")
      .select("pair_id")
      .eq("user_id", user.id)
      .limit(1);

    if (memberError) {
      setMessage(memberError.message);
      return;
    }

    const nextPairId = memberships?.[0]?.pair_id || null;
    setPairId(nextPairId);

    let categoriesQuery = supabase
      .from("personal_categories")
      .select("id, user_id, pair_id, type, name")
      .order("name", { ascending: true });
    if (nextPairId) {
      categoriesQuery = categoriesQuery.or(`user_id.eq.${user.id},pair_id.eq.${nextPairId}`);
    } else {
      categoriesQuery = categoriesQuery.eq("user_id", user.id);
    }
    const { data: savedCategories, error: categoryError } = await categoriesQuery;
    if (categoryError) {
      setMessage(categoryError.message);
    } else {
      setCategories((savedCategories?.length ? savedCategories : defaultCategories) as PersonalCategory[]);
    }

    if (!nextPairId) {
      setMembers([]);
      setSubscriptions([]);
      setLoans([]);
      setPairInfo(null);
      return;
    }

    const [{ data: currentPair }, { data: pairMembers }, { data: sharedSubscriptions }, { data: sharedLoans }] = await Promise.all([
      supabase.from("pairs").select("id, name, icon_url").eq("id", nextPairId).maybeSingle(),
      supabase.from("pair_member_profiles").select("user_id, display_name").eq("pair_id", nextPairId),
      supabase.from("subscriptions").select("*").eq("pair_id", nextPairId).order("created_at", { ascending: false }),
      supabase.from("loans").select("*, loan_repayments(*)").eq("pair_id", nextPairId).order("created_at", { ascending: false }),
    ]);

    setPairInfo(currentPair as PairInfo | null);
    setPairForm({
      name: currentPair?.name || "ふたりの家計簿",
      displayName: pairMembers?.find((member) => member.user_id === user.id)?.display_name || profile?.display_name || "",
      iconUrl: currentPair?.icon_url || "",
    });
    setMembers((pairMembers || []) as PairMember[]);
    setSubscriptions((sharedSubscriptions || []) as Subscription[]);
    setLoans((sharedLoans || []) as Loan[]);
  }

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const selectedEntry = entries.find((entry) => entry.id === entryId);
  const selectedLoan = loans.find((loan) => loan.id === loanId);
  const canAddLoan = !loans.length || loans.some((loan) => loan.lender_user_id === user.id);

  async function saveProfile() {
    if (!displayName.trim()) return;
    const { error } = await supabase.from("profiles").upsert({ id: user.id, display_name: displayName.trim(), avatar_url: profileAvatarUrl || null });
    setMessage(error ? error.message : "表示名を保存しました。");
    if (!error) await refreshAll();
  }

  async function savePairSettings() {
    if (!pairId) return;
    if (!pairForm.name.trim() || !pairForm.displayName.trim()) {
      setMessage("ペア名とペア内の表示名を入力してください。");
      return;
    }
    const [{ error: pairError }, { error: memberError }] = await Promise.all([
      supabase.from("pairs").update({ name: pairForm.name.trim(), icon_url: pairForm.iconUrl || null }).eq("id", pairId),
      supabase.from("pair_members").update({ display_name: pairForm.displayName.trim() }).eq("pair_id", pairId).eq("user_id", user.id),
    ]);
    setMessage(pairError?.message || memberError?.message || "ペア設定を保存しました。");
    if (!pairError && !memberError) await refreshAll();
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
      user_id: user.id,
      name: workplaceForm.name.trim(),
      payday_day: workplaceForm.payday_is_month_end ? null : workplaceForm.payday_day,
      payday_is_month_end: workplaceForm.payday_is_month_end,
    };
    const { error } = editingWorkplaceId
      ? await supabase.from("workplaces").update(payload).eq("id", editingWorkplaceId).eq("user_id", user.id)
      : await supabase.from("workplaces").insert(payload);
    if (error) setMessage(error.message);
    else {
      setMessage(editingWorkplaceId ? "勤務先を更新しました。" : "勤務先を追加しました。");
      resetWorkplaceForm();
      await refreshAll();
    }
  }

  async function deleteWorkplace(id: string) {
    if (!window.confirm("この勤務先を本当に削除しますか？")) return;
    const { error } = await supabase.from("workplaces").delete().eq("id", id).eq("user_id", user.id);
    setMessage(error ? error.message : "勤務先を削除しました。");
    if (!error) await refreshAll();
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
    const { error } = await supabase.rpc("create_pair_with_invite_hash", {
      pair_name: nameForPair,
      invite_hash: codeHash,
      display_name_input: nameForMe,
      icon_url_input: pairForm.iconUrl || null,
    });
    if (error) setMessage(error.message);
    else {
      setInviteCode(code);
      setMessage("ペアを作成しました。");
      await refreshAll();
    }
  }

  async function regenerateInvite() {
    if (!pairId || partner) return;
    const code = makeInviteCode();
    const codeHash = await sha256(code);
    const { error } = await supabase.rpc("regenerate_pair_invite_hash", {
      pair_id_input: pairId,
      invite_hash: codeHash,
    });
    if (error) setMessage(error.message);
    else {
      setInviteCode(code);
      setMessage("新しい招待コードを発行しました。");
    }
  }

  async function joinPair() {
    if (!displayName.trim() || !joinCode.trim()) {
      setMessage("表示名と招待コードを入力してください。");
      return;
    }
    const codeHash = await sha256(joinCode.trim().toUpperCase());
    const { error } = await supabase.rpc("join_pair_with_invite_hash", {
      invite_hash: codeHash,
      display_name_input: displayName.trim(),
    });
    if (error) setMessage(error.message);
    else {
      setJoinCode("");
      setMessage("ペアに参加しました。");
      await refreshAll();
    }
  }

  async function addSubscription() {
    if (!pairId || !subscriptionForm.name.trim() || subscriptionForm.amount <= 0) return;
    const billingDay =
      subscriptionForm.billing_cycle === "monthly" && subscriptionForm.billing_day_mode === "end_of_month"
        ? 31
        : subscriptionForm.billing_cycle === "monthly" && subscriptionForm.billing_day_mode === "payday"
          ? 25
          : subscriptionForm.billing_day;
    const { error } = await supabase.from("subscriptions").insert({
      pair_id: pairId,
      name: subscriptionForm.name.trim(),
      owner_user_id: personId(subscriptionForm.owner),
      amount: subscriptionForm.amount,
      billing_cycle: subscriptionForm.billing_cycle,
      billing_day: billingDay,
      billing_month: subscriptionForm.billing_month,
      share_type: subscriptionForm.share_type,
      partner_share_value: subscriptionForm.partner_share_value,
      status: "active",
    });
    if (error) setMessage(error.message);
    else window.location.href = "/subscriptions";
  }

  async function addLoan() {
    if (!pairId || !loanForm.title.trim() || loanForm.principal_amount <= 0) return;
    const lenderId = personId(loanForm.lender);
    const borrowerId = loanForm.lender === "me" ? personId("partner") : user.id;
    const { error } = await supabase.from("loans").insert({
      pair_id: pairId,
      title: loanForm.title.trim(),
      lender_user_id: lenderId,
      borrower_user_id: borrowerId,
      principal_amount: loanForm.principal_amount,
      borrowed_at: loanForm.borrowed_at,
      due_date: loanForm.due_date,
      repayment_type: loanForm.repayment_type,
      installment_count: loanForm.installment_count,
      monthly_amount: loanForm.monthly_amount,
      repayment_day: loanForm.repayment_day,
      status: "active",
    });
    if (error) setMessage(error.message);
    else window.location.href = "/loans";
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
    const { error } = await supabase.from("loan_repayments").insert({
      loan_id: loanId,
      paid_at: paidAt,
      amount: draft.amount,
      method: "送金",
    });
    if (error) setMessage(error.message);
    else {
      if (remaining - draft.amount <= 0) {
        await supabase.from("loans").update({ status: "paid" }).eq("id", loanId);
      }
      setMessage("返済を登録しました。");
      setRepaymentDrafts((current) => ({ ...current, [loanId]: { amount: 0, paid_at: "" } }));
      await refreshAll();
    }
  }

  async function addEntry() {
    if (!entryForm.title.trim() || entryForm.amount <= 0) {
      setMessage("名前と金額を入力してください。");
      return;
    }
    const { error } = await supabase.from("personal_entries").insert({
      user_id: user.id,
      type: entryForm.type,
      title: entryForm.title.trim(),
      amount: entryForm.amount,
      entry_date: entryForm.entry_date,
      category: entryForm.category,
      source: entryForm.source,
    });
    if (error) setMessage(error.message);
    else window.location.href = "/personal";
  }

  async function updateEntry(entryIdToUpdate: string) {
    if (!entryForm.title.trim() || entryForm.amount <= 0) {
      setMessage("名前と金額を入力してください。");
      return;
    }
    const { error } = await supabase
      .from("personal_entries")
      .update({
        type: entryForm.type,
        title: entryForm.title.trim(),
        amount: entryForm.amount,
        entry_date: entryForm.entry_date,
        category: entryForm.category,
        source: entryForm.source,
      })
      .eq("id", entryIdToUpdate)
      .eq("user_id", user.id);
    if (error) setMessage(error.message);
    else {
      setMessage("収支を更新しました。");
      setEditingEntryId(null);
      await refreshAll();
    }
  }

  async function deleteEntry(entryIdToDelete: string) {
    if (!window.confirm("この収支を本当に削除しますか？")) return;
    const { error } = await supabase.from("personal_entries").delete().eq("id", entryIdToDelete).eq("user_id", user.id);
    setMessage(error ? error.message : "収支を削除しました。");
    if (!error) await refreshAll();
  }

  async function addCategory() {
    if (!categoryForm.name.trim()) {
      setMessage("カテゴリ名を入力してください。");
      return;
    }
    const { error } = await supabase.from("personal_categories").insert({
      user_id: user.id,
      pair_id: pairId,
      type: categoryForm.type,
      name: categoryForm.name.trim(),
    });
    if (error) {
      setMessage(error.code === "23505" ? "同じカテゴリがすでに登録されています。" : error.message);
      return;
    }
    setMessage("カテゴリを追加しました。");
    setCategoryForm({ type: "expense", name: "" });
    await refreshAll();
  }

  async function updateCategory(category: PersonalCategory) {
    if (!editingCategoryName.trim()) {
      setMessage("カテゴリ名を入力してください。");
      return;
    }
    const { error } = await supabase
      .from("personal_categories")
      .update({ name: editingCategoryName.trim() })
      .eq("id", category.id)
      .eq("user_id", user.id);
    if (error) setMessage(error.code === "23505" ? "同じカテゴリがすでに登録されています。" : error.message);
    else {
      setMessage("カテゴリを更新しました。");
      setEditingCategoryId(null);
      setEditingCategoryName("");
      await refreshAll();
    }
  }

  async function deleteCategory(category: PersonalCategory) {
    if (entries.some((entry) => entry.category === category.name && entry.type === category.type)) {
      setMessage("このカテゴリは収支データで使用中です。先に収支のカテゴリを変更してください。");
      return;
    }
    if (!window.confirm("このカテゴリを本当に削除しますか？")) return;
    const { error } = await supabase.from("personal_categories").delete().eq("id", category.id).eq("user_id", user.id);
    setMessage(error ? error.message : "カテゴリを削除しました。");
    if (!error) await refreshAll();
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

        {view === "loans" && (
          pairId ? (
            <LoansList
              loans={loans}
              canAddLoan={canAddLoan}
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
  exportRows,
}: {
  subscriptions: Subscription[];
  selectedMonth: string;
  personLabel: (person: Person) => string;
  toPerson: (id: string) => Person;
  exportRows: () => void;
}) {
  return (
    <section className="view">
      <PageHead title="サブスク一覧" backHref="/" actions={<><Link className="button primary" href="/subscriptions/new"><Plus size={16} />追加</Link><button className="button ghost" onClick={exportRows}><Download size={16} />Excel</button></>} />
      <div className="card-grid">
        {subscriptions.map((subscription) => (
          <article className="item-card" key={subscription.id}>
            <div className="item-heading">
              <div>
                <h3>{subscription.name}</h3>
                <p>{personLabel(toPerson(subscription.owner_user_id))}が契約者</p>
              </div>
              <b>{yen.format(subscription.amount)}</b>
            </div>
            <dl>
              <div><dt>周期</dt><dd>{subscription.billing_cycle === "monthly" ? "毎月" : `${subscription.billing_month}月の年1回`}</dd></div>
              <div><dt>支払日</dt><dd>{subscription.billing_day >= 31 ? "月末" : `${subscription.billing_day}日`}</dd></div>
              <div><dt>相方側負担</dt><dd>{subscription.share_type === "percentage" ? `${subscription.partner_share_value}%` : yen.format(subscription.partner_share_value)}</dd></div>
              <div><dt>今月</dt><dd>{subscriptionOccurs(subscription, selectedMonth) ? "支払いあり" : "なし"}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      {!subscriptions.length && <EmptyState text="登録済みのサブスクはありません。" />}
    </section>
  );
}

function SubscriptionFormView({
  form,
  setForm,
  selfName,
  partnerName,
  onSubmit,
}: {
  form: typeof subscriptionDefaults;
  setForm: (form: typeof subscriptionDefaults) => void;
  selfName: string;
  partnerName: string;
  onSubmit: () => void;
}) {
  return (
    <section className="view">
      <PageHead title="サブスク追加" backHref="/subscriptions" />
      <Panel title="サブスク情報">
        <div className="stack-form">
          <TextField label="サブスク名" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <NumberField label="金額" unit="円" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} />
          <SelectField label="契約者" value={form.owner} onChange={(value) => setForm({ ...form, owner: value as Person })} options={[["me", selfName], ["partner", partnerName]]} />
          <SelectField label="周期" value={form.billing_cycle} onChange={(value) => setForm({ ...form, billing_cycle: value as BillingCycle })} options={[["monthly", "月払い"], ["yearly", "年払い"]]} />
          {form.billing_cycle === "monthly" ? (
            <>
              <SelectField label="支払日の種類" value={form.billing_day_mode} onChange={(value) => setForm({ ...form, billing_day_mode: value as BillingDayMode })} options={[["day", "日付を指定"], ["end_of_month", "月末"], ["payday", "給料日"]]} />
              {form.billing_day_mode === "day" && <NumberField label="支払日" unit="日" value={form.billing_day} onChange={(value) => setForm({ ...form, billing_day: value })} />}
            </>
          ) : (
            <>
              <NumberField label="年払い月" unit="月" value={form.billing_month} onChange={(value) => setForm({ ...form, billing_month: value })} />
              <NumberField label="支払日" unit="日" value={form.billing_day} onChange={(value) => setForm({ ...form, billing_day: value })} />
            </>
          )}
          <SelectField label="負担方式" value={form.share_type} onChange={(value) => setForm({ ...form, share_type: value as ShareType })} options={[["percentage", "比率"], ["fixed", "固定額"]]} />
          <NumberField label={form.share_type === "percentage" ? "相方側の負担率" : "相方側の負担額"} unit={form.share_type === "percentage" ? "%" : "円"} value={form.partner_share_value} onChange={(value) => setForm({ ...form, partner_share_value: value })} />
        </div>
        <button className="button primary form-submit" onClick={onSubmit}>登録する</button>
      </Panel>
    </section>
  );
}

function LoansList({
  loans,
  canAddLoan,
  exportRows,
}: {
  loans: Loan[];
  canAddLoan: boolean;
  exportRows: () => void;
}) {
  return (
    <section className="view">
      <PageHead
        title="貸し借り一覧"
        backHref="/"
        actions={<>{canAddLoan && <Link className="button primary" href="/loans/new"><Plus size={16} />追加</Link>}<button className="button ghost" onClick={exportRows}><Download size={16} />Excel</button></>}
      />
      <div className="card-grid">
        {loans.map((loan) => {
          return (
            <Link className="item-card loan-card clickable-card" href={`/loans/${loan.id}`} key={loan.id}>
              <div className="item-heading">
                <div>
                  <h3>{loan.title}</h3>
                  <p>{loan.status === "paid" ? "完済済み" : "詳細を表示"}</p>
                </div>
                <b>{yen.format(loan.principal_amount)}</b>
              </div>
            </Link>
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
}: {
  loan?: Loan;
  selectedMonth: string;
  personLabel: (person: Person) => string;
  toPerson: (id: string) => Person;
  repaymentDrafts: Record<string, { amount: number; paid_at: string }>;
  setRepaymentDrafts: (drafts: Record<string, { amount: number; paid_at: string }>) => void;
  addRepayment: (loanId: string) => void;
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
  return (
    <section className="view">
      <PageHead title="貸し借り詳細" backHref="/loans" />
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

      {remaining > 0 && (
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
}: {
  form: typeof loanDefaults;
  setForm: (form: typeof loanDefaults) => void;
  selfName: string;
  partnerName: string;
  onSubmit: () => void;
}) {
  return (
    <section className="view">
      <PageHead title="貸し借り追加" backHref="/loans" />
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
        </div>
        <button className="button primary form-submit" onClick={onSubmit}>登録する</button>
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
