"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/video/actions";
import { getSettings, resetSetting, saveSetting, type SecretKey, type Settings } from "@/lib/settings";
import { PRICING, testAnthropicKey } from "@/lib/claude";
import { testYoutubeKey, YouTubeError } from "@/lib/youtube";
import { withQuotaSource } from "@/lib/quota";
import { makeBackup } from "@/lib/backup";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
/** Aceita "10.000", "10000", "0,5" e "1,5". */
function parseNum(raw: string): number | null {
  const t = raw.replace(/\s/g, "").replace(/^US\$|R\$/i, "");
  if (!t) return null;
  const n = Number(/,/.test(t) ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t);
  return Number.isFinite(n) ? n : null;
}

function refreshAll() {
  revalidatePath("/", "layout"); // a barra da esquerda (cota) e todas as telas leem as configurações
}

// ---------- Chaves ----------

async function testKey(key: SecretKey, value: string): Promise<string> {
  if (key === "youtubeApiKey") return withQuotaSource("key-test", () => testYoutubeKey(value));
  const s = await getSettings();
  return testAnthropicKey(value, s.modelDeep);
}

export async function saveKeyAction(key: SecretKey, _prev: FormState, fd: FormData): Promise<FormState> {
  const value = str(fd, "value").replace(/^["']|["']$/g, "");
  if (!value) return { error: "Cole a chave no campo antes de salvar." };
  if (/\s/.test(value)) return { error: "A chave não pode ter espaços. Copie de novo, só a chave." };
  try {
    const ok = await testKey(key, value);
    await saveSetting(key, value);
    refreshAll();
    return { ok: `Salva. ${ok} Já vale para o app todo, sem reiniciar.` };
  } catch (e) {
    // cota esgotada não quer dizer chave ruim: salva assim mesmo
    if (e instanceof YouTubeError && e.reason === "quotaExceeded") {
      await saveSetting(key, value);
      refreshAll();
      return { ok: `Salva. ${errMsg(e)}` };
    }
    return { error: `Não salvei: ${errMsg(e)}` };
  }
}

export async function testCurrentKeyAction(key: SecretKey): Promise<FormState> {
  const s = await getSettings();
  const value = s[key];
  if (!value) return { error: "Nenhuma chave configurada ainda." };
  try {
    return { ok: await testKey(key, value) };
  } catch (e) {
    return { error: errMsg(e) };
  } finally {
    refreshAll();
  }
}

export async function removeKeyAction(key: SecretKey): Promise<FormState> {
  await resetSetting(key);
  refreshAll();
  const s = await getSettings();
  return { ok: s[key] ? "Apagada daqui. O app voltou a usar a chave do arquivo .env." : "Apagada. Não há outra chave configurada." };
}

// ---------- Números e opções ----------

type Field = { key: keyof Settings; label: string; min: number; max: number; integer?: boolean };

const GROUPS = {
  radar: [
    { key: "windowDays", label: "Janela padrão do radar (dias)", min: 1, max: 30, integer: true },
    { key: "avgN", label: "Vídeos na base do canal", min: 3, max: 50, integer: true },
    { key: "multiplier", label: "Mínimo para outlier (x)", min: 1, max: 100 },
    { key: "minViews", label: "Views mínimas do outlier", min: 0, max: 100_000_000, integer: true },
    { key: "smallChannelMaxSubs", label: "Canal pequeno: até quantos inscritos", min: 100, max: 10_000_000, integer: true },
    { key: "smallChannelMinRatio", label: "Canal pequeno: vídeo com quantas vezes os inscritos", min: 1, max: 1000 },
    { key: "shortMaxSec", label: "Duração máxima para conferir se é Short (s)", min: 60, max: 600, integer: true },
  ],
  quota: [{ key: "dailyQuota", label: "Cota diária do YouTube (unidades)", min: 100, max: 10_000_000, integer: true }],
  money: [
    { key: "monthlyBudgetUsd", label: "Limite de gasto por mês (US$)", min: 0, max: 100_000 },
    { key: "dollarBrl", label: "Dólar (R$)", min: 1, max: 50 },
  ],
  auto: [
    { key: "autoCollectHours", label: "Coletar de novo depois de (horas)", min: 1, max: 168, integer: true },
    { key: "autoDiagnoseMaxPerDay", label: "Diagnósticos automáticos por dia", min: 0, max: 50, integer: true },
  ],
} satisfies Record<string, Field[]>;

const CHECKBOXES: Partial<Record<keyof typeof GROUPS, (keyof Settings)[]>> = {
  auto: ["autoCollect", "tracker", "autoBackup"],
};

export async function saveGroupAction(group: keyof typeof GROUPS, _prev: FormState, fd: FormData): Promise<FormState> {
  const fields: Field[] = GROUPS[group];
  const values: [keyof Settings, string][] = [];
  for (const f of fields) {
    const raw = str(fd, f.key);
    const n = parseNum(raw);
    if (n == null) return { error: `${f.label}: escreva um número.` };
    if (f.integer && !Number.isInteger(n)) return { error: `${f.label}: use um número inteiro.` };
    if (n < f.min || n > f.max)
      return { error: `${f.label}: use um valor entre ${f.min.toLocaleString("pt-BR")} e ${f.max.toLocaleString("pt-BR")}.` };
    values.push([f.key, String(n)]);
  }
  for (const k of CHECKBOXES[group] ?? []) values.push([k, fd.get(k) === "on" ? "1" : "0"]);
  for (const [k, v] of values) await saveSetting(k, v);
  refreshAll();
  return { ok: "Salvo. Já vale para o app todo." };
}

export async function resetGroupAction(group: keyof typeof GROUPS): Promise<FormState> {
  const fields: Field[] = GROUPS[group];
  for (const f of fields) await resetSetting(f.key);
  for (const k of CHECKBOXES[group] ?? []) await resetSetting(k);
  refreshAll();
  return { ok: "Voltou ao padrão." };
}

export async function saveModelsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const deep = str(fd, "modelDeep");
  const fast = str(fd, "modelFast");
  if (!PRICING[deep] || !PRICING[fast]) return { error: "Escolha um modelo da lista." };
  await saveSetting("modelDeep", deep);
  await saveSetting("modelFast", fast);
  refreshAll();
  return { ok: "Salvo. Os próximos custos estimados já usam o preço desses modelos." };
}

// ---------- Cópia de segurança ----------

export async function backupNowAction(): Promise<FormState> {
  try {
    const b = await makeBackup();
    revalidatePath("/configuracoes");
    return { ok: `Cópia feita: ${b.name} (${(b.bytes / 1_048_576).toFixed(1).replace(".", ",")} MB).` };
  } catch (e) {
    return { error: `Não deu para copiar: ${errMsg(e)}` };
  }
}
