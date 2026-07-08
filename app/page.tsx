"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ArrowDownLeft, ArrowUpRight, Banknote, CalendarDays, CheckCircle2, Download, HandCoins, Lock, LogOut, Plus, ReceiptText, RefreshCcw, ShieldCheck, Users, WalletCards } from "lucide-react";

type Person = "me" | "partner";
type PaymentRow = { id: string; date: string; kind: string; payer: Person; receiver: string; amount: number; status: "予定" | "完了" | "不足" };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const today = new Date();
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

function monthOf(date: string) { return date.slice(0, 7); }
function sum(rows: { amount: number }[]) { return rows.reduce((t, r) => t + Number(r.amount), 0); }
function daysInMonth(month: string) { const [y, m] = month.split("-").map(Number); return new Date(y, m, 0).getDate(); }
function dateFor(month: string, day: number) { return `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, "0")}`; }
function makeCode() { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from(crypto.getRandomValues(new Uint8Array(8)), b => a[b % a.length]).join(""); }
async function sha256(value: string) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join(""); }

export default function Page() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) return <FullPage title="Supabase設定が必要です" body="Vercelの環境変数にNEXT_PUBLIC_SUPABASE_URLとNEXT_PUBLIC_SUPABASE_ANON_KEYを設定してください。" />;
  if (loading) return <FullPage title="読み込み中" body="認証状態を確認しています。" />;
  if (!session) return <Auth supabase={supabase} />;
  return <App supabase={supabase} user={session.user} />;
}

