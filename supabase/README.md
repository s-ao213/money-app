# Supabase setup

1. SupabaseのSQL Editorを開きます。
2. `supabase/schema.sql` の内容を実行します。
3. Project Settings > APIからProject URLとanon public keyを取得します。
4. VercelのEnvironment Variablesに設定します。

このアプリはanon keyを使いますが、DB側のRow Level Securityで本人・ペア単位に制限します。
