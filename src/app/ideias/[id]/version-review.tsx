import type { Idea } from "@prisma/client";
import { prisma } from "@/lib/db";
import { spokenLines } from "@/lib/script-lines";
import { CHANGE_CATEGORIES } from "@/lib/script-versions";
import { StateForm } from "@/components/StateForm";
import { captureLegacyAction, approveAction, correctScriptAction, critiqueAction, restoreAction } from "@/app/gerador/actions";
import type { ScriptContent } from "@/lib/generator";
export async function VersionReview({idea}:{idea:Idea}) {
 const versions=await prisma.scriptVersion.findMany({where:{ideaId:idea.id},orderBy:{number:"desc"}});
 const current=versions.find(v=>v.id===idea.currentVersionId);
 if(!current)return <StateForm action={captureLegacyAction.bind(null,idea.id)} label="Revisar roteiro existente" hint="Preserva o texto atual; não chama IA."/>;
 const data=JSON.parse(current.content) as ScriptContent;
 const lines=spokenLines(data);
 const critiques=await prisma.generation.findMany({where:{scriptVersionId:current.id,kind:"script-critic-optional"},orderBy:{createdAt:"desc"}});
 return <div className="space-y-4 border-t border-line pt-4">
 <p>{idea.projectCode} · versão {current.number} · {idea.approvedVersionId===current.id?"Falas aprovadas":"Aguardando aprovação desta versão"}</p>
 {(data.pendencias??[]).length>0&&<details><summary>Pendências das falas</summary><ul>{data.pendencias?.map((x,i)=><li key={i}>{x}</li>)}</ul></details>}
 <StateForm action={correctScriptAction.bind(null,idea.id)} label="Corrigir trecho" busy="Iniciando correção…" hint="Uma chamada de IA. As outras falas ficam iguais.">
 <input type="hidden" name="versionId" value={current.id}/>
 <label className="label">Fala a corrigir<select className="input" name="line">{lines.map(l=><option key={l.n} value={l.n}>{l.n}. {l.who}: {l.text}</option>)}</select></label>
 <label className="label">Até a fala<select className="input" name="endLine" defaultValue=""><option value="">Somente a fala escolhida</option>{lines.map(l=><option key={l.n} value={l.n}>{l.n}. {l.who}: {l.text}</option>)}</select></label>
 <label className="label">O que você quer mudar?<textarea className="input" name="request" required maxLength={4000} rows={2}/></label>
 <label className="label">Tipo de mudança<select className="input" name="category">{CHANGE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
 </StateForm>
 <div className="flex flex-wrap gap-3">
 <StateForm action={approveAction.bind(null,idea.id)} label="Aprovar falas"><input type="hidden" name="versionId" value={current.id}/></StateForm>
 <StateForm action={critiqueAction.bind(null,idea.id)} label="Pedir crítica" hint="Opcional · usa IA · não reescreve"><input type="hidden" name="versionId" value={current.id}/></StateForm>
 </div>
 {critiques.map(c=>{const r=JSON.parse(c.output) as {observacoes?:string[];hipoteses?:string[];pendencias?:string[]};return <details key={c.id}><summary>Crítica solicitada · {c.createdAt.toLocaleString("pt-BR")}</summary>{Object.entries(r).map(([k,v])=><div key={k}><strong>{k}</strong><ul>{Array.isArray(v)&&v.map((x,i)=><li key={i}>{x}</li>)}</ul></div>)}</details>})}
 <details><summary>Versões e comparação ({versions.length})</summary><div className="space-y-4 py-3">{versions.map(v=>{
 const previous=spokenLines(JSON.parse(v.content) as ScriptContent);
 return <article key={v.id} className="rounded border border-line p-3"><h3>Versão {v.number} · {v.category} · {v.origin} {v.id===idea.approvedVersionId?"· aprovada":""}</h3><p>{v.request}</p>
 {v.id!==current.id&&<><div className="grid gap-4 md:grid-cols-2"><div><strong>Versão {v.number}</strong>{previous.map(l=><p key={l.n} className={lines[l.n-1]?.text!==l.text?"text-amber-300":""}>{l.who}: {l.text}</p>)}</div><div><strong>Atual ({current.number})</strong>{lines.map(l=><p key={l.n} className={previous[l.n-1]?.text!==l.text?"text-emerald-300":""}>{l.who}: {l.text}</p>)}</div></div><StateForm action={restoreAction.bind(null,idea.id)} label={"Restaurar versão "+v.number}><input type="hidden" name="versionId" value={v.id}/><input type="hidden" name="currentVersionId" value={current.id}/></StateForm></>}
 </article>})}</div></details>
 </div>;
}
