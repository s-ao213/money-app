# Supabase setup

1. Supabaseで新しいプロジェクトを作成します。
2. SQL Editorで `supabase/schema.sql` の内容を実行します。
3. Project Settings > API から以下を取得します。
   - Project URL
   - anon public key
4. ローカルでは `.env.local` に設定します。

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

5. Vercelでも同じ2つをEnvironment Variablesに設定します。

このアプリはanon keyを使いますが、DB側のRow Level Securityで本人・ペア単位に制限します。service role keyはフロントエンドにもVercel環境変数にも入れないでください。
