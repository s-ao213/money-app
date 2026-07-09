"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("メールアドレスを確認しています...");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabaseの設定が見つかりません。");
      return;
    }
    const client = supabase;

    let active = true;

    async function finishAuthentication() {
      const code = new URLSearchParams(window.location.search).get("code");
      if (!code) {
        setMessage("確認コードが見つかりません。登録画面からもう一度お試しください。");
        return;
      }

      const { error } = await client.auth.exchangeCodeForSession(code);

      if (!active) return;
      if (error) {
        setMessage(`確認に失敗しました: ${error.message}`);
        return;
      }

      window.history.replaceState(null, "", "/auth/callback");
      router.replace("/");
    }

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (session && active) {
        window.history.replaceState(null, "", "/auth/callback");
        router.replace("/");
      }
    });

    void finishAuthentication();

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>メール確認</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
