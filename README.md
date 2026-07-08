# ふたり家計簿

共有サブスク、2人間の貸し借り、個人収支をまとめて管理するNext.js App Routerアプリです。

## 機能

- Supabase Authでログイン
- ペア作成と招待コード参加
- 共有サブスク管理
- 貸し借りと返済実績管理
- 個人収入・支出管理
- 月次ダッシュボード
- CSV出力
- Supabase Row Level Securityによるアクセス制御

## Supabaseセットアップ

1. Supabaseでプロジェクトを作成します。
2. SQL Editorで `supabase/schema.sql` を実行します。
3. Vercelまたは `.env.local` に以下を設定します。

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

`service_role` keyは絶対にフロントエンドやVercel環境変数に入れないでください。

## ローカル起動

```powershell
npm install
npm run dev
```

この作業環境でNodeのパス権限問題が出る場合は以下を使います。

```powershell
.\scripts\dev-local.ps1
```

## Vercel

VercelのEnvironment Variablesに以下を設定してください。

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```
