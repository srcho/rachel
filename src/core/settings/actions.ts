"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";
import { createServerSupabase } from "@/core/db/server";
import { updateProfileSettings } from "./profile";

export async function saveHonorificAction(formData: FormData) {
  const user = await requireUser();
  const db = await createServerSupabase();
  const honorific =
    String(formData.get("honorific") ?? "").trim() || "빈센트님";
  await updateProfileSettings(db, user.id, { honorific });
  revalidatePath("/settings");
}

export async function saveBudgetAction(formData: FormData) {
  const user = await requireUser();
  const db = await createServerSupabase();
  const raw = String(formData.get("budget") ?? "").trim();
  await updateProfileSettings(db, user.id, {
    monthlyBudgetUsd: raw ? Number(raw) : null,
  });
  revalidatePath("/settings");
}