function App({ supabase, user }: { supabase: SupabaseClient; user: User }) {
  const [tab, setTab] = useState("dashboard");
  const [month, setMonth] = useState(currentMonth);
  const [message, setMessage] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pairId, setPairId] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [invite, setInvite] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [subForm, setSubForm] = useState({ name: "", owner: "me", amount: 0, billing_cycle: "monthly", billing_day: 1, billing_month: 1, share_type: "percentage", partner_share_value: 50 });
  const [loanForm, setLoanForm] = useState({ title: "", lender: "me", principal_amount: 0, borrowed_at: `${currentMonth}-01`, due_date: `${currentMonth}-28`, repayment_type: "installment", installment_count: 6, monthly_amount: 0, repayment_day: 25 });
  const [entryForm, setEntryForm] = useState({ type: "expense", title: "", amount: 0, entry_date: `${currentMonth}-01`, category: "その他", source: "" });
  const [repayDrafts, setRepayDrafts] = useState<Record<string, { amount: number; paid_at: string }>>({});

  const partner = members.find(m => m.user_id !== user.id);
  const selfName = members.find(m => m.user_id === user.id)?.display_name || displayName || "私";
  const partnerName = partner?.display_name || "相方";
  const personId = (p: Person) => p === "me" ? user.id : (partner?.user_id || user.id);
  const toPerson = (id: string): Person => id === user.id ? "me" : "partner";
  const label = (p: Person) => p === "me" ? selfName : partnerName;

  async function refresh() {
    setMessage("");
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    setDisplayName(profile?.display_name || "");
    const { data: mine, error } = await supabase.from("pair_members").select("pair_id").eq("user_id", user.id).limit(1);
    if (error) { setMessage(error.message); return; }
    const nextPair = mine?.[0]?.pair_id || null;
    setPairId(nextPair);
    const { data: personal } = await supabase.from("personal_entries").select("*").eq("user_id", user.id).order("entry_date", { ascending: false });
    setEntries(personal || []);
    if (!nextPair) { setMembers([]); setSubscriptions([]); setLoans([]); return; }
    const [m, s, l] = await Promise.all([
      supabase.from("pair_member_profiles").select("user_id, display_name").eq("pair_id", nextPair),
      supabase.from("subscriptions").select("*").eq("pair_id", nextPair).order("created_at", { ascending: false }),
      supabase.from("loans").select("*, loan_repayments(*)").eq("pair_id", nextPair).order("created_at", { ascending: false })
    ]);
    setMembers(m.data || []); setSubscriptions(s.data || []); setLoans(l.data || []);
  }

  useEffect(() => { refresh(); }, []);

  const monthEntries = entries.filter(e => monthOf(e.entry_date) === month);
  const subscriptionPayments = useMemo(() => subscriptions.flatMap(s => {
    if (s.status !== "active") return [];
    if (s.billing_cycle === "yearly" && Number(month.slice(5, 7)) !== s.billing_month) return [];
    const owner = toPerson(s.owner_user_id), other = owner === "me" ? "partner" : "me";
    const partnerShare = s.share_type === "percentage" ? Math.round(s.amount * s.partner_share_value / 100) : Math.min(s.partner_share_value, s.amount);
    const settlement = owner === "me" ? partnerShare : Math.max(0, s.amount - partnerShare);
    const rows: PaymentRow[] = [{ id: `${s.id}-ext`, date: dateFor(month, s.billing_day), kind: "共有サブスク外部支払い", payer: owner, receiver: s.name, amount: s.amount, status: "予定" }];
    if (settlement > 0) rows.push({ id: `${s.id}-set`, date: dateFor(month, s.billing_day), kind: "共有サブスク精算", payer: other, receiver: label(owner), amount: settlement, status: "予定" });
    return rows;
  }), [subscriptions, month, members]);

  const loanPayments = useMemo(() => loans.map(l => {
    const scheduled = scheduledLoan(l, month);
    const paid = sum((l.loan_repayments || []).filter((r: any) => monthOf(r.paid_at) === month));
    const amount = Math.max(0, scheduled - paid);
    if (scheduled === 0 && paid === 0) return null;
    return { id: `${l.id}-loan`, date: dateFor(month, l.repayment_day), kind: "貸し借り返済", payer: toPerson(l.borrower_user_id), receiver: label(toPerson(l.lender_user_id)), amount, status: amount === 0 ? "完了" : paid > 0 ? "不足" : "予定" } as PaymentRow;
  }).filter(Boolean) as PaymentRow[], [loans, month, members]);

  const payments = [...subscriptionPayments, ...loanPayments].sort((a, b) => a.date.localeCompare(b.date));
  const income = sum(monthEntries.filter(e => e.type === "income"));
  const expense = sum(monthEntries.filter(e => e.type === "expense"));

  async function saveProfile() {
    if (!displayName.trim()) return;
    const { error } = await supabase.from("profiles").upsert({ id: user.id, display_name: displayName.trim() });
    setMessage(error ? error.message : "表示名を保存しました。");
  }
  async function createPair() {
    if (!displayName.trim()) { setMessage("表示名を入力してください。"); return; }
    const code = makeCode();
    const { error } = await supabase.rpc("create_pair_with_invite_hash", { pair_name: "ふたりの家計簿", invite_hash: await sha256(code), display_name_input: displayName.trim() });
    if (error) setMessage(error.message); else { setInvite(code); setMessage("ペアを作成しました。"); refresh(); }
  }
  async function joinPair() {
    if (!displayName.trim() || !joinCode.trim()) return;
    const { error } = await supabase.rpc("join_pair_with_invite_hash", { invite_hash: await sha256(joinCode.trim().toUpperCase()), display_name_input: displayName.trim() });
    if (error) setMessage(error.message); else { setJoinCode(""); setMessage("ペアに参加しました。"); refresh(); }
  }
  async function addSub() {
    if (!pairId || !subForm.name.trim()) return;
    const { error } = await supabase.from("subscriptions").insert({ pair_id: pairId, name: subForm.name, owner_user_id: personId(subForm.owner as Person), amount: subForm.amount, billing_cycle: subForm.billing_cycle, billing_day: subForm.billing_day, billing_month: subForm.billing_month, share_type: subForm.share_type, partner_share_value: subForm.partner_share_value, status: "active" });
    if (error) setMessage(error.message); else { setSubForm({ name: "", owner: "me", amount: 0, billing_cycle: "monthly", billing_day: 1, billing_month: 1, share_type: "percentage", partner_share_value: 50 }); refresh(); }
  }
  async function addLoan() {
    if (!pairId || !loanForm.title.trim()) return;
    const lender = personId(loanForm.lender as Person), borrower = loanForm.lender === "me" ? personId("partner") : user.id;
    const { error } = await supabase.from("loans").insert({ pair_id: pairId, title: loanForm.title, lender_user_id: lender, borrower_user_id: borrower, principal_amount: loanForm.principal_amount, borrowed_at: loanForm.borrowed_at, due_date: loanForm.due_date, repayment_type: loanForm.repayment_type, installment_count: loanForm.installment_count, monthly_amount: loanForm.monthly_amount, repayment_day: loanForm.repayment_day, status: "active" });
    if (error) setMessage(error.message); else refresh();
  }
  async function addRepayment(id: string) {
    const d = repayDrafts[id] || { amount: 0, paid_at: `${month}-01` };
    if (d.amount <= 0) return;
    const { error } = await supabase.from("loan_repayments").insert({ loan_id: id, amount: d.amount, paid_at: d.paid_at, method: "送金" });
    if (error) setMessage(error.message); else refresh();
  }
  async function addEntry() {
    if (!entryForm.title.trim()) return;
    const { error } = await supabase.from("personal_entries").insert({ ...entryForm, user_id: user.id });
    if (error) setMessage(error.message); else { setEntryForm({ type: "expense", title: "", amount: 0, entry_date: `${month}-01`, category: "その他", source: "" }); refresh(); }
  }
  function exportCsv() {
    const csv = [["日付", "内容", "支払う人", "支払先", "金額", "状態"], ...payments.map(p => [p.date, p.kind, label(p.payer), p.receiver, p.amount, p.status])].map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv" })); a.download = `ふたり家計簿_${month}.csv`; a.click();
  }

  return <main className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><WalletCards size={22}/></div><div><p className="eyebrow">Couple Money</p><h1>ふたり家計簿</h1></div></div><nav className="nav"><Nav icon={<ReceiptText/>} label="ダッシュボード" active={tab==="dashboard"} onClick={()=>setTab("dashboard")}/><Nav icon={<RefreshCcw/>} label="サブスク" active={tab==="subscriptions"} disabled={!pairId} onClick={()=>setTab("subscriptions")}/><Nav icon={<HandCoins/>} label="貸し借り" active={tab==="loans"} disabled={!pairId} onClick={()=>setTab("loans")}/><Nav icon={<Banknote/>} label="個人収支" active={tab==="personal"} onClick={()=>setTab("personal")}/><Nav icon={<ShieldCheck/>} label="設定" active={tab==="settings"} onClick={()=>setTab("settings")}/></nav><div className="security-note"><Lock size={16}/>Supabase Auth + RLSで本人・ペア単位にアクセス制御します。</div></aside><section className="workspace"><header className="topbar"><div><p className="eyebrow">対象月</p><input className="month-input" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></div><div className="topbar-actions"><button className="button" onClick={refresh}><RefreshCcw size={16}/>更新</button><button className="button primary" onClick={exportCsv}><Download size={16}/>CSV出力</button><button className="button danger" onClick={()=>supabase.auth.signOut()}><LogOut size={16}/>ログアウト</button></div></header>{message && <div className="notice">{message}</div>}{!pairId && <PairSetup displayName={displayName} setDisplayName={setDisplayName} saveProfile={saveProfile} createPair={createPair} joinPair={joinPair} invite={invite} joinCode={joinCode} setJoinCode={setJoinCode}/>} {tab==="dashboard" && <section className="view"><div className="summary-grid"><Metric icon={<ArrowUpRight/>} label="私が今月払う" value={yen.format(sum(payments.filter(p=>p.payer==="me")))}/><Metric icon={<ArrowDownLeft/>} label="私が今月受け取る" value={yen.format(sum(payments.filter(p=>p.receiver===selfName)))} tone="blue"/><Metric icon={<Users/>} label="相方が今月払う" value={yen.format(sum(payments.filter(p=>p.payer==="partner")))}/><Metric icon={<CalendarDays/>} label="外部サブスク支払い" value={yen.format(sum(subscriptionPayments.filter(p=>p.kind.includes("外部"))))} tone="red"/><Metric icon={<Banknote/>} label="個人収入" value={yen.format(income)} tone="blue"/><Metric icon={<ReceiptText/>} label="個人支出" value={yen.format(expense)} tone="red"/></div><div className="split-layout"><Panel title="今月の支払い予定" action={`${payments.length}件`}><PaymentTable rows={payments} label={label}/></Panel><Panel title="今月の個人収支" action={yen.format(income-expense)}><Ledger entries={monthEntries}/></Panel></div></section>} {tab==="subscriptions" && <section className="view"><Panel title="共有サブスクを追加" action="契約者と精算を分けて計算"><div className="form-grid"><Field label="サブスク名" value={subForm.name} onChange={v=>setSubForm({...subForm,name:v})}/><Num label="金額" value={subForm.amount} onChange={v=>setSubForm({...subForm,amount:v})}/><Select label="契約者" value={subForm.owner} onChange={v=>setSubForm({...subForm,owner:v})} options={[["me",selfName],["partner",partnerName]]}/><Select label="周期" value={subForm.billing_cycle} onChange={v=>setSubForm({...subForm,billing_cycle:v})} options={[["monthly","毎月"],["yearly","年1回"]]}/><Num label="支払日" value={subForm.billing_day} onChange={v=>setSubForm({...subForm,billing_day:v})}/><Num label="年払い月" value={subForm.billing_month} onChange={v=>setSubForm({...subForm,billing_month:v})}/><Select label="負担方式" value={subForm.share_type} onChange={v=>setSubForm({...subForm,share_type:v})} options={[["percentage","比率"],["fixed","固定額"]]}/><Num label="相方側の負担率・額" value={subForm.partner_share_value} onChange={v=>setSubForm({...subForm,partner_share_value:v})}/></div><button className="button primary form-submit" onClick={addSub}><Plus size={16}/>追加</button></Panel><div className="card-grid">{subscriptions.map(s=><Card key={s.id} title={s.name} sub={`${label(toPerson(s.owner_user_id))}が契約者`} amount={s.amount} rows={[["周期",s.billing_cycle==="monthly"?"毎月":`${s.billing_month}月の年1回`],["支払日",`${s.billing_day}日`],["負担",s.share_type==="percentage"?`${s.partner_share_value}%`:yen.format(s.partner_share_value)]]}/>)}</div></section>} {tab==="loans" && <section className="view"><Panel title="貸し借りを追加" action="一括・分割・任意返済"><div className="form-grid"><Field label="取引名" value={loanForm.title} onChange={v=>setLoanForm({...loanForm,title:v})}/><Num label="元金" value={loanForm.principal_amount} onChange={v=>setLoanForm({...loanForm,principal_amount:v})}/><Select label="貸した人" value={loanForm.lender} onChange={v=>setLoanForm({...loanForm,lender:v})} options={[["me",selfName],["partner",partnerName]]}/><Select label="返済方法" value={loanForm.repayment_type} onChange={v=>setLoanForm({...loanForm,repayment_type:v})} options={[["installment","分割"],["lump_sum","一括"],["flexible","任意"]]}/><Field label="借りた日" type="date" value={loanForm.borrowed_at} onChange={v=>setLoanForm({...loanForm,borrowed_at:v})}/><Field label="返済期限" type="date" value={loanForm.due_date} onChange={v=>setLoanForm({...loanForm,due_date:v})}/><Num label="分割回数" value={loanForm.installment_count} onChange={v=>setLoanForm({...loanForm,installment_count:v})}/><Num label="月の返済額" value={loanForm.monthly_amount} onChange={v=>setLoanForm({...loanForm,monthly_amount:v})}/></div><button className="button primary form-submit" onClick={addLoan}><Plus size={16}/>追加</button></Panel><div className="card-grid">{loans.map(l=>{const repaid=sum(l.loan_repayments||[]), d=repayDrafts[l.id]||{amount:0,paid_at:`${month}-01`};return <article className="item-card" key={l.id}><div className="item-heading"><div><h3>{l.title}</h3><p>{label(toPerson(l.borrower_user_id))}が{label(toPerson(l.lender_user_id))}へ返済</p></div><b>{yen.format(Math.max(0,l.principal_amount-repaid))}</b></div><dl><div><dt>元金</dt><dd>{yen.format(l.principal_amount)}</dd></div><div><dt>返済済み</dt><dd>{yen.format(repaid)}</dd></div><div><dt>今月予定</dt><dd>{yen.format(scheduledLoan(l,month))}</dd></div></dl><div className="repayment-form"><input type="date" value={d.paid_at} onChange={e=>setRepayDrafts({...repayDrafts,[l.id]:{...d,paid_at:e.target.value}})}/><input type="number" value={d.amount} onChange={e=>setRepayDrafts({...repayDrafts,[l.id]:{...d,amount:Number(e.target.value)}})}/><button className="button dark" onClick={()=>addRepayment(l.id)}><CheckCircle2 size={16}/>返済</button></div></article>})}</div></section>} {tab==="personal" && <section className="view"><Panel title="個人収支を追加" action="本人だけのデータ"><div className="form-grid"><Select label="種別" value={entryForm.type} onChange={v=>setEntryForm({...entryForm,type:v})} options={[["expense","支出"],["income","収入"]]}/><Field label="名前" value={entryForm.title} onChange={v=>setEntryForm({...entryForm,title:v})}/><Num label="金額" value={entryForm.amount} onChange={v=>setEntryForm({...entryForm,amount:v})}/><Field label="日付" type="date" value={entryForm.entry_date} onChange={v=>setEntryForm({...entryForm,entry_date:v})}/><Field label="カテゴリ" value={entryForm.category} onChange={v=>setEntryForm({...entryForm,category:v})}/><Field label="収入源" value={entryForm.source} onChange={v=>setEntryForm({...entryForm,source:v})}/></div><button className="button primary form-submit" onClick={addEntry}><Plus size={16}/>追加</button></Panel><Panel title="個人収支一覧" action={`${monthEntries.length}件`}><Ledger entries={monthEntries}/></Panel></section>} {tab==="settings" && <section className="view"><Panel title="設定" action={user.email||""}><div className="form-grid"><Field label="表示名" value={displayName} onChange={setDisplayName}/></div><button className="button primary form-submit" onClick={saveProfile}>保存</button></Panel><Panel title="セキュリティ方針" action="Supabase RLS"><div className="settings-grid"><Info title="認証" body="パスワードはSupabase Authで管理します。"/><Info title="共有範囲" body="共有データは同じペアの2人だけ、個人収支は本人だけが読めます。"/><Info title="招待コード" body="DBにはSHA-256ハッシュだけ保存します。"/><Info title="保存しない情報" body="カード番号や銀行口座番号は保存しません。"/></div></Panel></section>}</section></main>;
}

