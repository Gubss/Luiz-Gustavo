import Link from "next/link";
import { FilterChip, PageHeader, one, type SP } from "@/components/ui";
import { StateForm } from "@/components/StateForm";
import { DIRECTION_BOXES, DIRECTION_ORIGINS, directionsList } from "@/lib/directions";
import { INSTRUCTION_MAX } from "@/lib/direction-instructions";
import { fmtDateTime } from "@/lib/format";
import { createDirectionAction } from "./actions";

export default async function DirectionsPage({ searchParams }: PageProps<"/direcoes">) {
  const sp: SP = await searchParams;
  const list = await directionsList();
  const modo = one(sp.modo) === "copia" ? "copia" : one(sp.modo) === "estudo" ? "estudo" : "manual";
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Direções"
        subtitle="Conjuntos com nome de geral, cena, fotografia e som. Cada formato escolhe uma; o canal tem uma padrão que já vem marcada nos formatos novos."
      />

      <section className="card p-0">
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/direcoes/${d.id}`} className="font-medium hover:text-red-300">
                    {d.name}
                  </Link>
                  {d.defaultChannels.map((c) => (
                    <span key={c.id} className="ml-2 rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-xs text-emerald-300">
                      padrão de {c.name}
                    </span>
                  ))}
                  {d.description && <p className="line-clamp-1 text-sm text-zinc-400">{d.description}</p>}
                </div>
                <span className="text-xs text-zinc-500">
                  {d._count.formats} {d._count.formats === 1 ? "formato" : "formatos"} · {DIRECTION_ORIGINS[d.origin] ?? d.origin} · {fmtDateTime(d.updatedAt)}
                </span>
                <Link href={`/direcoes/${d.id}`} className="btn-secondary btn-sm">
                  Abrir
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-zinc-400">Nenhuma direção ainda. Crie a primeira abaixo.</p>
        )}
      </section>

      <section className="card space-y-4 p-5" id="nova">
        <h2 className="text-lg font-semibold">Nova direção</h2>
        <div className="flex flex-wrap gap-2">
          <FilterChip href="/direcoes?modo=manual#nova" active={modo === "manual"}>
            À mão
          </FilterChip>
          <FilterChip href="/direcoes?modo=copia#nova" active={modo === "copia"}>
            Copiando outra
          </FilterChip>
          <FilterChip href="/direcoes?modo=estudo#nova" active={modo === "estudo"}>
            A partir de um estudo
          </FilterChip>
        </div>
        <StateForm action={createDirectionAction} label="Criar direção" busy="Criando…" hint="Sem IA · US$ 0">
          <input type="hidden" name="modo" value={modo} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="nome" className="label">
                Nome
              </label>
              <input id="nome" name="nome" required maxLength={80} className="input" placeholder="Ex.: Cinematográfica, Família 3D" />
            </div>
            <div>
              <label htmlFor="descricao" className="label">
                Para que serve (opcional)
              </label>
              <input id="descricao" name="descricao" className="input" placeholder="Ex.: luz quente, câmera na altura da criança" />
            </div>
          </div>
          {modo === "copia" && (
            <div>
              <label htmlFor="de" className="label">
                Copiar de
              </label>
              <select id="de" name="de" className="input" defaultValue={one(sp.de) ?? list[0]?.id}>
                {list.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-zinc-500">Copia as 4 caixas e o estudo. Depois você muda o que quiser sem mexer na original.</p>
            </div>
          )}
          {modo === "estudo" && (
            <div className="space-y-2">
              <label htmlFor="estudo" className="label">
                Estudo de direção (o texto que voltou do “Pedir estudo de direção”)
              </label>
              <textarea id="estudo" name="estudo" rows={10} maxLength={30000} className="input font-mono text-xs" />
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                <label htmlFor="arquivo">…ou suba o .md:</label>
                <input id="arquivo" name="arquivo" type="file" accept=".md,.txt" className="text-xs" />
              </div>
              <p className="text-xs text-zinc-500">
                O estudo inteiro vai para a Geral (todo diretor recebe) e fica guardado para consulta. Para pedir um estudo novo, abra uma direção e use “Pedir estudo de direção”.
              </p>
            </div>
          )}
          {modo === "manual" &&
            DIRECTION_BOXES.map(([key, label]) => (
              <div key={key}>
                <label htmlFor={key} className="label">
                  {label}
                </label>
                <textarea id={key} name={key} rows={key === "directionGeneral" ? 5 : 4} maxLength={INSTRUCTION_MAX} className="input" />
              </div>
            ))}
        </StateForm>
      </section>
    </div>
  );
}
