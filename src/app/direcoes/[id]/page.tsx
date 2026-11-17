import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { StateForm } from "@/components/StateForm";
import { ActionButton } from "@/app/video/[id]/forms";
import { prisma } from "@/lib/db";
import { DIRECTION_BOXES, DIRECTION_ORIGINS } from "@/lib/directions";
import { INSTRUCTION_MAX } from "@/lib/direction-instructions";
import { fmtDateTime } from "@/lib/format";
import { deleteDirectionAction, requestDirectionStudyAction, setChannelDefaultAction, updateDirectionAction } from "../actions";

export default async function DirectionPage({ params }: PageProps<"/direcoes/[id]">) {
  const { id } = await params;
  const d = await prisma.direction.findUnique({
    where: { id },
    include: { formats: { select: { id: true, name: true, length: true }, orderBy: { name: "asc" } }, defaultChannels: { select: { id: true, name: true } } },
  });
  if (!d) notFound();
  const [channels, copiedFrom] = await Promise.all([
    prisma.myChannel.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, defaultDirectionId: true } }),
    d.copiedFromId ? prisma.direction.findUnique({ where: { id: d.copiedFromId }, select: { id: true, name: true } }) : null,
  ]);
  const others = channels.filter((c) => c.defaultDirectionId !== d.id);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/direcoes" className="text-xs text-zinc-500 hover:text-zinc-300">
        ← Direções
      </Link>
      <PageHeader title={d.name} subtitle={d.description ?? "Geral, cena, fotografia e som. Cada diretor recebe a Geral e somente a caixa da sua função."} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        {d.defaultChannels.map((c) => (
          <span key={c.id} className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-emerald-300">
            padrão de {c.name}
          </span>
        ))}
        <span>{DIRECTION_ORIGINS[d.origin] ?? d.origin}</span>
        {copiedFrom && (
          <span>
            · copiada de{" "}
            <Link href={`/direcoes/${copiedFrom.id}`} className="underline">
              {copiedFrom.name}
            </Link>
          </span>
        )}
        <span>· atualizada {fmtDateTime(d.updatedAt)}</span>
        <Link href={`/direcoes?modo=copia&de=${d.id}#nova`} className="btn-ghost px-2 py-0.5 text-xs">
          Copiar esta direção
        </Link>
      </div>

      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Formatos que usam ({d.formats.length})</h2>
        {d.formats.length ? (
          <ul className="flex flex-wrap gap-2 text-sm">
            {d.formats.map((f) => (
              <li key={f.id}>
                <Link href={`/formatos/${f.id}#direction-title`} className="rounded-lg border border-line px-2 py-1 hover:border-red-800">
                  {f.name} <span className="text-xs text-zinc-500">· {f.length === "long" ? "longo" : "Short"}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Nenhum formato usa ainda. Escolha esta direção na página do formato.</p>
        )}
        {others.length > 0 && (
          <StateForm action={setChannelDefaultAction.bind(null, d.id)} label="Tornar padrão do canal" className="btn-secondary" formClassName="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="canal" className="label">
                Direção padrão de
              </label>
              <select id="canal" name="canal" className="input">
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </StateForm>
        )}
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">Instruções</h2>
        <StateForm action={updateDirectionAction.bind(null, d.id)} label="Salvar direção" hint="Sem IA · até 30.000 caracteres por caixa · direções de vídeo já começadas mantêm as instruções que usaram">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="nome" className="label">
                Nome
              </label>
              <input id="nome" name="nome" required maxLength={80} className="input" defaultValue={d.name} />
            </div>
            <div>
              <label htmlFor="descricao" className="label">
                Para que serve
              </label>
              <input id="descricao" name="descricao" className="input" defaultValue={d.description ?? ""} />
            </div>
          </div>
          {DIRECTION_BOXES.map(([key, label]) => (
            <div key={key}>
              <label htmlFor={key} className="label">
                {label}
              </label>
              <textarea id={key} name={key} rows={key === "directionGeneral" ? 8 : 6} maxLength={INSTRUCTION_MAX} className="input" defaultValue={d[key] ?? ""} />
              <p className="mt-1 text-xs text-zinc-500">{(d[key]?.length ?? 0).toLocaleString("pt-BR")} caracteres salvos</p>
            </div>
          ))}
        </StateForm>
        {d.study && (
          <details>
            <summary className="cursor-pointer text-sm text-zinc-400">Estudo de direção ({d.study.length.toLocaleString("pt-BR")} caracteres, só consulta)</summary>
            <pre className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-400">{d.study}</pre>
          </details>
        )}
        <details>
          <summary className="cursor-pointer text-sm">Pedir estudo de direção</summary>
          <StateForm action={requestDirectionStudyAction.bind(null, d.id)} label="Pedir estudo de direção" hint="O GEPETO faz o estudo fora do Radar, sem API.">
            <label className="label" htmlFor="direction-links">
              Até 5 links de vídeo, um por linha
            </label>
            <textarea id="direction-links" name="links" className="input" rows={5} required maxLength={10000} />
          </StateForm>
        </details>
      </section>

      {d.formats.length === 0 && d.defaultChannels.length === 0 && (
        <section className="flex flex-wrap items-center gap-3">
          <ActionButton action={deleteDirectionAction.bind(null, d.id)} label="Apagar direção" busy="Apagando…" className="btn-ghost text-red-300" hint="Só some porque nenhum formato usa." />
        </section>
      )}
    </div>
  );
}