function scheduledLoan(l: any, month: string) { if (month < monthOf(l.borrowed_at)) return 0; if (l.repayment_type === "flexible") return 0; if (l.repayment_type === "lump_sum") return monthOf(l.due_date) === month ? l.principal_amount : 0; const start = new Date(`${monthOf(l.borrowed_at)}-01`), cur = new Date(`${month}-01`); const idx = (cur.getFullYear()-start.getFullYear())*12+cur.getMonth()-start.getMonth(); if (idx < 0 || idx >= l.installment_count) return 0; const paidBefore = sum((l.loan_repayments||[]).filter((r:any)=>monthOf(r.paid_at)<month)); return Math.min(l.monthly_amount || Math.ceil(l.principal_amount/l.installment_count), Math.max(0,l.principal_amount-paidBefore)); }
function Auth({ supabase }: { supabase: SupabaseClient }) { const [mode,setMode]=useState<"in"|"up">("in"),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[msg,setMsg]=useState(""); async function submit(){const r=mode==="in"?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password}); setMsg(r.error?r.error.message:mode==="up"?"登録しました。メール確認が必要な場合は受信箱を確認してください。":"");} return <main className="auth-page"><section className="auth-panel"><div className="brand"><div className="brand-mark"><WalletCards size={22}/></div><div><p className="eyebrow">Couple Money</p><h1>ふたり家計簿</h1></div></div><div className="segmented"><button className={mode==="in"?"active":""} onClick={()=>setMode("in")}>ログイン</button><button className={mode==="up"?"active":""} onClick={()=>setMode("up")}>新規登録</button></div><Field label="メール" value={email} onChange={setEmail}/><Field label="パスワード" type="password" value={password} onChange={setPassword}/>{msg&&<div className="notice">{msg}</div>}<button className="button primary wide" onClick={submit}>{mode==="in"?"ログイン":"登録"}</button></section></main>; }
function PairSetup(p:any){return <section className="view setup-view"><Panel title="最初の設定" action="ペアを作成または参加"><div className="form-grid"><Field label="あなたの表示名" value={p.displayName} onChange={p.setDisplayName}/></div><div className="button-row"><button className="button dark" onClick={p.saveProfile}>表示名を保存</button><button className="button primary" onClick={p.createPair}>ペアを作成</button></div>{p.invite&&<div className="invite-code">{p.invite}</div>}</Panel><Panel title="相手のペアに参加" action="招待コードを入力"><div className="form-grid"><Field label="招待コード" value={p.joinCode} onChange={(v)=>p.setJoinCode(v.toUpperCase())}/></div><button className="button primary form-submit" onClick={p.joinPair}>参加する</button></Panel></section>}
function FullPage({title,body}:{title:string;body:string}){return <main className="auth-page"><section className="auth-panel"><h1>{title}</h1><p>{body}</p></section></main>}
function Nav(p:any){return <button className={p.active?"nav-button active":"nav-button"} onClick={p.onClick} disabled={p.disabled}>{p.icon}<span>{p.label}</span></button>}
function Metric({icon,label,value,tone="dark"}:any){return <article className={`metric ${tone}`}>{icon}<p>{label}</p><strong>{value}</strong></article>}
function Panel({title,action,children}:any){return <section className="panel"><div className="panel-heading"><h2>{title}</h2>{action&&<span>{action}</span>}</div>{children}</section>}
function Field({label,value,type="text",onChange}:any){return <label className="field"><span>{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)}/></label>}
function Num({label,value,onChange}:any){return <label className="field"><span>{label}</span><input type="number" min="0" value={value} onChange={e=>onChange(Number(e.target.value))}/></label>}
function Select({label,value,options,onChange}:any){return <label className="field"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}>{options.map((o:any)=><option key={o[0]} value={o[0]}>{o[1]}</option>)}</select></label>}
function PaymentTable({rows,label}:any){if(!rows.length)return <p className="empty">この月の支払い予定はありません。</p>;return <div className="table-wrap"><table><thead><tr><th>日付</th><th>内容</th><th>支払う人</th><th>支払先</th><th>金額</th><th>状態</th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.id}><td>{r.date}</td><td>{r.kind}</td><td>{label(r.payer)}</td><td>{r.receiver}</td><td>{yen.format(r.amount)}</td><td><span className={r.status==="完了"?"pill blue":r.status==="不足"?"pill red":"pill"}>{r.status}</span></td></tr>)}</tbody></table></div>}
function Ledger({entries}:any){if(!entries.length)return <p className="empty">この月の個人収支はありません。</p>;return <div className="ledger-list">{entries.map((e:any)=><div className="ledger-row" key={e.id}><span className={e.type==="income"?"pill blue":"pill red"}>{e.type==="income"?"収入":"支出"}</span><div><strong>{e.title}</strong><small>{e.entry_date} / {e.category}{e.source?` / ${e.source}`:""}</small></div><b>{yen.format(e.amount)}</b></div>)}</div>}
function Card({title,sub,amount,rows}:any){return <article className="item-card"><div className="item-heading"><div><h3>{title}</h3><p>{sub}</p></div><b>{yen.format(amount)}</b></div><dl>{rows.map((r:any)=><div key={r[0]}><dt>{r[0]}</dt><dd>{r[1]}</dd></div>)}</dl></article>}
function Info({title,body}:any){return <article className="info-block"><ShieldCheck size={18}/><h3>{title}</h3><p>{body}</p></article>}
