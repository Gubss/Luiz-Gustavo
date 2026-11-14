import { prisma } from "./db";
import { localDay } from "./quota";
import { channelFields, fetchChannelsBatch, resolveChannel, type YtChannel } from "./youtube";

async function saveSnapshot(channelId: string, c: ReturnType<typeof channelFields>) {
  const day = localDay();
  const data = { subscriberCount: c.subscriberCount, videoCount: c.videoCount, viewCount: c.viewCount };
  await prisma.channelSnapshot.upsert({
    where: { channelId_day: { channelId, day } },
    create: { channelId, day, ...data },
    update: { ...data, capturedAt: new Date() },
  });
}

export async function upsertChannel(yt: YtChannel) {
  const f = channelFields(yt);
  const ch = await prisma.channel.upsert({
    where: { platform_externalId: { platform: "youtube", externalId: f.externalId } },
    create: f,
    update: f,
  });
  await saveSnapshot(ch.id, f);
  return ch;
}

/** Resolve o canal colado e o vincula ao nicho. Reaproveita se já existir. */
export async function addChannelToNiche(nicheId: string, raw: string) {
  const yt = await resolveChannel(raw);
  const ch = await upsertChannel(yt);
  const existing = await prisma.nicheChannel.findUnique({
    where: { nicheId_channelId: { nicheId, channelId: ch.id } },
  });
  if (!existing) await prisma.nicheChannel.create({ data: { nicheId, channelId: ch.id } });
  return { channel: ch, alreadyInNiche: !!existing };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Atualiza dados dos canais em lote (50 por unidade de cota).
 * Sem `force`, só atualiza canais com dados de mais de 24h.
 */
export async function refreshChannels(opts: { force?: boolean; channelIds?: string[] } = {}) {
  const cutoff = new Date(Date.now() - DAY_MS);
  const channels = await prisma.channel.findMany({
    where: {
      platform: "youtube",
      ...(opts.channelIds ? { id: { in: opts.channelIds } } : {}),
      ...(opts.force ? {} : { OR: [{ statsFetchedAt: null }, { statsFetchedAt: { lt: cutoff } }] }),
    },
    select: { id: true, externalId: true },
  });
  if (channels.length === 0) return { updated: 0, units: 0 };
  const items = await fetchChannelsBatch(channels.map((c) => c.externalId));
  for (const yt of items) await upsertChannel(yt);
  return { updated: items.length, units: Math.ceil(channels.length / 50) };
}
