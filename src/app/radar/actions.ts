"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function toggleFavorite(videoId: string) {
  const fav = await prisma.favorite.findUnique({ where: { videoId } });
  if (fav) await prisma.favorite.delete({ where: { videoId } });
  else await prisma.favorite.create({ data: { videoId } });
  revalidatePath("/radar");
  revalidatePath("/favoritos");
}
