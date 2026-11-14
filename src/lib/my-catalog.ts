/**
 * Vídeos que o MEU canal já publicou. O gerador usa essa lista para não sugerir um tema que o canal
 * já fez, mesmo que o vídeo antigo seja de outro estilo (ex.: 2D). Replicar um tema que deu certo em
 * OUTRO canal pode; repetir o que o próprio canal já contou, não.
 */
import { prisma } from "./db";
import { getSettings } from "./settings";
import { tokenize } from "./catalog";
import { classifyByDuration } from "./metrics";
import { checkIsShortByUrl, fetchVideosBatch, parseDuration, resolveChannel, uploadsPage } from "./youtube";

export class MyCatalogError extends Error {}

/** Unidades de cota para ler o canal: 1 para achar o canal + 2 a cada 50 vídeos (lista + detalhes). */
export function estimateCatalogUnits(videoCount: number | null) {
  return 1 + 2 * Math.max(1, Math.ceil((videoCount ?? 50) / 50));
}

/** Lê (ou relê) todos os uploads do meu canal. Precisa da URL do canal no perfil. */
export async function syncMyChannelVideos(myChannelId: string, report?: (pct: number, step: string) => Promise<void>) {
  const s = await getSettings();
  const mc = await prisma.myChannel.findUniqueOrThrow({ where: { id: myChannelId } });
  const raw = mc.externalId || mc.url;
  if (!raw) throw new MyCatalogError("Coloque a URL do seu canal no perfil (ex.: https://www.youtube.com/@seucanal) e salve.");
  const yt = await resolveChannel(raw);
  let units = 1;
  if (mc.externalId !== yt.id) await prisma.myChannel.update({ where: { id: myChannelId }, data: { externalId: yt.id } });
  const playlist = yt.contentDetails?.relatedPlaylists?.uploads;
  if (!playlist) throw new MyCatalogError("Não achei a lista de vídeos desse canal.");
  const total = Number(yt.statistics?.videoCount ?? 0) || null;

  const items: { id: string; title: string; publishedAt: string }[] = [];
  let token: string | undefined;
  do {
    await report?.(total ? Math.min(60, (items.length / total) * 60) : 10, `Lendo a lista de vídeos (${items.length}${total ? ` de ${total}` : ""})`);
    const page = await uploadsPage(playlist, token);
    units += 1;
    for (const it of page.items ?? [])
      items.push({ id: it.contentDetails.videoId, title: it.snippet.title, publishedAt: it.contentDetails.videoPublishedAt ?? it.snippet.publishedAt });
    token = page.nextPageToken;
  } while (token && items.length < 2000);

  await report?.(65, "Lendo duração e views");
  const details = new Map((await fetchVideosBatch(items.map((x) => x.id))).map((v) => [v.id, v]));
  units += Math.ceil(items.length / 50);

  let checks = 0;
  for (const [i, it] of items.entries()) {
    if (i % 25 === 0) await report?.(70 + (i / Math.max(1, items.length)) * 28, `Gravando (${i} de ${items.length})`);
    const v = details.get(it.id);
    const durationSec = parseDuration(v?.contentDetails?.duration);
    const c = classifyByDuration(durationSec, s.shortMaxSec);
    let isShort: boolean | null = c === "short" ? true : c === "long" ? false : null;
    if (c === "check" && checks < 150) {
      checks++;
      isShort = (await checkIsShortByUrl(it.id)) ?? null;
    }
    const data = {
      title: v?.snippet.title ?? it.title,
      publishedAt: new Date(v?.snippet.publishedAt ?? it.publishedAt),
      durationSec,
      isShort,
      viewCount: v?.statistics?.viewCount != null ? Number(v.statistics.viewCount) : null,
    };
    await prisma.myChannelVideo.upsert({
      where: { myChannelId_externalId: { myChannelId, externalId: it.id } },
      create: { myChannelId, externalId: it.id, ...data },
      update: data,
    });
  }
  await prisma.myChannel.update({ where: { id: myChannelId }, data: { catalogFetchedAt: new Date() } });
  return { videos: items.length, units, channelTitle: yt.snippet.title };
}

// ---------- "Você já fez esse tema?" ----------

export type OwnItem = { title: string; source: "vídeo publicado" | "roteiro cadastrado" | "ideia no banco"; url?: string; text?: string };
export type OwnMatch = OwnItem & { shared: string[]; score: number };

