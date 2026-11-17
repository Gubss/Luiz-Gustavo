import Link from "next/link";
import { PageHeader, one, type SP } from "@/components/ui";
import { StateForm } from "@/components/StateForm";
import { ChannelFormatPicker, channelFormatChoices } from "@/components/ChannelFormatPicker";
import { IDEAS_MAX } from "@/lib/own-story";
import { createOwnIdeasAction } from "@/app/gerador/actions";

export default async function OwnIdeasPage({ searchParams }: PageProps<"/ideias/nova">) {
  const sp: SP = await searchParams;
  const choices = await channelFormatChoices(one(sp.canal));
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href={choices.channel ? `/ideias?canal=${choices.channel.id}` : "/ideias"} className="text-xs text-zinc-500 hover:text-zinc-300">
        ← Banco de ideias
      </Link>
      <PageHeader title="Minha ideia" subtitle="Escreva as suas ideias. Cada uma entra no banco do jeito que você escreveu, sem IA e sem custo." />
      <section className="card p-5">
        <StateForm action={createOwnIdeasAction} label="Guardar as ideias" busy="Guardando…" hint="Sem IA · US$ 0 · o roteiro você pede depois, em cada ideia">
          <ChannelFormatPicker choices={choices} path="/ideias/nova" formato={one(sp.formato)} />
          <div>
            <label htmlFor="ideias" className="label">
              Ideias (uma por linha, ou cole o banco de ideias inteiro)
            </label>
            <textarea
              id="ideias"
              name="ideias"
              rows={10}
              className="input"
              placeholder={"Ar-condicionado caseiro: o menino tenta construir um para a avó\nPor que a Lua me segue?\nDinheiro nasce em árvore?"}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
              <label htmlFor="arquivo">…ou suba o arquivo .md:</label>
              <input id="arquivo" name="arquivo" type="file" accept=".md,.txt,text/markdown,text/plain" className="text-xs" />
            </div>
          </div>
          <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-400">
            <li>
              Banco com seções <code>## 1. Título</code>: cada seção vira uma ideia, com o texto inteiro da seção (inclusive os cuidados). Quadros e
              princípios no fim ficam de fora.
            </li>
            <li>Sem seções: cada linha vira uma ideia. Até {IDEAS_MAX} de uma vez.</li>
            <li>No “Escrever roteiro”, o seu texto vai como premissa obrigatória, junto com as regras gerais (abertura, ganchos, final em loop).</li>
          </ul>
        </StateForm>
      </section>
    </div>
  );
}
