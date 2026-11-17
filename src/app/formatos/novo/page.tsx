import Link from "next/link";
import { FilterChip, PageHeader, one, type SP } from "@/components/ui";
import { StateForm } from "@/components/StateForm";
import { ChannelFormatPicker, channelFormatChoices } from "@/components/ChannelFormatPicker";
import { createManualFormatAction } from "../actions";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { estimateFormatDraft } from "@/lib/format-from-diagnosis";
import { estimateHint } from "@/app/meus-videos/ui";
import { FromDiagnosis } from "./from-diagnosis";

export default async function ManualFormatPage({ searchParams }: PageProps<"/formatos/novo">) {
  const sp: SP = await searchParams;
  const choices = await channelFormatChoices(one(sp.canal));
  const diag = one(sp.modo) === "diagnostico";
  const canalQ = choices.channel ? `canal=${choices.channel.id}` : "";
  const modes = (
    <div className="flex flex-wrap gap-2">
      <FilterChip href={`/formatos/novo${canalQ ? `?${canalQ}` : ""}`} active={!diag}>
        Criar formato à mão
      </FilterChip>
      <FilterChip href={`/formatos/novo?modo=diagnostico${canalQ ? `&${canalQ}` : ""}`} active={diag}>
        Formato a partir do diagnóstico do canal
      </FilterChip>
      <Link href="/formatos" className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300" title="Formato com vídeos de referência: escolha os estudos em Formatos do nicho.">
        A partir de vídeos estudados →
      </Link>
    </div>
  );
  if (diag) {
    const reports = choices.channel
      ? await prisma.myChannelReport.findMany({ where: { myChannelId: choices.channel.id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, createdAt: true, trigger: true, videoCount: true } })
      : [];
    const selected = reports.find((r) => r.id === one(sp.d))?.id ?? reports[0]?.id ?? "";
    const est = selected ? await estimateFormatDraft(selected) : null;
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <Link href="/formatos" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Formatos do nicho
        </Link>
        <PageHeader
          title="Formato a partir do diagnóstico do canal"
          subtitle="Escolha um diagnóstico (o mais recente já vem marcado; a sua versão editada vale como está). A IA rascunha gancho, estrutura, ritmo e final; você revisa e salva."
        />
        {modes}
        <section className="card space-y-4 p-5">
          <ChannelFormatPicker choices={choices} path="/formatos/novo?modo=diagnostico" withFormat={false} />
          {choices.channel && reports.length ? (
            <FromDiagnosis
              channelId={choices.channel.id}
              selected={selected}
              costHint={est ? `${estimateHint(est)} · em ~1 min` : ""}
              reports={reports.map((r, i) => ({
                id: r.id,
                label: `${fmtDateTime(r.createdAt)}${r.trigger === "editado" ? " · editado por você" : ""} · ${r.videoCount} vídeos${i === 0 ? " · mais recente" : ""}`,
              }))}
            />
          ) : choices.channel ? (
            <p className="text-sm text-amber-300">
              Este canal ainda não tem diagnóstico.{" "}
              <Link href={`/meus-canais/${choices.channel.id}/diagnostico`} className="underline">
                Fazer o diagnóstico do canal
              </Link>
              .
            </p>
          ) : null}
        </section>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/formatos" className="text-xs text-zinc-500 hover:text-zinc-300">
        ← Formatos do nicho
      </Link>
      <PageHeader
        title="Criar formato à mão"
        subtitle="Para um jeito de contar que ainda não tem vídeo de referência. Você escreve as regras; o gerador segue elas no lugar da receita."
      />
      {modes}
      <section className="card p-5">
        <StateForm action={createManualFormatAction} label="Criar formato" busy="Criando…" hint="Sem IA · US$ 0 · o formato aparece com o selo “sem referência”">
          <ChannelFormatPicker choices={choices} path="/formatos/novo" withFormat={false} />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <label htmlFor="nome" className="label">
                Nome
              </label>
              <input id="nome" name="nome" required className="input" placeholder="Ex.: Família (autoral)" />
            </div>
            <fieldset>
              <legend className="label">Tipo</legend>
              <div className="flex gap-3 pt-2 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="tipo" value="short" defaultChecked /> Short
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="tipo" value="long" /> Vídeo longo
                </label>
              </div>
            </fieldset>
          </div>
          <div>
            <label htmlFor="regras" className="label">
              Como é o formato (3 a 6 linhas: gancho, estrutura, duração, quem fala, tom)
            </label>
            <textarea
              id="regras"
              name="regras"
              required
              rows={7}
              className="input"
              placeholder={"Gancho: abre no meio da confusão, com o menino narrando.\nEstrutura: o menino tenta resolver algo sozinho, piora, a família reage…\nDuração: 1 a 3 min.\nQuem fala: o menino narra; avó, mãe e pai têm falas curtas.\nTom: humor de família, emoção de vez em quando, sem lição de professor."}
            />
          </div>
          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-sm text-zinc-300">Roteiro de exemplo (opcional): vira amostra da voz do canal neste formato</summary>
            <div className="mt-3 space-y-2">
              <input name="exemploTitulo" className="input" placeholder="Título do exemplo" aria-label="Título do exemplo" />
              <textarea name="exemplo" rows={6} className="input" placeholder="Cole um roteiro seu neste formato" aria-label="Roteiro de exemplo" />
            </div>
          </details>
          <p className="text-xs text-amber-300">Sem vídeo de referência, a primeira peça é teste. Quando houver vídeo parecido, dá para estudar e o formato ganha receita como os outros.</p>
        </StateForm>
      </section>
    </div>
  );
}
