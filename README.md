# ふたり家計簿

共有サブスク、2人間の貸し借り、個人収支をまとめて管理するNext.js App Routerアプリです。

## 現在の状態

- Next.js / Reactで実装
- Supabase Authでログイン
- Supabase PostgreSQLにデータ保存
- Row Level Securityでアクセス制御
- 招待コードはSHA-256ハッシュで保存
- Excel形式で月次データを出力

## Supabaseセットアップ

1. Supabaseで新しいプロジェクトを作成します。
2. SQL Editorで `supabase/schema.sql` を実行します。
3. Project Settings > APIから次の2つを取得します。
   - Project URL
   - anon public key
4. `.env.local` を作成して設定します。

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

`service_role` keyは絶対にフロントエンドやVercel環境変数に入れないでください。

## ローカル起動

この作業環境ではNode.jsがユーザーフォルダの実パス確認で止まることがあるため、付属スクリプトで作業フォルダを一時的に `X:` ドライブへ割り当てて起動します。

```powershell
.\scripts\dev-local.ps1
```

起動後、ブラウザで以下を開きます。

```text
http://localhost:3000
```

## ビルド確認

```powershell
.\scripts\build-local.ps1
```

## Vercel環境変数

Vercelに公開する前に、Project Settings > Environment Variablesで以下をProduction/Preview/Developmentに設定します。

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

