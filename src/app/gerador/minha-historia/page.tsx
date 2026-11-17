import Link from "next/link";
import { PageHeader, one, type SP } from "@/components/ui";
import { StateForm } from "@/components/StateForm";
import { ChannelFormatPicker, channelFormatChoices } from "@/components/ChannelFormatPicker";
import { GENERAL_RULES } from "@/lib/own-story";
import { createStoryAction } from "../actions";

export default async function OwnStoryPage({ searchParams }: PageProps<"/gerador/minha-historia">) {
  const sp: SP = await searchParams;
  const choices = await channelFormatChoices(one(sp.canal));
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/gerador" className="text-xs text-zinc-500 hover:text-zinc-300">
        ← Gerador
      </Link>
      <PageHeader
        title="Roteiro a partir da minha história"
        subtitle="Cole a sua história (o .md inteiro) ou suba o arquivo. O roteiro mantém a história e ajusta abertura, ganchos e final."
      />

      <section className="grid gap-3 md:grid-cols-2">
        <div className="card space-y-1.5 p-4 text-sm">
          <div className="text-xs text-zinc-500">O que fica igual</div>
          <ul className="list-disc space-y-1 pl-4 text-zinc-300">
            <li>A história, os personagens e o final que você escreveu.</li>
            <li>Tudo da lista <b>Preservar</b> e as falas em negrito entre aspas, palavra por palavra.</li>
            <li>As notas de tom e os limites (o que não fazer).</li>
          </ul>
        </div>
        <div className="card space-y-1.5 p-4 text-sm">
          <div className="text-xs text-zinc-500">O que o gerador pode ajustar (regras gerais)</div>
          <ul className="list-disc space-y-1 pl-4 text-zinc-300">
            {GENERAL_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card p-5">
        <StateForm action={createStoryAction} label="Escrever o roteiro" busy="Começando…" hint="Opus · cerca de US$ 0,25 · em segundo plano (até 3 min) · depois você vê o que mudou">
          <ChannelFormatPicker choices={choices} path="/gerador/minha-historia" formato={one(sp.formato)} />
          <div>
            <label htmlFor="historia" className="label">
              Sua história
            </label>
            <textarea
              id="historia"
              name="historia"
              rows={12}
              className="input font-mono text-xs"
              placeholder={"# Episódio 1 — O Dia em que a Vó Precisou de Mim\n\n## Storytelling e falas de referência\n…\n\n- **Preservar:** pote de sorvete com feijão; …"}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
              <label htmlFor="arquivo">…ou suba o arquivo .md:</label>
              <input id="arquivo" name="arquivo" type="file" accept=".md,.txt,text/markdown,text/plain" className="text-xs" />
            </div>
          </div>
          <div>
            <label htmlFor="titulo" className="label">
              Título (opcional)
            </label>
            <input id="titulo" name="titulo" className="input" placeholder="Se ficar vazio, uso o título do .md" />
          </div>
          <fieldset>
            <legend className="label">As falas da história</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm hover:border-zinc-500">
                <input type="radio" name="falas" value="manter" defaultChecked className="mt-1" />
                <span>
                  <span className="font-medium text-zinc-100">Manter as falas como estão</span>
                  <span className="block text-xs text-zinc-400">Só corta e reordena. No máximo 2 falas curtas novas, para abrir ou ligar.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm hover:border-zinc-500">
                <input type="radio" name="falas" value="reescrever" className="mt-1" />
                <span>
                  <span className="font-medium text-zinc-100">Pode reescrever as falas</span>
                  <span className="block text-xs text-zinc-400">Menos as do Preservar e as marcadas, que ficam literais.</span>
                </span>
              </label>
            </div>
          </fieldset>
        </StateForm>
      </section>
      <p className="text-xs text-zinc-500">
        Depois do roteiro, a tela da ideia mostra lado a lado o roteiro e o que mudou da sua história. Daí segue o caminho de sempre: você lê, corrige e aprova; a
        direção vem só depois.
      </p>
    </div>
  );
}
