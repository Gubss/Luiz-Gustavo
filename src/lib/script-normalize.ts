export type SpokenEntry = { personagem: string; fala: string };

/** Only returned/selected entries are passed here; surrounding dialogue stays untouched. */
export function normalizeSpokenEntries(entries: SpokenEntry[], fallback = "—"): SpokenEntry[] {
 return entries.flatMap(entry => {
  const inherited = entry.personagem.trim() || fallback;
  return entry.fala.split(/\r?\n/).filter(text => text.trim()).map(text => {
   let personagem = inherited;
   let fala = text.trim();
   // A label starts with an uppercase name. Ordinary prose before a colon is not a label.
   const label = /^(?:\*\*)?([\p{Lu}][\p{L}\p{M}-]*(?:[ \t]+(?:[\p{Lu}][\p{L}\p{M}-]*|da|de|do|das|dos)){0,4})(?:\*\*)?[ \t]*:[ \t]*(?:\*\*)?[ \t]*/u;
   for (;;) {
    const match = fala.match(label);
    if (!match || !fala.slice(match[0].length).trim()) break;
    personagem = match[1];
    fala = fala.slice(match[0].length);
   }
   return { personagem, fala };
  });
 });
}
