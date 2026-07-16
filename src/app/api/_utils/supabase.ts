import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function getApiSupabase(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const authorization = request.headers.get("authorization") || "";
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  });
}

export async function requireApiUser(request: NextRequest) {
  const supabase = getApiSupabase(request);
  if (!supabase) return { error: jsonError("Supabaseの設定が見つかりません。", 500) as NextResponse };

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { error: jsonError("ログインが必要です。", 401) as NextResponse };

  return { supabase, user: data.user };
}

export function positiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value) && Number(value) > 0) return Number(value);
  return null;
}

export function requiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