/** Tudo o que o canal já fez ou já tem guardado (para o prompt e para a checagem). */
export async function ownItems(myChannelId: string, opts: { excludeIdeaIds?: string[] } = {}): Promise<OwnItem[]> {
  const [videos, scripts, ideas] = await Promise.all([
    prisma.myChannelVideo.findMany({ where: { myChannelId }, orderBy: { publishedAt: "desc" }, select: { title: true, externalId: true } }),
    prisma.myChannelScript.findMany({ where: { myChannelId }, select: { title: true, script: true } }),
    prisma.idea.findMany({
      where: { myChannelId, status: { not: "DISCARDED" }, id: { notIn: opts.excludeIdeaIds ?? [] } },
      select: { id: true, theme: true, chosenTitle: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  return [
    ...videos.map((v) => ({ title: v.title, source: "vídeo publicado" as const, url: `https://www.youtube.com/watch?v=${v.externalId}` })),
    ...scripts.map((s) => ({ title: s.title, source: "roteiro cadastrado" as const, text: s.script.slice(0, 400) })),
    ...ideas.map((i) => ({ title: i.chosenTitle ? `${i.chosenTitle} (${i.theme})` : i.theme, source: "ideia no banco" as const, url: `/ideias/${i.id}` })),
  ];
}

/**
 * Procura itens do próprio canal parecidos com a ideia (por palavras; palavras raras pesam mais).
 * Ex.: "Por que a tampa da caneta tem um furo?" × vídeo antigo "O furo da tampa da caneta" → parecido.
 */
export function findOwnRepeats(query: string, items: OwnItem[], limit = 3, ignore: Set<string> = new Set()): OwnMatch[] {
  const q = [...new Set(tokenize(query))].filter((w) => !ignore.has(w));
  if (!q.length || !items.length) return [];
  const docs = items.map((it) => ({ it, t: new Set(tokenize(`${it.title} ${it.text ?? ""}`)) }));
  const N = docs.length;
  const df = new Map<string, number>();
  for (const d of docs) for (const w of d.t) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log((N + 1) / ((df.get(w) ?? 0) + 1)) + 1;
  const weight = (ws: Iterable<string>) => [...ws].reduce((s, w) => s + idf(w), 0);
  const qW = weight(q);
  const out: OwnMatch[] = [];
  for (const { it, t: all } of docs) {
    const t = new Set([...all].filter((w) => !ignore.has(w)));
    const shared = q.filter((w) => t.has(w));
    if (shared.length < 2) continue; // uma palavra só em comum ("dinossauro") não é o mesmo tema
    // Quanto o trecho em comum cobre do texto MAIS CURTO (título curto × ideia longa ainda casa).
    const score = weight(shared) / Math.min(qW, weight(t));
    if (score >= 0.35) out.push({ ...it, text: undefined, shared, score: Math.round(score * 100) / 100 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Nome do canal e dos personagens não contam como "tema em comum" (todo vídeo tem o Theo). */
export async function channelStopwords(myChannelId: string) {
  const c = await prisma.myChannel.findUnique({ where: { id: myChannelId }, select: { name: true, characters: true } });
  const names = (c?.characters ?? "")
    .split(/\n/)
    .map((l) => l.trim().split(/[\s(:,\-–]/)[0])
    .filter(Boolean);
  return new Set(tokenize(`${c?.name ?? ""} ${names.join(" ")}`));
}

/** "Já feito?" de várias ideias de uma vez (grátis, para as listas). A própria ideia não conta. */
export async function repeatsForIdeas(
  ideas: { id: string; myChannelId: string | null; theme: string; titles: string; chosenTitle: string | null; publishedVideo?: { externalId: string } | null }[],
) {
  const byChannel = new Map<string, OwnItem[]>();
  const stops = new Map<string, Set<string>>();
  const out = new Map<string, OwnMatch[]>();
  for (const i of ideas) {
    if (!i.myChannelId) continue;
    if (!byChannel.has(i.myChannelId)) {
      byChannel.set(i.myChannelId, await ownItems(i.myChannelId));
      stops.set(i.myChannelId, await channelStopwords(i.myChannelId));
    }
    let titles: string[] = [];
    try {
      titles = JSON.parse(i.titles);
    } catch {}
    // A própria ideia e o vídeo em que ela virou não contam como "já feito".
    const own = i.publishedVideo ? `https://www.youtube.com/watch?v=${i.publishedVideo.externalId}` : null;
    const items = byChannel.get(i.myChannelId)!.filter((x) => x.url !== `/ideias/${i.id}` && x.url !== own);
    out.set(i.id, findOwnRepeats(`${i.theme} ${i.chosenTitle ?? ""} ${titles.join(" ")}`, items, 3, stops.get(i.myChannelId)));
  }
  return out;
}

/** Vídeos publicados do canal mais parecidos com a ideia (para sugerir "virou este vídeo?"). */
export async function publishedCandidates(idea: { myChannelId: string | null; theme: string; chosenTitle: string | null; titles: string }) {
  if (!idea.myChannelId) return null;
  const videos = await prisma.myChannelVideo.findMany({ where: { myChannelId: idea.myChannelId }, orderBy: { publishedAt: "desc" } });
  let titles: string[] = [];
  try {
    titles = JSON.parse(idea.titles);
  } catch {}
  const stops = await channelStopwords(idea.myChannelId);
  const matches = findOwnRepeats(
    `${idea.theme} ${idea.chosenTitle ?? ""} ${titles.join(" ")}`,
    videos.map((v) => ({ title: v.title, source: "vídeo publicado" as const, url: v.id })),
    3,
    stops,
  );
  const byId = new Map(videos.map((v) => [v.id, v]));
  return { suggested: matches.map((m) => byId.get(m.url!)!).filter(Boolean), recent: videos.slice(0, 60) };
}
