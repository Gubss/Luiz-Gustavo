/** Only explicit channel duration limits are enforced; old study rules are not global. */
export function directionWarnings(lines:{text:string}[],durationSec:number,limits?:{min:number;max:number}):string[]{
 void lines;
 if(!limits||!durationSec)return [];
 if(durationSec<limits.min||durationSec>limits.max)return [`Duração estimada de ${Math.round(durationSec)}s fora da faixa do canal (${limits.min}–${limits.max}s). Revise a história sem cortar lógica ou piadas; a duração real depende do áudio.`];
 return [];
}
