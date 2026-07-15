"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { type EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function AuthConfirmPage() {
  const router = useRouter();
  const [message, setMessage] = useState("メール認証を完了しています...");

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setMessage("認証の設定を読み込めませんでした。時間をおいてもう一度お試しください。");
      return;
    }
    const supabase = client;

    let active = true;

    async function confirmEmail() {
      const search = new URLSearchParams(window.location.search);
      const next = safeNext(search.get("next"));
      const code = search.get("code");
      const tokenHash = search.get("token_hash");
      const type = search.get("type") as EmailOtpType | null;

      const result = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : tokenHash && type
          ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
          : { error: new Error("認証情報が見つかりませんでした。メール内の最新のリンクを開いてください。") };

      if (!active) return;
      if (result.error) {
        setMessage(`認証に失敗しました: ${result.error.message}`);
        return;
      }

      window.history.replaceState(null, "", "/auth/confirm");
      router.replace(next);
    }

    void confirmEmail();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>メール認証</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
