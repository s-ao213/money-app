import { type NextRequest } from "next/server";
import { jsonError, jsonOk, requireApiUser, requiredString } from "../../../_utils/supabase";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const name = requiredString(body?.name);
  if (!name) return jsonError("カテゴリ名を入力してください。", 422);

  const { data, error } = await auth.supabase
    .from("personal_categories")
    .update({ name })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("id, user_id, pair_id, type, name")
    .maybeSingle();

  if (error) return jsonError(error.code === "23505" ? "同じカテゴリがすでに登録されています。" : error.message, 400);
  if (!data) return jsonError("更新できるカテゴリが見つかりません。", 404);
  return jsonOk(data);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { data: category, error: categoryError } = await auth.supabase
    .from("personal_categories")
    .select("id, type, name")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (categoryError) return jsonError(categoryError.message, 400);
  if (!category) return jsonError("削除できるカテゴリが見つかりません。", 404);

  const { data: used, error: usedError } = await auth.supabase
    .from("personal_entries")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("type", category.type)
    .eq("category", category.name)
    .limit(1);

  if (usedError) return jsonError(usedError.message, 400);
  if (used?.length) return jsonError("このカテゴリは収支データで使用中です。先に収支のカテゴリを変更してください。", 409);

  const { data, error } = await auth.supabase
    .from("personal_categories")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("id")
    .maybeSingle();

  if (error) return jsonError(error.message, 400);
  return jsonOk(data);
}
