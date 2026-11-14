import Link from "next/link";
import { prisma } from "@/lib/db";
import { getRadar } from "@/lib/radar";
import { RadarCard } from "@/components/RadarCard";

export default async function FavoritesPage() {
  const count = await prisma.favorite.count();
  // Favoritos ignoram janela e limite: mostra todos, de Shorts e de longos.
  const [shorts, longs] = await Promise.all(
    (["short", "long"] as const).map((format) =>
      getRadar({ format, days: 3650, minMult: 3, sort: "mult", includeAll: true, onlyFavorites: true }),
    ),
  );
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Favoritos</h1>
        <p className="text-sm text-zinc-400">{count} vídeo{count === 1 ? "" : "s"} salvo{count === 1 ? "" : "s"} para estudo.</p>
      </header>
      {count === 0 && (
        <div className="card p-10 text-center text-zinc-400">
          Nenhum favorito ainda. Use ☆ Favoritar nos cards do <Link href="/radar" className="text-red-400 hover:underline">radar</Link>.
        </div>
      )}
      {[
        ["Shorts", shorts.items],
        ["Vídeos longos", longs.items],
      ].map(([label, items]) =>
        (items as typeof shorts.items).length ? (
          <section key={label as string} className="space-y-3">
            <h2 className="text-lg font-semibold">{label as string}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {(items as typeof shorts.items).map((it) => (
                <RadarCard key={it.video.id} item={it} />
              ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}
