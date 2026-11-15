import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { DEFAULT_SETTINGS, getSettings, secretStatus, type SecretKey } from "@/lib/settings";
import { claudeSpendSummary, GENERATION_KIND_LABEL, modelLabel, PRICING, usdToBrl } from "@/lib/claude";
import { quotaBreakdown, quotaHistory, quotaResetAt, quotaUsedToday } from "@/lib/quota";
import { lastCollection } from "@/lib/collect";
import { googleConfigured } from "@/lib/google";
import { backupDir, listBackups } from "@/lib/backup";
import { StateForm } from "@/components/StateForm";
import { ActionButton } from "@/app/video/[id]/forms";
import {
  backupNowAction,
  removeKeyAction,
  resetGroupAction,
  saveGroupAction,
  saveKeyAction,
  saveModelsAction,
  testCurrentKeyAction,
} from "./actions";

/** Custo típico por dia: coleta (~4 unidades por canal monitorado) e acompanhamento (~150 por canal meu ligado). */
const COLLECT_PER_CHANNEL = 4;
const TRACK_PER_MY_CHANNEL = 150;
const SEARCH_COST = 102;

const usd = (n: number) => `US$ ${n.toFixed(n > 0 && n < 0.1 ? 3 : 2).replace(".", ",")}`;
const brl = (n: number) => `R$ ${(n * usdToBrl()).toFixed(2).replace(".", ",")}`;
const timeBr = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const numBr = (n: number) => String(n).replace(".", ",");

