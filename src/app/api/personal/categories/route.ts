import { type NextRequest } from "next/server";
import { jsonError, jsonOk, requireApiUser, requiredString } from "../../_utils/supabase";

function readCategoryPayload(body: any) {
  const name = requiredString(body?.name);
  const type = body?.type === "income" || body?.type === "expense" ? body.type : null;
  const pairId = typeof body?.pair_id === "string" && body.pair_id.trim() ? body.pair_id.trim() : null;
  if (!name || !type) return { error: "カテゴリ名と種類を入力してください。" as const };
  return { data: { name, type, pair_id: pairId } };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const pairId = searchParams.get("pair_id");

  let query = auth.supabase.from("personal_categories").select("id, user_id, pair_id, type, name").order("name", { ascending: true });
  query = pairId ? query.or(`user_id.eq.${auth.user.id},pair_id.eq.${pairId}`) : query.eq("user_id", auth.user.id);

  const { data, error } = await query;
  if (error) return jsonError(error.message, 400);
  return jsonOk(data || []);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const payload = readCategoryPayload(body);
  if ("error" in payload) return jsonError(payload.error || "カテゴリ名と種類を入力してください。", 422);

  const { data, error } = await auth.supabase
    .from("personal_categories")
    .insert({ user_id: auth.user.id, ...payload.data })
    .select("id, user_id, pair_id, type, name")
    .single();

  if (error) return jsonError(error.code === "23505" ? "同じカテゴリがすでに登録されています。" : error.message, 400);
  return jsonOk(data, { status: 201 });
}
