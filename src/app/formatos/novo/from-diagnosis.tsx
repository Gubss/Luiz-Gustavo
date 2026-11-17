"use client";
import { useActionState } from "react";
import { StateForm } from "@/components/StateForm";
import { createManualFormatAction, draftFormatFromDiagnosisAction, type DraftState } from "../actions";

export type ReportChoice = { id: string; label: string };

/** Passo 1: escolher o diagnóstico e pedir o rascunho (IA). Passo 2: revisar e salvar (sem IA). */
export function FromDiagnosis({ channelId, reports, selected, costHint }: { channelId: string; reports: ReportChoice[]; selected: string; costHint: string }) {
  const [draft, ask, pending] = useActionState<DraftState, FormData>(draftFormatFromDiagnosisAction, null);
  return (
    <div className="space-y-5">
      <form action={ask} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label htmlFor="reportId" className="label">
              Diagnóstico
            </label>
            <select id="reportId" name="reportId" defaultValue={selected} className="input">
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
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
          <label htmlFor="orientacao" className="label">
            Orientação (opcional)
          </label>
          <input id="orientacao" name="orientacao" className="input" placeholder="Ex.: formato autoral de família, o menino narra" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={pending}>
            {pending ? "Rascunhando… (até 1 min)" : draft?.regras ? "Rascunhar de novo" : "Rascunhar o formato"}
          </button>
          <span className="text-xs text-zinc-500">{costHint}</span>
        </div>
        {draft?.error && <p className="text-sm text-red-300">{draft.error}</p>}
      </form>

      {draft?.regras && (
        <section className="space-y-3 rounded-lg border border-emerald-800/60 bg-emerald-950/10 p-4">
          <p className="text-xs text-emerald-300">Rascunho pronto (custou {draft.custo}). Revise, mude o que quiser e salve.</p>
          <StateForm action={createManualFormatAction} label="Salvar formato" busy="Salvando…" hint="Sem IA · US$ 0 · a direção padrão do canal já vem escolhida">
            <input type="hidden" name="canal" value={channelId} />
            <input type="hidden" name="reportId" value={draft.reportId} />
            <input type="hidden" name="tipo" value={draft.tipo} />
            <div>
              <label htmlFor="nome" className="label">
                Nome
              </label>
              <input id="nome" name="nome" required className="input" defaultValue={draft.nome} key={`n${draft.regras.length}`} />
            </div>
            <div>
              <label htmlFor="regras" className="label">
                Gancho, estrutura, ritmo, final
              </label>
              <textarea id="regras" name="regras" required rows={14} className="input" defaultValue={draft.regras} key={`r${draft.regras.length}`} />
            </div>
          </StateForm>
        </section>
      )}
    </div>
  );
}