function Section({ id, title, desc, children }: { id: string; title: string; desc?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-6 space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {desc && <p className="mt-0.5 text-sm text-zinc-400">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

function Bar({ pct, tone }: { pct: number; tone?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  const color = tone ?? (p > 80 ? "bg-red-500" : p > 50 ? "bg-amber-500" : "bg-emerald-500");
  return (
    <div className="h-2 overflow-hidden rounded bg-zinc-800">
      <div className={`h-full ${color}`} style={{ width: `${p}%` }} />
    </div>
  );
}

/** Barrinhas verticais simples (um valor por dia). */
function DayBars({ points, format, limit }: { points: { label: string; value: number }[]; format: (n: number) => string; limit?: number }) {
  const max = Math.max(limit ?? 0, ...points.map((p) => p.value), 1);
  return (
    <div>
      <div className="relative flex h-28 items-end gap-1">
        {limit != null && (
          <div className="absolute inset-x-0 border-t border-dashed border-zinc-600" style={{ bottom: `${(limit / max) * 100}%` }} title={`Limite: ${format(limit)}`} />
        )}
        {points.map((p, i) => (
          <div
            key={i}
            className={`min-w-0 flex-1 rounded-t ${i === points.length - 1 ? "bg-red-500" : limit != null && p.value > limit * 0.8 ? "bg-amber-500" : "bg-zinc-500"}`}
            style={{ height: `${Math.max(p.value > 0 ? 2 : 0, (p.value / max) * 100)}%` }}
            title={`${p.label}: ${format(p.value)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
        <span>{points[0]?.label}</span>
        <span>hoje</span>
      </div>
    </div>
  );
}

function NumField({ name, label, value, def, hint, step = "any" }: { name: string; label: string; value: number; def: number; hint?: string; step?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input name={name} defaultValue={numBr(value)} inputMode="decimal" step={step} className="input" />
      <span className="mt-1 block text-xs text-zinc-500">
        {hint ? `${hint} ` : ""}Padrão: {numBr(def)}.
      </span>
    </label>
  );
}

function Check({ name, label, checked, hint }: { name: string; label: string; checked: boolean; hint: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 h-4 w-4 accent-red-600" />
      <span>
        {label}
        <span className="block text-xs text-zinc-500">{hint}</span>
      </span>
    </label>
  );
}

async function KeyBox({ k, title, where, free }: { k: SecretKey; title: string; where: React.ReactNode; free: string }) {
  const st = await secretStatus(k);
  return (
    <div className="space-y-3 rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        {st.source === "none" ? (
          <span className="rounded-full bg-red-950 px-2 py-0.5 text-xs text-red-300">Falta a chave</span>
        ) : (
          <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-xs text-emerald-300">
            Em uso: <code>{st.masked}</code> · {st.source === "app" ? "salva aqui" : "do arquivo .env"}
          </span>
        )}
      </div>
      <p className="text-xs text-zinc-500">{where}</p>
      <StateForm action={saveKeyAction.bind(null, k)} label={st.source === "none" ? "Testar e salvar" : "Trocar a chave"} busy="Testando…" hint={free}>
        <input name="value" type="password" autoComplete="off" placeholder="Cole a chave aqui" className="input font-mono" />
      </StateForm>
      {st.source !== "none" && (
        <div className="flex flex-wrap gap-4">
          <ActionButton action={testCurrentKeyAction.bind(null, k)} label="Testar a chave em uso" busy="Testando…" className="btn-secondary" />
          {st.source === "app" && (
            <ActionButton
              action={removeKeyAction.bind(null, k)}
              label={st.envAlso ? "Apagar daqui (volta para a do .env)" : "Apagar a chave"}
              busy="Apagando…"
              className="btn-ghost"
            />
          )}
        </div>
      )}
    </div>
  );
}

export default async function SettingsPage() {
  const s = await getSettings();
  const [used, breakdown, history, monitored, myLinked, spend, last, googleAccounts] = await Promise.all([
    quotaUsedToday(),
    quotaBreakdown(),
    quotaHistory(14),
    prisma.channel.count({ where: { niches: { some: {} } } }),
    prisma.myChannel.count({ where: { externalId: { not: null } } }),
    claudeSpendSummary(),
    lastCollection(),
    prisma.googleAuth.findMany({ select: { channelTitle: true, status: true, lastError: true } }),
  ]);
  const backups = listBackups();
  const resetAt = quotaResetAt();
  const left = Math.max(0, s.dailyQuota - used);
  const expected = monitored * COLLECT_PER_CHANNEL + (s.tracker ? myLinked * TRACK_PER_MY_CHANNEL : 0);
  const freeForSearch = Math.max(0, s.dailyQuota - expected);
  const budgetPct = s.monthlyBudgetUsd > 0 ? (spend.usd / s.monthlyBudgetUsd) * 100 : 0;
  const pricingOptions = Object.entries(PRICING);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-zinc-400">
          Chaves, cota do YouTube, gastos com o Claude, regras do radar e o que o app faz sozinho. Tudo que você salvar aqui vale na hora, sem
          reiniciar.
        </p>
        <nav className="mt-3 flex flex-wrap gap-2 text-sm">
          {[
            ["#chaves", "Chaves"],
            ["#cota", "Cota do YouTube"],
            ["#gastos", "Gastos com o Claude"],
            ["#radar", "Regras do radar"],
            ["#automatico", "Automático"],
            ["#backup", "Cópia de segurança"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-400 hover:border-zinc-500 hover:text-white">
              {label}
            </a>
          ))}
        </nav>
      </header>

      {/* ---------- Chaves ---------- */}
      <Section
        id="chaves"
        title="Chaves"
        desc="O app testa a chave antes de salvar. A chave fica só no banco do seu computador (prisma/radar.db); a tela mostra só o começo e o fim dela. Uma chave salva aqui vale mais que a do arquivo .env."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <KeyBox
            k="youtubeApiKey"
            title="YouTube Data API v3"
            free="O teste gasta 1 unidade de cota."
            where={
              <>
                Grátis, 10.000 unidades por dia.{" "}
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="underline">
                  console.cloud.google.com → Credenciais
                </a>{" "}
                → Criar credenciais → Chave de API.
              </>
            }
          />
          <KeyBox
            k="anthropicApiKey"
            title="Anthropic (Claude)"
            free="O teste é grátis (não gera texto)."
            where={
              <>
                Paga por uso.{" "}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="underline">
                  console.anthropic.com → API Keys
                </a>{" "}
                → Create Key.
              </>
            }
          />
        </div>
        <div className="rounded-lg border border-line p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Login do Google (YouTube Analytics dos seus canais)</h3>
            {googleConfigured() ? (
              <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-xs text-emerald-300">Configurado no .env</span>
            ) : (
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">Não configurado (opcional)</span>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            O ID e a chave secreta do login ficam no arquivo .env (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET); o passo a passo está no README, seção
            “Como criar o login do Google”. Contas conectadas:{" "}
            {googleAccounts.length
              ? googleAccounts.map((g) => `${g.channelTitle}${g.status === "ok" ? " ✓" : " (precisa entrar de novo)"}`).join(", ")
              : "nenhuma"}
            . Para entrar ou sair, vá em{" "}
            <Link href="/meus-videos" className="underline">
              Meus vídeos
            </Link>
            .
          </p>
        </div>
      </Section>

      {/* ---------- Cota ---------- */}
      <Section
        id="cota"
        title="Cota do YouTube"
        desc={
          <>
            O Google dá {fmtInt(s.dailyQuota)} unidades por dia e zera à meia-noite do Pacífico, que é às <b>{timeBr(resetAt)}</b> no horário de
            Brasília (próxima: {fmtDateTime(resetAt)}).
          </>
        }
      >
        <div className="space-y-2">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span>
              Hoje: <b className="tabular-nums">{fmtInt(used)}</b> de {fmtInt(s.dailyQuota)} unidades
            </span>
            <span className="text-zinc-400">Sobram {fmtInt(left)}</span>
          </div>
          <Bar pct={(used / s.dailyQuota) * 100} />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-300">O que gastou hoje</h3>
            {breakdown.bySource.length ? (
              <table className="w-full text-sm">
                <tbody>
                  {breakdown.bySource.map((r) => (
                    <tr key={r.source ?? "outros"} className="border-t border-line">
                      <td className="py-1.5">{r.label}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmtInt(r.units)}</td>
                      <td className="w-16 py-1.5 text-right text-xs tabular-nums text-zinc-500">{used ? Math.round((r.units / used) * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-zinc-500">Nada gasto hoje ainda.</p>
            )}
            {breakdown.byEndpoint.length > 0 && (
              <p className="mt-2 text-xs text-zinc-500">
                Por tipo de chamada: {breakdown.byEndpoint.map((e) => `${e.endpoint} ${fmtInt(e.units)} (${fmtInt(e.calls)}×)`).join(" · ")}.
                {breakdown.byEndpoint.some((e) => e.endpoint === "search.list") && " Cada busca (search.list) custa 100."}
              </p>
            )}
            <p className="mt-2 text-xs text-zinc-500">Gastos anteriores a esta versão aparecem como “Outras ações”.</p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-300">Últimos 14 dias</h3>
            <DayBars points={history.map((h) => ({ label: dayLabel(h.day), value: h.units }))} format={(n) => `${fmtInt(n)} unidades`} limit={s.dailyQuota} />
          </div>
        </div>

        <div className="rounded-lg border border-line p-4 text-sm">
          <h3 className="mb-1 font-medium">Quanto o dia normal precisa</h3>
          <p className="text-zinc-400">
            Coleta diária: {fmtInt(monitored)} canais monitorados × ~{COLLECT_PER_CHANNEL} = <b>{fmtInt(monitored * COLLECT_PER_CHANNEL)}</b>
            {" · "}
            Acompanhamento dos meus vídeos: {s.tracker ? `${fmtInt(myLinked)} canal(is) × ~${TRACK_PER_MY_CHANNEL}` : "desligado"} ={" "}
            <b>{fmtInt(s.tracker ? myLinked * TRACK_PER_MY_CHANNEL : 0)}</b>
            {" · "}
            Total ≈ <b>{fmtInt(expected)}</b> por dia.
          </p>
          <p className="mt-1 text-zinc-400">
            Sobra para buscas do <i>Descobrir canais</i>: ~{fmtInt(freeForSearch)} unidades, ou cerca de{" "}
            <b>{fmtInt(Math.floor(freeForSearch / SEARCH_COST))} palavras-chave por dia</b> (~{SEARCH_COST} cada).
          </p>
          {expected > s.dailyQuota * 0.8 && (
            <p className="mt-2 text-amber-300">
              O dia normal já come mais de 80% da cota. Tire canais parados dos nichos ou peça mais cota ao Google (console.cloud.google.com → YouTube
              Data API v3 → Cotas).
            </p>
          )}
          {last && (
            <p className="mt-2 text-xs text-zinc-500">
              Última coleta: {fmtDateTime(last.startedAt)} · {last.status === "ok" ? "ok" : last.status === "running" ? "rodando" : "com erro"} ·{" "}
              {fmtInt(last.unitsUsed)} unidades.
            </p>
          )}
        </div>

        <StateForm action={saveGroupAction.bind(null, "quota")} label="Salvar" formClassName="max-w-sm space-y-3">
          <NumField
            name="dailyQuota"
            label="Cota diária (unidades)"
            value={s.dailyQuota}
            def={DEFAULT_SETTINGS.dailyQuota}
            step="1"
            hint="Só mude se o Google aumentou a sua cota."
          />
        </StateForm>
      </Section>

      {/* ---------- Gastos ---------- */}
      <Section
        id="gastos"
        title="Gastos com o Claude"
        desc="Cada botão que usa o Claude mostra o custo estimado antes de rodar; aqui fica o custo real somado. Os valores são calculados pelos tokens de cada resposta (a fatura oficial está no console da Anthropic)."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-line p-4">
            <div className="text-xs text-zinc-500">Este mês</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{usd(spend.usd)}</div>
            <div className="text-xs text-zinc-500">
              ≈ {brl(spend.usd)} · {fmtInt(spend.calls)} chamada(s)
            </div>
          </div>
          <div className="rounded-lg border border-line p-4">
            <div className="text-xs text-zinc-500">No ritmo atual, o mês fecha em</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{usd(spend.projectedUsd)}</div>
            <div className="text-xs text-zinc-500">≈ {brl(spend.projectedUsd)}</div>
          </div>
          <div className="rounded-lg border border-line p-4">
            <div className="text-xs text-zinc-500">Mês passado</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{usd(spend.prevMonthUsd)}</div>
            <div className="text-xs text-zinc-500">
              ≈ {brl(spend.prevMonthUsd)} · {fmtInt(spend.prevMonthCalls)} chamada(s)
            </div>
          </div>
        </div>

        {s.monthlyBudgetUsd > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>
                Limite do mês: {usd(spend.usd)} de {usd(s.monthlyBudgetUsd)}
              </span>
              <span className="text-zinc-400">{Math.round(budgetPct)}%</span>
            </div>
            <Bar pct={budgetPct} />
            {budgetPct >= 100 ? (
              <p className="text-sm text-red-400">Limite atingido: os botões do Claude estão bloqueados até o mês virar ou você aumentar o limite.</p>
            ) : budgetPct >= 80 ? (
              <p className="text-sm text-amber-300">Perto do limite.</p>
            ) : null}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-300">Este mês, por tipo</h3>
            {spend.byKind.length ? (
              <table className="w-full text-sm">
                <tbody>
                  {spend.byKind.map((r) => (
                    <tr key={r.kind} className="border-t border-line">
                      <td className="py-1.5">{r.label}</td>
                      <td className="py-1.5 text-right text-xs tabular-nums text-zinc-500">{fmtInt(r.calls)}×</td>
                      <td className="py-1.5 text-right tabular-nums">{usd(r.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-zinc-500">Nenhuma chamada este mês.</p>
            )}
            {spend.byModel.length > 0 && (
              <p className="mt-2 text-xs text-zinc-500">Por modelo: {spend.byModel.map((m) => `${m.label} ${usd(m.usd)}`).join(" · ")}.</p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-300">Últimos 30 dias</h3>
            <DayBars points={spend.perDay.map((d) => ({ label: dayLabel(d.day), value: d.usd }))} format={usd} />
          </div>
        </div>

        {spend.recent.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-zinc-400 hover:text-white">Últimas {spend.recent.length} chamadas</summary>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {spend.recent.map((g) => (
                  <tr key={g.id} className="border-t border-line">
                    <td className="py-1.5 text-xs text-zinc-500">{fmtDateTime(g.createdAt)}</td>
                    <td className="py-1.5">
                      {g.videoId ? (
                        <Link href={`/video/${g.videoId}`} className="hover:underline">
                          {GENERATION_KIND_LABEL[g.kind] ?? g.kind}
                        </Link>
                      ) : (
                        (GENERATION_KIND_LABEL[g.kind] ?? g.kind)
                      )}
                    </td>
                    <td className="py-1.5 text-xs text-zinc-500">{modelLabel(g.model)}</td>
                    <td className="py-1.5 text-right text-xs tabular-nums text-zinc-500">
                      {fmtInt(g.inputTokens)} → {fmtInt(g.outputTokens)} tokens
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{g.costUsd != null ? usd(g.costUsd) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <StateForm action={saveGroupAction.bind(null, "money")} label="Salvar limite e câmbio">
            <NumField
              name="monthlyBudgetUsd"
              label="Limite de gasto por mês (US$)"
              value={s.monthlyBudgetUsd}
              def={DEFAULT_SETTINGS.monthlyBudgetUsd}
              hint="0 = sem limite. Ao chegar no limite, os botões do Claude param (com aviso) até o mês virar."
            />
            <NumField
              name="dollarBrl"
              label="Dólar em reais"
              value={s.dollarBrl}
              def={DEFAULT_SETTINGS.dollarBrl}
              hint="Só para mostrar os valores em reais."
            />
          </StateForm>
          <StateForm action={saveModelsAction} label="Salvar modelos">
            <label className="block">
              <span className="label">Modelo das análises fortes</span>
              <select name="modelDeep" defaultValue={s.modelDeep} className="input">
                {pricingOptions.map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.label} · US$ {numBr(p.input)} / {numBr(p.output)} por milhão de tokens
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-zinc-500">
                Diagnósticos, cartilha, ideias, roteiros e perfil. Padrão: {modelLabel(DEFAULT_SETTINGS.modelDeep)}.
              </span>
            </label>
            <label className="block">
              <span className="label">Modelo das tarefas leves</span>
              <select name="modelFast" defaultValue={s.modelFast} className="input">
                {pricingOptions.map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.label} · US$ {numBr(p.input)} / {numBr(p.output)} por milhão de tokens
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-zinc-500">Resumo dos comentários. Padrão: {modelLabel(DEFAULT_SETTINGS.modelFast)}.</span>
            </label>
          </StateForm>
        </div>
      </Section>

      {/* ---------- Regras do radar ---------- */}
      <Section
        id="radar"
        title="Regras do radar"
        desc="Quando um vídeo vira outlier e quando um canal pequeno “estourou”. Mudou aqui, o radar recalcula na próxima vez que abrir (não gasta cota)."
      >
        <StateForm action={saveGroupAction.bind(null, "radar")} label="Salvar regras">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumField name="multiplier" label="Outlier a partir de (x)" value={s.multiplier} def={DEFAULT_SETTINGS.multiplier} hint="x a mediana do canal ou x os inscritos." />
            <NumField name="minViews" label="Views mínimas do outlier" value={s.minViews} def={DEFAULT_SETTINGS.minViews} step="1" />
            <NumField name="avgN" label="Vídeos na base do canal" value={s.avgN} def={DEFAULT_SETTINGS.avgN} step="1" hint="Últimos N do mesmo formato, com 48h+." />
            <NumField name="windowDays" label="Janela padrão (dias)" value={s.windowDays} def={DEFAULT_SETTINGS.windowDays} step="1" hint="De 1 a 30." />
            <NumField
              name="smallChannelMaxSubs"
              label="Canal pequeno: até (inscritos)"
              value={s.smallChannelMaxSubs}
              def={DEFAULT_SETTINGS.smallChannelMaxSubs}
              step="1"
            />
            <NumField
              name="smallChannelMinRatio"
              label="Canal pequeno: vídeo com (x inscritos)"
              value={s.smallChannelMinRatio}
              def={DEFAULT_SETTINGS.smallChannelMinRatio}
            />
            <NumField
              name="shortMaxSec"
              label="Conferir se é Short até (s)"
              value={s.shortMaxSec}
              def={DEFAULT_SETTINGS.shortMaxSec}
              step="1"
              hint="Até 60s é sempre Short; entre 61s e este valor, o app confere pela URL /shorts/."
            />
          </div>
        </StateForm>
        <ActionButton action={resetGroupAction.bind(null, "radar")} label="Voltar as regras ao padrão" busy="Voltando…" className="btn-ghost" />
      </Section>

      {/* ---------- Automático ---------- */}
      <Section id="automatico" title="O que o app faz sozinho" desc="Tudo isso só roda com o app aberto (npm run dev). Com o app fechado, use as tarefas do Agendador do Windows (README).">
        <StateForm action={saveGroupAction.bind(null, "auto")} label="Salvar">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <Check
                name="autoCollect"
                label="Coletar o radar ao abrir o app"
                checked={s.autoCollect}
                hint="Se a última coleta for mais velha que o número de horas ao lado. O botão “Coletar agora” do radar funciona sempre."
              />
              <Check
                name="tracker"
                label="Acompanhar meus vídeos a cada 5 minutos"
                checked={s.tracker}
                hint={`Marcos de 1h, 3h, 24h…, Analytics e diagnósticos automáticos. ~${TRACK_PER_MY_CHANNEL} unidades por canal por dia.`}
              />
              <Check
                name="autoBackup"
                label="Cópia de segurança do banco 1 vez por semana"
                checked={s.autoBackup}
                hint="Guarda as 10 mais novas na pasta backups do app."
              />
            </div>
            <div className="space-y-4">
              <NumField
                name="autoCollectHours"
                label="Coletar de novo depois de (horas)"
                value={s.autoCollectHours}
                def={DEFAULT_SETTINGS.autoCollectHours}
                step="1"
                hint="Vale também para o npm run collect agendado."
              />
              <NumField
                name="autoDiagnoseMaxPerDay"
                label="Diagnósticos automáticos por dia (no máximo)"
                value={s.autoDiagnoseMaxPerDay}
                def={DEFAULT_SETTINGS.autoDiagnoseMaxPerDay}
                step="1"
                hint="Somando todos os seus canais. Ligue o diagnóstico automático de cada canal em Meus vídeos. 0 = nenhum."
              />
            </div>
          </div>
        </StateForm>
      </Section>

      {/* ---------- Backup ---------- */}
      <Section
        id="backup"
        title="Cópia de segurança"
        desc="Tudo do app (nichos, estudos, cartilhas, roteiros, histórico de views) fica num arquivo só: prisma/radar.db. A cópia é feita com o app aberto, sem parar nada."
      >
        <ActionButton action={backupNowAction} label="Fazer uma cópia agora" busy="Copiando…" className="btn-secondary" />
        <p className="text-xs text-zinc-500">
          Para apagar a cartilha antiga e as ideias feitas antes dos formatos (com cópia antes):{" "}
          <Link href="/formatos/limpeza" className="text-red-400 hover:underline">
            Limpeza
          </Link>
        </p>
        <div className="text-sm">
          <p className="text-xs text-zinc-500">
            Pasta: <code>{backupDir()}</code>
          </p>
          {backups.length ? (
            <table className="mt-2 w-full text-sm">
              <tbody>
                {backups.map((b) => (
                  <tr key={b.name} className="border-t border-line">
                    <td className="py-1.5 font-mono text-xs">{b.name}</td>
                    <td className="py-1.5 text-xs text-zinc-500">{fmtDateTime(b.createdAt)}</td>
                    <td className="py-1.5 text-right text-xs tabular-nums text-zinc-500">{(b.bytes / 1_048_576).toFixed(1).replace(".", ",")} MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-zinc-500">Nenhuma cópia ainda.</p>
          )}
        </div>
        <details className="text-sm text-zinc-400">
          <summary className="cursor-pointer hover:text-white">Como voltar uma cópia</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              No PowerShell onde o app roda, aperte <b>Ctrl+C</b> para fechar o app.
            </li>
            <li>
              Rode (troque o nome pelo da cópia que quer voltar):
              <pre className="mt-1 overflow-x-auto rounded bg-zinc-950 p-2 text-xs text-zinc-300">
                copy prisma\radar.db prisma\radar-antes-de-voltar.db{"\n"}copy backups\radar-AAAA-MM-DD_HH-MM-SS.db prisma\radar.db
              </pre>
            </li>
            <li>
              Abra o app de novo com <code>npm run dev</code>.
            </li>
          </ol>
        </details>
      </Section>
    </div>
  );
}
