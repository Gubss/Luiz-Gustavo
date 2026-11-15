// Roteiro falado × animação: o que se ouve fica em `falado`; cada cena aponta para os números das falas.
// Roteiros de antes de 15/11/2026 têm a fala dentro de cada cena (`personagem` + `fala`): tudo aqui lê os dois jeitos.
// Módulo sem dependências (usado pelo gerador, pelo diagnóstico e pela tela).

export type SpokenEntry = { personagem: string; fala: string };

/** Cena como pode estar salva: a nova (aponta para as falas) ou a antiga (fala dentro da cena). */
export type SceneLike = {
  inicio: number;
  fim: number;
  parte: string;
  falas?: number[];
  personagem?: string;
  fala?: string;
};

export type ScenesAndLines = { cenas: SceneLike[]; falado?: SpokenEntry[] };

/** Uma fala do roteiro falado: número (1 = primeira), quem fala, o texto e a cena em que entra. */
export type SpokenLine = { n: number; who: string; text: string; scene: number | null; parte: string | null };

export const sortedScenes = <T extends { inicio: number }>(cenas: T[]) => [...cenas].sort((a, b) => a.inicio - b.inicio);

/** O roteiro falado, na ordem: o que se ouve no vídeo e nada mais. Roteiro antigo: as falas das cenas. */
export function spokenLines(c: ScenesAndLines): SpokenLine[] {
  const scenes = sortedScenes(c.cenas ?? []);
  if (c.falado?.length) {
    const sceneOf = new Map<number, number>();
    scenes.forEach((s, i) => (s.falas ?? []).forEach((n) => sceneOf.has(n) || sceneOf.set(n, i)));
    return c.falado
      .map((l, i) => {
        const scene = sceneOf.get(i + 1) ?? null;
        return { n: i + 1, who: l.personagem?.trim() || "—", text: l.fala ?? "", scene, parte: scene != null ? scenes[scene].parte : null };
      })
      .filter((l) => l.text.trim());
  }
  const out: SpokenLine[] = [];
  scenes.forEach((s, i) => {
    if (s.fala?.trim()) out.push({ n: out.length + 1, who: s.personagem?.trim() || "—", text: s.fala, scene: i, parte: s.parte });
  });
  return out;
}

/** Falas ditas numa cena (número no roteiro falado, quem fala e o texto). */
export function sceneLines(c: Partial<ScenesAndLines>, scene: SceneLike): { n: number | null; who: string; text: string }[] {
  const falado = c.falado;
  if (falado?.length)
    return (scene.falas ?? [])
      .map((n) => ({ n, l: falado[n - 1] }))
      .filter((x) => x.l?.fala?.trim())
      .map((x) => ({ n: x.n, who: x.l.personagem?.trim() || "—", text: x.l.fala }));
  return scene.fala?.trim() ? [{ n: null, who: scene.personagem?.trim() || "—", text: scene.fala }] : [];
}

/**
 * Toda fala precisa entrar numa cena (o Prisma anima pelas cenas). Fala que o roteirista não pôs em nenhuma cena
 * vai para a cena da fala anterior (ou para a primeira); números repetidos ou fora do roteiro falado saem.
 */
export function attachLines<T extends { cenas: (SceneLike & { falas: number[] })[]; falado: SpokenEntry[] }>(c: T): T {
  if (!c.falado?.length || !c.cenas.length) return c;
  const total = c.falado.length;
  const scenes = sortedScenes(c.cenas).map((s) => ({ ...s, falas: [...new Set((s.falas ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= total))] }));
  const placed = new Set<number>();
  for (const s of scenes) {
    s.falas = s.falas.filter((n) => !placed.has(n));
    s.falas.forEach((n) => placed.add(n));
  }
  for (let n = 1; n <= total; n++) {
    if (placed.has(n) || !c.falado[n - 1]?.fala?.trim()) continue;
    let target = 0;
    scenes.forEach((s, i) => {
      if (s.falas.some((m) => m < n)) target = i;
    });
    scenes[target].falas.push(n);
    placed.add(n);
  }
  for (const s of scenes) s.falas.sort((a, b) => a - b);
  return { ...c, cenas: scenes };
}
