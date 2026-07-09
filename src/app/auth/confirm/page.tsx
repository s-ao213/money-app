"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ConfirmEmailPage() {
  const router = useRouter();
  const [message, setMessage] = useState("メールアドレスを確認しています...");

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    const tokenHash = new URL(window.location.href).searchParams.get("token_hash");

    if (!client) {
      setMessage("Supabaseの設定が見つかりません。");
      return;
    }

    if (!tokenHash) {
      setMessage("確認情報が見つかりません。新しい確認メールをお試しください。");
      return;
    }
    const supabase = client;
    const confirmationToken = tokenHash;

    async function confirmEmail() {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: confirmationToken,
        type: "signup",
      });

      if (error) {
        setMessage("確認リンクが無効または期限切れです。新しい確認メールをお試しください。");
        return;
      }

      window.history.replaceState(null, "", "/auth/confirm");
      router.replace("/");
    }

    void confirmEmail();
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
