import Link from "next/link";
import { FilterChip } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatsOfNiche } from "@/lib/formats";

/** Canais e formatos do nicho do canal escolhido (Shorts e longos), para as telas "minha história", "minha ideia" e "formato à mão". */
export async function channelFormatChoices(canal: string | undefined) {
  const channels = await prisma.myChannel.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, nicheId: true } });
  const channel = channels.find((c) => c.id === canal) ?? channels[0] ?? null;
  const formats = channel?.nicheId ? await formatsOfNiche(channel.nicheId) : [];
  return { channels, channel, formats };
}

type Choices = Awaited<ReturnType<typeof channelFormatChoices>>;

/** Chips de canal (trocam a página) + select do formato (vai no formulário). */
export function ChannelFormatPicker({ choices, path, formato, withFormat = true }: { choices: Choices; path: string; formato?: string; withFormat?: boolean }) {
  const { channels, channel, formats } = choices;
  if (!channel)
    return (
      <p className="text-sm text-amber-300">
        Cadastre seu canal primeiro em <Link href="/meus-canais" className="underline">Meus canais</Link>.
      </p>
    );
  const group = (len: string) => formats.filter((f) => f.length === len);
  return (
    <div className="space-y-3">
      <input type="hidden" name="canal" value={channel.id} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 text-sm text-zinc-500">Canal</span>
        {channels.map((c) => (
          <FilterChip key={c.id} href={`${path}?canal=${c.id}`} active={c.id === channel.id}>
            {c.name}
          </FilterChip>
        ))}
      </div>
      {withFormat && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="formato" className="w-20 text-sm text-zinc-500">
            Formato
          </label>
          {formats.length ? (
            <select id="formato" name="formato" required className="input w-full sm:w-auto sm:min-w-80" defaultValue={formats.find((f) => f.id === formato)?.id ?? ""}>
              <option value="" disabled>
                Escolha o formato
              </option>
              {[
                ["short", "Shorts"],
                ["long", "Vídeos longos"],
              ].map(([len, label]) =>
                group(len).length ? (
                  <optgroup key={len} label={label}>
                    {group(len).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                        {f._count.videos === 0 ? " (sem referência)" : f.recipes.length ? "" : " (sem receita)"}
                      </option>
                    ))}
                  </optgroup>
                ) : null,
              )}
            </select>
          ) : (
            <span className="text-sm text-amber-300">
              Nenhum formato no nicho deste canal. <Link href={`/formatos/novo?canal=${channel.id}`} className="underline">Criar formato à mão</Link>.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
