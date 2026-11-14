/**
 * Etapa 8 — cópia de segurança do banco (prisma/radar.db).
 * Usa o VACUUM INTO do SQLite: gera uma cópia íntegra mesmo com o app aberto, sem parar nada.
 * As cópias ficam na pasta `backups/` do app; ficam só as 10 mais novas.
 */
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "./db";

const KEEP = 10;
const WEEK = 7 * 86_400_000;

export const backupDir = () => path.resolve(process.env.RADAR_BACKUP_DIR ?? path.join(process.cwd(), "backups"));

export type BackupFile = { name: string; path: string; bytes: number; createdAt: Date };

export function listBackups(): BackupFile[] {
  const dir = backupDir();
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((n) => /^radar-.*\.db$/.test(n));
  } catch {
    return [];
  }
  return names
    .map((name) => {
      const p = path.join(dir, name);
      const st = statSync(p);
      return { name, path: p, bytes: st.size, createdAt: st.mtime };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function stamp(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}-${p.second}`;
}

/** Faz uma cópia agora e apaga as mais antigas (fica com as 10 mais novas). */
export async function makeBackup(): Promise<BackupFile> {
  const dir = backupDir();
  mkdirSync(dir, { recursive: true });
  const name = `radar-${stamp()}.db`;
  const file = path.join(dir, name);
  rmSync(file, { force: true });
  await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  for (const old of listBackups().slice(KEEP)) rmSync(old.path, { force: true });
  const st = statSync(file);
  return { name, path: file, bytes: st.size, createdAt: st.mtime };
}

/** Cópia automática: se a mais nova tiver mais de 7 dias (ou não houver nenhuma). */
export async function backupIfDue(): Promise<BackupFile | null> {
  const last = listBackups()[0];
  if (last && Date.now() - last.createdAt.getTime() < WEEK) return null;
  return makeBackup();
}
