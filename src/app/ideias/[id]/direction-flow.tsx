import type {Idea} from "@prisma/client";
import {prisma} from "@/lib/db";
import type {DirectionRun} from "@prisma/client";
import {STAGES,STAGE_LABELS,nextStage,estimateDirectionPipeline,estimateDirectionCorrection,isDirectionRunning,parseStale,parseHistory,scriptIntentions,SceneSchema,WHOLE_STAGE,type DirectorStage,type StaleMark} from "@/lib/directors";
import {hasDirectionInstructions} from "@/lib/direction-instructions";
import {effectiveInstructions} from "@/lib/directions";
import {runningJobsFor} from "@/lib/jobs";
import {StateForm} from "@/components/StateForm";
import {prepareDirectionAction,approveDirectionAction,correctDirectionAction} from "@/app/gerador/director-actions";
import {DirectionRefresh} from "./direction-refresh";
const descriptions={scene:"Atuação, gestos, posições e continuidade. Uma cena pode reunir várias falas.",photography:"Câmera, planos, luz, cor e composição a partir da encenação.",sound:"Interpretação das vozes, ambiência, Foley, efeitos, música e mixagem.",integration:"Confere vínculos e reúne as direções para exportação. Tempos estimados até existir áudio real."};
const labels:Record<string,string>={cenas:"Cenas",falas:"Interpretação das falas",pendencias:"Pendências",id:"Cena",cenaId:"Cena",falaId:"Fala",falaInicial:"Da fala",falaFinal:"Até a fala",intencao:"Intenção",atuacao:"Atuação",posicoes:"Posições",movimento:"Movimento",continuidade:"Continuidade",ritmo:"Ritmo",plano:"Plano",camera:"Câmera",luz:"Luz",cor:"Cor",composicao:"Composição",transicao:"Transição",entrega:"Entrega vocal",pausas:"Pausas",ambiencia:"Ambiência",foley:"Sons da ação",efeitos:"Efeitos",musica:"Música",mixagem:"Mixagem",duracaoEstimada:"Duração estimada (s)",tempos:"Tempos",inicioEstimado:"Início estimado (s)",fimEstimado:"Fim estimado (s)",fotografia:"Fotografia",som:"Som",interpretacao:"Interpretação"};
function DirectionResult({value}:{value:unknown}){
 if(Array.isArray(value))return value.length?<ul className="space-y-3">{value.map((item,i)=><li key={i} className="border-l border-line pl-3"><DirectionResult value={item}/></li>)}</ul>:<p className="text-zinc-400">Nenhuma.</p>;
 if(value&&typeof value==="object")return <dl className="space-y-2">{Object.entries(value).map(([key,item])=><div key={key}><dt className="font-medium text-zinc-300">{labels[key]??key}</dt><dd className="break-words text-zinc-400"><DirectionResult value={item}/></dd></div>)}</dl>;
 return <>{String(value??"")}</>;
}
const usd=(n:number)=>"US$ "+n.toFixed(3);
const targetLabel=(t:string)=>t===WHOLE_STAGE?"toda a etapa":t;

