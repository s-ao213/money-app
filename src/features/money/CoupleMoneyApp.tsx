"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Download,
  HandCoins,
  Lock,
  LogOut,
  Plus,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import * as XLSX from "xlsx";

type Person = "me" | "partner";
type BillingCycle = "monthly" | "yearly";
type ShareType = "percentage" | "fixed";
type RepaymentType = "lump_sum" | "installment" | "flexible";
type MoneyType = "income" | "expense";

type PairMember = {
  user_id: string;
  display_name: string;
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

type PaymentRow = {
  id: string;
  date: string;
  kind: string;
  payer: Person;
  receiver: string;
  amount: number;
  status: "予定" | "完了" | "不足";
};

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const today = new Date();
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

const subscriptionDefaults = {
  name: "",
  owner: "me" as Person,
  amount: 0,
  billing_cycle: "monthly" as BillingCycle,
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

const entryDefaults = {
  type: "expense" as MoneyType,
  title: "",
  amount: 0,
  entry_date: `${currentMonth}-01`,
  category: "その他",
  source: "",
};

function monthOf(date: string) {
  return date.slice(0, 7);
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

function isSameOrAfterMonth(left: string, right: string) {
  return left >= right.slice(0, 7);
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

export type AppView = "dashboard" | "subscriptions" | "loans" | "personal" | "settings";

export default function CoupleMoneyApp({ view }: { view: AppView }) {
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
        await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }

      const { data } = await client.auth.getSession();
      setSession(data.session);
      setLoading(false);
    }

    void restoreSession();

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) return <SetupMissing />;
  if (loading) return <FullPageMessage title="読み込み中" body="Supabaseの認証状態を確認しています。" />;
  if (!session) return <AuthScreen supabase={supabase} />;

  return <MoneyApp supabase={supabase} user={session.user} view={view} />;
}

function MoneyApp({
  supabase,
  user,
  view,
}: {
  supabase: SupabaseClient;
  user: User;
  view: AppView;
}) {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [displayName, setDisplayName] = useState("");
  const [pairId, setPairId] = useState<string | null>(null);
  const [members, setMembers] = useState<PairMember[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [entries, setEntries] = useState<PersonalEntry[]>([]);
  const [message, setMessage] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [subscriptionForm, setSubscriptionForm] = useState(subscriptionDefaults);
  const [loanForm, setLoanForm] = useState(loanDefaults);
  const [entryForm, setEntryForm] = useState(entryDefaults);
  const [repaymentDrafts, setRepaymentDrafts] = useState<Record<string, { amount: number; paid_at: string }>>({});

  const partner = members.find((member) => member.user_id !== user.id);
  const selfName = members.find((member) => member.user_id === user.id)?.display_name || displayName || "私";
  const partnerName = partner?.display_name || "相方";

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
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    setDisplayName(profile?.display_name || "");

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

    const { data: personalEntries } = await supabase
      .from("personal_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("entry_date", { ascending: false });
    setEntries((personalEntries || []) as PersonalEntry[]);

    if (!nextPairId) {
      setMembers([]);
      setSubscriptions([]);
      setLoans([]);
      return;
    }

    const [{ data: pairMembers }, { data: sharedSubscriptions }, { data: sharedLoans }] =
      await Promise.all([
        supabase
          .from("pair_member_profiles")
          .select("user_id, display_name")
          .eq("pair_id", nextPairId),
        supabase
          .from("subscriptions")
          .select("*")
          .eq("pair_id", nextPairId)
          .order("created_at", { ascending: false }),
        supabase
          .from("loans")
          .select("*, loan_repayments(*)")
          .eq("pair_id", nextPairId)
          .order("created_at", { ascending: false }),
      ]);

    setMembers((pairMembers || []) as PairMember[]);
    setSubscriptions((sharedSubscriptions || []) as Subscription[]);
    setLoans((sharedLoans || []) as Loan[]);
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthEntries = useMemo(
    () => entries.filter((entry) => monthOf(entry.entry_date) === selectedMonth),
    [entries, selectedMonth],
  );

  const subscriptionPayments = useMemo(() => {
    return subscriptions.flatMap((subscription) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptions, selectedMonth, members]);

  const loanPayments = useMemo(() => {
    return loans
      .map((loan) => {
        const scheduled = scheduledLoanAmount(loan, selectedMonth);
        const paidThisMonth = loan.loan_repayments
          .filter((repayment) => monthOf(repayment.paid_at) === selectedMonth)
          .reduce((total, repayment) => total + repayment.amount, 0);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, selectedMonth, members]);

  const paymentRows = useMemo(
    () => [...subscriptionPayments, ...loanPayments].sort((a, b) => a.date.localeCompare(b.date)),
    [subscriptionPayments, loanPayments],
  );

  const incomeTotal = sum(monthEntries.filter((entry) => entry.type === "income"));
  const expenseTotal = sum(monthEntries.filter((entry) => entry.type === "expense"));
  const myOutgoing = sum(paymentRows.filter((row) => row.payer === "me"));
  const myIncoming = sum(paymentRows.filter((row) => row.receiver === selfName));
  const partnerOutgoing = sum(paymentRows.filter((row) => row.payer === "partner"));
  const externalTotal = sum(subscriptionPayments.filter((row) => row.kind.includes("外部")));

  async function saveProfile() {
    if (!displayName.trim()) return;
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: displayName.trim(),
    });
    if (error) setMessage(error.message);
    else setMessage("表示名を保存しました。");
  }

  async function createPair() {
    if (!displayName.trim()) {
      setMessage("先に表示名を入力してください。");
      return;
    }
    const code = makeInviteCode();
    const codeHash = await sha256(code);
    const { error } = await supabase.rpc("create_pair_with_invite_hash", {
      pair_name: "ふたりの家計簿",
      invite_hash: codeHash,
      display_name_input: displayName.trim(),
    });
    if (error) setMessage(error.message);
    else {
      setInviteCode(code);
      setMessage("ペアを作成しました。招待コードを相手に共有してください。");
      await refreshAll();
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
    const { error } = await supabase.from("subscriptions").insert({
      pair_id: pairId,
      name: subscriptionForm.name.trim(),
      owner_user_id: personId(subscriptionForm.owner),
      amount: subscriptionForm.amount,
      billing_cycle: subscriptionForm.billing_cycle,
      billing_day: subscriptionForm.billing_day,
      billing_month: subscriptionForm.billing_month,
      share_type: subscriptionForm.share_type,
      partner_share_value: subscriptionForm.partner_share_value,
      status: "active",
    });
    if (error) setMessage(error.message);
    else {
      setSubscriptionForm(subscriptionDefaults);
      await refreshAll();
    }
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
    else {
      setLoanForm(loanDefaults);
      await refreshAll();
    }
  }

  async function addRepayment(loanId: string) {
    const draft = repaymentDrafts[loanId] ?? { amount: 0, paid_at: `${selectedMonth}-01` };
    if (draft.amount <= 0) return;
    const { error } = await supabase.from("loan_repayments").insert({
      loan_id: loanId,
      paid_at: draft.paid_at,
      amount: draft.amount,
      method: "送金",
    });
    if (error) setMessage(error.message);
    else {
      setRepaymentDrafts((current) => ({ ...current, [loanId]: { amount: 0, paid_at: `${selectedMonth}-01` } }));
      await refreshAll();
    }
  }

  async function addEntry() {
    if (!entryForm.title.trim() || entryForm.amount <= 0) return;
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
    else {
      setEntryForm(entryDefaults);
      await refreshAll();
    }
  }

  function exportWorkbook() {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(paymentRows), "支払い予定");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(subscriptions), "サブスク");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(loans), "貸し借り");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(monthEntries), "個人収支");
    XLSX.writeFile(workbook, `ふたり家計簿_${selectedMonth}.xlsx`);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <WalletCards size={22} />
          </div>
          <div>
            <p className="eyebrow">Couple Money</p>
            <h1>ふたり家計簿</h1>
          </div>
        </div>

        <nav className="nav">
          <NavButton icon={<ReceiptText />} label="ダッシュボード" href="/" active={view === "dashboard"} />
          <NavButton icon={<RefreshCcw />} label="サブスク" href="/subscriptions" active={view === "subscriptions"} disabled={!pairId} />
          <NavButton icon={<HandCoins />} label="貸し借り" href="/loans" active={view === "loans"} disabled={!pairId} />
          <NavButton icon={<Banknote />} label="個人収支" href="/personal" active={view === "personal"} />
          <NavButton icon={<ShieldCheck />} label="設定" href="/settings" active={view === "settings"} />
        </nav>

        <div className="security-note">
          <Lock size={16} />
          <span>Supabase Auth + RLSで本人・ペア単位にアクセス制御します。カード番号や銀行口座番号は保存しません。</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">対象月</p>
            <input className="month-input" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
          </div>
          <div className="topbar-actions">
            <button className="button ghost" onClick={() => refreshAll()}>
              <RefreshCcw size={16} />
              更新
            </button>
            <button className="button primary" onClick={exportWorkbook}>
              <Download size={16} />
              Excel出力
            </button>
            <button className="button danger" onClick={() => supabase.auth.signOut()}>
              <LogOut size={16} />
              ログアウト
            </button>
          </div>
        </header>

        {message && <div className="notice">{message}</div>}

        {!pairId && <PairSetup displayName={displayName} setDisplayName={setDisplayName} saveProfile={saveProfile} createPair={createPair} joinPair={joinPair} inviteCode={inviteCode} joinCode={joinCode} setJoinCode={setJoinCode} />}

        {view === "dashboard" && (
          <section className="view">
            <div className="summary-grid">
              <Metric icon={<ArrowUpRight />} label="私が今月払う" value={yen.format(myOutgoing)} tone="dark" />
              <Metric icon={<ArrowDownLeft />} label="私が今月受け取る" value={yen.format(myIncoming)} tone="blue" />
              <Metric icon={<Users />} label="相方が今月払う" value={yen.format(partnerOutgoing)} tone="dark" />
              <Metric icon={<CalendarDays />} label="外部サブスク支払い" value={yen.format(externalTotal)} tone="red" />
              <Metric icon={<Banknote />} label="個人収入" value={yen.format(incomeTotal)} tone="blue" />
              <Metric icon={<ReceiptText />} label="個人支出" value={yen.format(expenseTotal)} tone="red" />
            </div>

            <div className="split-layout">
              <Panel title="今月の支払い予定" action={`${paymentRows.length}件`}>
                <PaymentTable rows={paymentRows} personLabel={personLabel} />
              </Panel>
              <Panel title="今月の個人収支" action={yen.format(incomeTotal - expenseTotal)}>
                <Ledger entries={monthEntries} />
              </Panel>
            </div>
          </section>
        )}

        {view === "subscriptions" && (
          <section className="view">
            <Panel title="共有サブスクを追加" action="契約者と精算を分けて計算">
              <div className="form-grid">
                <TextField label="サブスク名" value={subscriptionForm.name} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, name: value })} />
                <NumberField label="金額" value={subscriptionForm.amount} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, amount: value })} />
                <SelectField label="契約者" value={subscriptionForm.owner} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, owner: value as Person })} options={[["me", selfName], ["partner", partnerName]]} />
                <SelectField label="周期" value={subscriptionForm.billing_cycle} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, billing_cycle: value as BillingCycle })} options={[["monthly", "毎月"], ["yearly", "年1回"]]} />
                <NumberField label="支払日" value={subscriptionForm.billing_day} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, billing_day: value })} />
                <NumberField label="年払い月" value={subscriptionForm.billing_month} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, billing_month: value })} />
                <SelectField label="負担方式" value={subscriptionForm.share_type} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, share_type: value as ShareType })} options={[["percentage", "比率"], ["fixed", "固定額"]]} />
                <NumberField label={subscriptionForm.share_type === "percentage" ? "相方側の負担率" : "相方側の負担額"} value={subscriptionForm.partner_share_value} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, partner_share_value: value })} />
              </div>
              <button className="button primary form-submit" onClick={addSubscription}>
                <Plus size={16} />
                サブスクを追加
              </button>
            </Panel>

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
                    <div><dt>支払日</dt><dd>{subscription.billing_day}日</dd></div>
                    <div><dt>相方側負担</dt><dd>{subscription.share_type === "percentage" ? `${subscription.partner_share_value}%` : yen.format(subscription.partner_share_value)}</dd></div>
                    <div><dt>今月の精算</dt><dd>{subscriptionOccurs(subscription, selectedMonth) ? yen.format(ownerShare(subscription, toPerson(subscription.owner_user_id) === "me" ? "partner" : "me")) : "なし"}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "loans" && (
          <section className="view">
            <Panel title="貸し借りを追加" action="一括・分割・任意返済">
              <div className="form-grid">
                <TextField label="取引名" value={loanForm.title} onChange={(value) => setLoanForm({ ...loanForm, title: value })} />
                <NumberField label="元金" value={loanForm.principal_amount} onChange={(value) => setLoanForm({ ...loanForm, principal_amount: value })} />
                <SelectField label="貸した人" value={loanForm.lender} onChange={(value) => setLoanForm({ ...loanForm, lender: value as Person })} options={[["me", selfName], ["partner", partnerName]]} />
                <SelectField label="返済方法" value={loanForm.repayment_type} onChange={(value) => setLoanForm({ ...loanForm, repayment_type: value as RepaymentType })} options={[["installment", "分割"], ["lump_sum", "一括"], ["flexible", "任意"]]} />
                <TextField label="借りた日" type="date" value={loanForm.borrowed_at} onChange={(value) => setLoanForm({ ...loanForm, borrowed_at: value })} />
                <TextField label="返済期限" type="date" value={loanForm.due_date} onChange={(value) => setLoanForm({ ...loanForm, due_date: value })} />
                <NumberField label="分割回数" value={loanForm.installment_count} onChange={(value) => setLoanForm({ ...loanForm, installment_count: value })} />
                <NumberField label="月の返済額" value={loanForm.monthly_amount} onChange={(value) => setLoanForm({ ...loanForm, monthly_amount: value })} />
              </div>
              <button className="button primary form-submit" onClick={addLoan}>
                <Plus size={16} />
                貸し借りを追加
              </button>
            </Panel>

            <div className="card-grid">
              {loans.map((loan) => {
                const repaid = sum(loan.loan_repayments);
                const remaining = Math.max(0, loan.principal_amount - repaid);
                const scheduled = scheduledLoanAmount(loan, selectedMonth);
                const paidThisMonth = sum(loan.loan_repayments.filter((repayment) => monthOf(repayment.paid_at) === selectedMonth));
                const draft = repaymentDrafts[loan.id] ?? { amount: 0, paid_at: `${selectedMonth}-01` };
                return (
                  <article className="item-card loan-card" key={loan.id}>
                    <div className="item-heading">
                      <div>
                        <h3>{loan.title}</h3>
                        <p>{personLabel(toPerson(loan.borrower_user_id))}が{personLabel(toPerson(loan.lender_user_id))}へ返済</p>
                      </div>
                      <b>{yen.format(remaining)}</b>
                    </div>
                    <dl>
                      <div><dt>元金</dt><dd>{yen.format(loan.principal_amount)}</dd></div>
                      <div><dt>返済済み</dt><dd>{yen.format(repaid)}</dd></div>
                      <div><dt>今月予定</dt><dd>{yen.format(scheduled)}</dd></div>
                      <div><dt>今月実績</dt><dd>{yen.format(paidThisMonth)}</dd></div>
                    </dl>
                    <div className="repayment-form">
                      <input type="date" value={draft.paid_at} onChange={(event) => setRepaymentDrafts({ ...repaymentDrafts, [loan.id]: { ...draft, paid_at: event.target.value } })} />
                      <input type="number" min="0" value={draft.amount} onChange={(event) => setRepaymentDrafts({ ...repaymentDrafts, [loan.id]: { ...draft, amount: Number(event.target.value) } })} />
                      <button className="button dark" onClick={() => addRepayment(loan.id)}>
                        <CheckCircle2 size={16} />
                        返済登録
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {view === "personal" && (
          <section className="view">
            <Panel title="個人収支を追加" action="本人だけの家計簿データ">
              <div className="form-grid">
                <SelectField label="種別" value={entryForm.type} onChange={(value) => setEntryForm({ ...entryForm, type: value as MoneyType })} options={[["expense", "支出"], ["income", "収入"]]} />
                <TextField label="名前" value={entryForm.title} onChange={(value) => setEntryForm({ ...entryForm, title: value })} />
                <NumberField label="金額" value={entryForm.amount} onChange={(value) => setEntryForm({ ...entryForm, amount: value })} />
                <TextField label="日付" type="date" value={entryForm.entry_date} onChange={(value) => setEntryForm({ ...entryForm, entry_date: value })} />
                <TextField label="カテゴリ" value={entryForm.category} onChange={(value) => setEntryForm({ ...entryForm, category: value })} />
                <TextField label="収入源" value={entryForm.source} onChange={(value) => setEntryForm({ ...entryForm, source: value })} />
              </div>
              <button className="button primary form-submit" onClick={addEntry}>
                <Plus size={16} />
                収支を追加
              </button>
            </Panel>

            <Panel title="個人収支一覧" action={`${monthEntries.length}件`}>
              <Ledger entries={monthEntries} />
            </Panel>
          </section>
        )}

        {view === "settings" && (
          <section className="view">
            <Panel title="設定" action={user.email || ""}>
              <div className="form-grid">
                <TextField label="表示名" value={displayName} onChange={setDisplayName} />
              </div>
              <button className="button primary form-submit" onClick={saveProfile}>表示名を保存</button>
            </Panel>
            <Panel title="セキュリティ方針" action="Supabase RLS">
              <div className="settings-grid">
                <InfoBlock title="認証" body="メールアドレスとパスワードはSupabase Authで管理し、アプリ側に平文保存しません。" />
                <InfoBlock title="共有範囲" body="共有サブスクと貸し借りは同じペアの2人だけ、個人収支は本人だけが読めるRLSにします。" />
                <InfoBlock title="招待コード" body="招待コードはDBへ直接保存せず、SHA-256ハッシュだけを保存します。" />
                <InfoBlock title="保存しない情報" body="クレジットカード番号、銀行口座番号、外部サービスのパスワードは保存しません。" />
              </div>
            </Panel>
          </section>
        )}
      </section>
    </main>
  );
}

function scheduledLoanAmount(loan: Loan, month: string) {
  if (!isSameOrAfterMonth(month, loan.borrowed_at)) return 0;
  if (loan.repayment_type === "flexible") return 0;
  if (loan.repayment_type === "lump_sum") return monthOf(loan.due_date) === month ? loan.principal_amount : 0;

  const start = new Date(`${monthOf(loan.borrowed_at)}-01T00:00:00`);
  const current = new Date(`${month}-01T00:00:00`);
  const index = (current.getFullYear() - start.getFullYear()) * 12 + current.getMonth() - start.getMonth();
  if (index < 0 || index >= loan.installment_count) return 0;

  const paidBeforeMonth = loan.loan_repayments
    .filter((repayment) => monthOf(repayment.paid_at) < month)
    .reduce((total, repayment) => total + repayment.amount, 0);
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
              emailRedirectTo:
                `${
                  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
                  window.location.origin
                }/auth/callback`,
            },
          });

    if (result.error) setMessage(result.error.message);
    else if (mode === "signup") setMessage("登録しました。メール確認が必要な場合は、受信箱を確認してください。");
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

function PairSetup({
  displayName,
  setDisplayName,
  saveProfile,
  createPair,
  joinPair,
  inviteCode,
  joinCode,
  setJoinCode,
}: {
  displayName: string;
  setDisplayName: (value: string) => void;
  saveProfile: () => void;
  createPair: () => void;
  joinPair: () => void;
  inviteCode: string;
  joinCode: string;
  setJoinCode: (value: string) => void;
}) {
  return (
    <section className="view setup-view">
      <Panel title="最初の設定" action="ペアを作成または参加">
        <div className="form-grid">
          <TextField label="あなたの表示名" value={displayName} onChange={setDisplayName} />
        </div>
        <div className="button-row">
          <button className="button dark" onClick={saveProfile}>表示名を保存</button>
          <button className="button primary" onClick={createPair}>ペアを作成</button>
        </div>
        {inviteCode && <div className="invite-code">{inviteCode}</div>}
      </Panel>
      <Panel title="相手のペアに参加" action="招待コードを入力">
        <div className="form-grid">
          <TextField label="招待コード" value={joinCode} onChange={(value) => setJoinCode(value.toUpperCase())} />
        </div>
        <button className="button primary form-submit" onClick={joinPair}>参加する</button>
      </Panel>
    </section>
  );
}

function SetupMissing() {
  return (
    <FullPageMessage
      title="Supabase設定が必要です"
      body="NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を .env.local またはVercel環境変数に設定してください。"
    />
  );
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

function PaymentTable({ rows, personLabel }: { rows: PaymentRow[]; personLabel: (person: Person) => string }) {
  if (!rows.length) return <p className="empty">この月の支払い予定はありません。</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>日付</th>
            <th>内容</th>
            <th>支払う人</th>
            <th>支払先</th>
            <th>金額</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.date}</td>
              <td>{row.kind}</td>
              <td>{personLabel(row.payer)}</td>
              <td>{row.receiver}</td>
              <td>{yen.format(row.amount)}</td>
              <td><span className={row.status === "完了" ? "pill blue" : row.status === "不足" ? "pill red" : "pill"}>{row.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Ledger({ entries }: { entries: PersonalEntry[] }) {
  if (!entries.length) return <p className="empty">この月の個人収支はありません。</p>;

  return (
    <div className="ledger-list">
      {entries.map((entry) => (
        <div className="ledger-row" key={entry.id}>
          <span className={entry.type === "income" ? "pill blue" : "pill red"}>{entry.type === "income" ? "収入" : "支出"}</span>
          <div>
            <strong>{entry.title}</strong>
            <small>{entry.entry_date} / {entry.category}{entry.source ? ` / ${entry.source}` : ""}</small>
          </div>
          <b>{yen.format(entry.amount)}</b>
        </div>
      ))}
    </div>
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

function TextField({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min="0" value={value} onChange={(event) => onChange(Number(event.target.value))} />
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

function InfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <article className="info-block">
      <ShieldCheck size={18} />
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
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