/** Adendo B: corrigir só a direção — mesmo padrão do “Corrigir trecho” do roteiro. */
async function StageCorrection({ideaId,versionId,stage,run,marks}:{ideaId:string;versionId:string;stage:DirectorStage;run:DirectionRun;marks:StaleMark[]}){
 const scenes=SceneSchema.parse(JSON.parse(run.scene!)).cenas;
 let cost:{whole:number;scene:number}|null=null;
 try{cost={whole:(await estimateDirectionCorrection(ideaId,versionId,stage)).usdMax,scene:(await estimateDirectionCorrection(ideaId,versionId,stage,scenes[0].id)).usdMax};}catch{cost=null;}
 const history=parseHistory(run).filter(h=>h.stage===stage).reverse();
 const action=correctDirectionAction.bind(null,ideaId);
 return <div className="mt-3 space-y-3">
  {marks.length>0&&<div role="status" className="rounded border border-amber-700 p-3 text-sm text-amber-300">
   <p><strong>Desatualizada:</strong> {marks.map(m=>targetLabel(m.target)).join(", ")}. A etapa anterior foi corrigida depois deste resultado.</p>
   <div className="mt-2 flex flex-wrap gap-2">{marks.map(m=><StateForm key={m.target} action={action} label={"Refazer "+targetLabel(m.target)} busy="Iniciando…" className="btn-secondary" hint={cost?"Uma chamada de IA · até "+usd(m.target===WHOLE_STAGE?cost.whole:cost.scene):undefined}>
    <input type="hidden" name="versionId" value={versionId}/><input type="hidden" name="stage" value={stage}/><input type="hidden" name="target" value={m.target}/><input type="hidden" name="mode" value="redo"/>
   </StateForm>)}</div>
  </div>}
  <details className="rounded border border-line p-3"><summary className="text-sm text-zinc-300">Corrigir {STAGE_LABELS[stage].toLowerCase()}</summary>
   <div className="mt-3"><StateForm action={action} label="Corrigir direção" busy="Iniciando correção…" hint={"Uma chamada de IA"+(cost?(usd(cost.scene)===usd(cost.whole)?" · até "+usd(cost.whole):" · cena: até "+usd(cost.scene)+" · etapa inteira: até "+usd(cost.whole)):"")+". O roteiro não muda; a versão anterior fica guardada e as etapas seguintes ficam marcadas para refazer."}>
    <input type="hidden" name="versionId" value={versionId}/><input type="hidden" name="stage" value={stage}/>
    <label className="label">Trecho<select className="input" name="target" defaultValue={WHOLE_STAGE}><option value={WHOLE_STAGE}>Toda a etapa</option>{scenes.map(c=><option key={c.id} value={c.id}>{c.id} · falas {c.falaInicial}–{c.falaFinal} · {c.intencao.slice(0,70)}</option>)}</select></label>
    <label className="label">O que você quer mudar?<textarea className="input" name="request" required maxLength={4000} rows={2}/></label>
    <fieldset className="space-y-1"><legend className="label">Esta correção vale para</legend><div className="flex flex-wrap gap-3 text-sm">
     <label className="inline-flex items-center gap-1.5"><input type="radio" name="escopo" value="roteiro" defaultChecked className="accent-emerald-500"/>Só este roteiro</label>
     <label className="inline-flex items-center gap-1.5"><input type="radio" name="escopo" value="canal" className="accent-emerald-500"/>Vale para o canal todo</label>
    </div><p className="text-xs text-zinc-500">&quot;Canal todo&quot; guarda o seu pedido como regra de direção do canal: entra na direção de todo roteiro, em qualquer formato.</p></fieldset>
   </StateForm></div>
  </details>
  {history.length>0&&<details><summary className="text-sm text-zinc-400">Versões anteriores ({history.length})</summary><ol className="mt-2 space-y-2 text-sm">{history.map((h,i)=><li key={i} className="border-l border-line pl-3"><p className="text-zinc-300">{new Date(h.at).toLocaleString("pt-BR")} · {targetLabel(h.target)} · {h.request}</p><details><summary className="text-zinc-400">Ver resultado anterior</summary><div className="mt-2"><DirectionResult value={JSON.parse(h.value)}/></div></details></li>)}</ol></details>}
 </div>;
}

export async function DirectionFlow({idea}:{idea:Idea}){
 if(!idea.currentVersionId)return null;
 const [run,version,format,jobs]=await Promise.all([
  prisma.directionRun.findUnique({where:{versionId:idea.currentVersionId}}),
  prisma.scriptVersion.findUniqueOrThrow({where:{id:idea.currentVersionId}}),
  idea.formatId?prisma.videoFormat.findUnique({where:{id:idea.formatId},include:{direction:true}}):null,
  runningJobsFor([idea.id])
 ]);
 const approved=idea.approvedVersionId===idea.currentVersionId;
 const ready=Boolean(run?.study.startsWith('{"version":1,')||hasDirectionInstructions(effectiveInstructions(format)));
 const next=nextStage(run);
 const job=jobs.find(j=>j.kind==="direction");
 const running=isDirectionRunning(run)||Boolean(job);
 const interrupted=Boolean(run?.runningStage&&!running);
 let cost=null;let problem:string|null=null;
 if(approved&&ready&&next&&!running){try{cost=await estimateDirectionPipeline(idea.id,idea.currentVersionId);}catch(e){problem=e instanceof Error?e.message:String(e);}}
 const error=run?.error??problem??(interrupted?"A execução foi interrompida. Retome a etapa pendente.":null);
 const marks=parseStale(run);
 const intentions=approved?await scriptIntentions(idea.currentVersionId):[];
 const hint=cost?"Custo total estimado das etapas restantes: US$ "+cost.usd.toFixed(3)+" a "+cost.usdMax.toFixed(3)+" · "+cost.calls+" chamadas de IA; integração sem IA. Custo real depende do uso.":undefined;
 return <section aria-labelledby="directors-title" className="rounded-xl border border-line bg-surface p-5">
  <DirectionRefresh active={running}/>
  <div className="flex flex-wrap justify-between gap-2"><h2 id="directors-title" className="text-lg font-semibold">4.2 Direção</h2><span className={run?.approvedAt&&approved?"text-emerald-300":"text-zinc-400"}>{run?.approvedAt&&approved?"Direção aprovada · v"+version.number:!approved?"Esperando o roteiro":running?"Rodando":run?.integration?"Aguardando sua aprovação":error?"Erro":"Pronta para preparar"}</span></div>
  <p className="mt-2 text-sm text-zinc-400">Cena → fotografia → som e trilha → integração. Um botão executa a sequência; você confere e aprova o resultado junto.</p>
  {!approved&&<p role="status" className="mt-3 text-amber-300">Aprove o roteiro v{version.number} no botão acima para liberar os diretores. A aprovação anterior não vale para esta versão.</p>}
  {!ready&&<p role="status" className="mt-3 text-amber-300">Faltam instruções por função. <a className="underline" href={"/formatos/"+idea.formatId+"#direction-title"}>Escolher ou completar a direção do formato</a>.</p>}
  {intentions.length>0&&<details className="mt-3 text-sm"><summary className="text-zinc-300">Suas correções do roteiro que a direção precisa mostrar ({intentions.length})</summary><ol className="mt-2 list-decimal space-y-1 pl-5 text-zinc-400">{intentions.map((t,i)=><li key={i}>{t}</li>)}</ol></details>}
  {error&&<p role="alert" className="mt-3 text-red-300">{error} As etapas feitas estão preservadas.</p>}
  {approved&&ready&&next&&!running&&!problem&&<div className="mt-4"><StateForm action={prepareDirectionAction.bind(null,idea.id)} label={error?"Tentar de novo desta etapa":run?.scene?"Continuar direção":"Preparar direção"} busy="Iniciando…" hint={hint}><input type="hidden" name="versionId" value={idea.currentVersionId}/></StateForm></div>}
  {running&&<p role="status" className="mt-3 text-amber-300">{job?.step??(run?.runningStage?STAGE_LABELS[run.runningStage as keyof typeof STAGE_LABELS]:"Preparando direção")} · acompanhe as etapas abaixo.</p>}
  <ol className="mt-4 divide-y divide-line">{STAGES.map((stage,i)=>{
   const done=Boolean(run?.[stage]);
   const status=done?"Feito":!approved?"Esperando aprovação do roteiro":running&&run?.runningStage===stage?"Rodando":error&&stage===next?"Erro":stage===next?(running?"Rodando":"Próxima etapa"):"Esperando o anterior";
   return <li key={stage} className="py-4" data-stage={stage}><div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{i+1}. {STAGE_LABELS[stage]}</h3><span className={done?"text-sm text-emerald-300":status==="Erro"?"text-sm text-red-300":"text-sm text-zinc-400"}>{status}</span></div>
    <p className="my-2 text-sm text-zinc-400">{descriptions[stage]}</p>
    {done&&<details className="mt-3"><summary className="text-sm text-zinc-300">Ver resultado de {STAGE_LABELS[stage].toLowerCase()}</summary><div className="mt-3 text-sm"><DirectionResult value={JSON.parse(run![stage]!)}/></div></details>}
    {done&&stage!=="integration"&&approved&&!running&&<StageCorrection ideaId={idea.id} versionId={idea.currentVersionId!} stage={stage} run={run!} marks={marks.filter(m=>m.stage===stage)}/>}
   </li>;
  })}</ol>
  <div className="mt-3 border-t border-line pt-4"><h3 className="font-semibold">Direção aprovada → Estúdio</h3>
   {run?.integration&&approved&&!run.approvedAt&&marks.length>0&&<p role="status" className="mt-3 text-amber-300">Refaça as etapas marcadas como desatualizadas para aprovar a direção.</p>}
   {run?.integration&&approved&&!run.approvedAt&&!marks.length&&<div className="mt-3"><StateForm action={approveDirectionAction.bind(null,idea.id)} label={"Aprovar direção v"+version.number} hint="Leia o resultado da integração acima e confira as pendências. Sem IA."><input type="hidden" name="versionId" value={idea.currentVersionId}/></StateForm></div>}
   {run?.approvedAt&&approved?<p className="mt-3"><a href={"/api/ideias/"+idea.id+"/roteiro?estudio=1"} download className="btn-primary">Baixar .md para o Estúdio</a></p>:<p className="mt-2 text-sm text-zinc-400">Conclua e aprove a direção desta versão para baixar o arquivo de produção.</p>}
  </div>
 </section>;
}
