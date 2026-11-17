import type {Idea} from "@prisma/client";
import {prisma} from "@/lib/db";
import {STAGES,STAGE_LABELS,nextStage,estimateDirectionPipeline,isDirectionRunning} from "@/lib/directors";
import {hasDirectionInstructions} from "@/lib/direction-instructions";
import {effectiveInstructions} from "@/lib/directions";
import {runningJobsFor} from "@/lib/jobs";
import {StateForm} from "@/components/StateForm";
import {prepareDirectionAction,approveDirectionAction} from "@/app/gerador/director-actions";
import {DirectionRefresh} from "./direction-refresh";
const descriptions={scene:"Atuação, gestos, posições e continuidade. Uma cena pode reunir várias falas.",photography:"Câmera, planos, luz, cor e composição a partir da encenação.",sound:"Interpretação das vozes, ambiência, Foley, efeitos, música e mixagem.",integration:"Confere vínculos e reúne as direções para exportação. Tempos estimados até existir áudio real."};
const labels:Record<string,string>={cenas:"Cenas",falas:"Interpretação das falas",pendencias:"Pendências",id:"Cena",cenaId:"Cena",falaId:"Fala",falaInicial:"Da fala",falaFinal:"Até a fala",intencao:"Intenção",atuacao:"Atuação",posicoes:"Posições",movimento:"Movimento",continuidade:"Continuidade",ritmo:"Ritmo",plano:"Plano",camera:"Câmera",luz:"Luz",cor:"Cor",composicao:"Composição",transicao:"Transição",entrega:"Entrega vocal",pausas:"Pausas",ambiencia:"Ambiência",foley:"Sons da ação",efeitos:"Efeitos",musica:"Música",mixagem:"Mixagem",duracaoEstimada:"Duração estimada (s)",tempos:"Tempos",inicioEstimado:"Início estimado (s)",fimEstimado:"Fim estimado (s)",fotografia:"Fotografia",som:"Som",interpretacao:"Interpretação"};
function DirectionResult({value}:{value:unknown}){
 if(Array.isArray(value))return value.length?<ul className="space-y-3">{value.map((item,i)=><li key={i} className="border-l border-line pl-3"><DirectionResult value={item}/></li>)}</ul>:<p className="text-zinc-400">Nenhuma.</p>;
 if(value&&typeof value==="object")return <dl className="space-y-2">{Object.entries(value).map(([key,item])=><div key={key}><dt className="font-medium text-zinc-300">{labels[key]??key}</dt><dd className="break-words text-zinc-400"><DirectionResult value={item}/></dd></div>)}</dl>;
 return <>{String(value??"")}</>;
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
 const hint=cost?"Custo total estimado das etapas restantes: US$ "+cost.usd.toFixed(3)+" a "+cost.usdMax.toFixed(3)+" · "+cost.calls+" chamadas de IA; integração sem IA. Custo real depende do uso.":undefined;
 return <section aria-labelledby="directors-title" className="rounded-xl border border-line bg-surface p-5">
  <DirectionRefresh active={running}/>
  <div className="flex flex-wrap justify-between gap-2"><h2 id="directors-title" className="text-lg font-semibold">4.2 Direção</h2><span className={run?.approvedAt&&approved?"text-emerald-300":"text-zinc-400"}>{run?.approvedAt&&approved?"Direção aprovada · v"+version.number:!approved?"Esperando o roteiro":running?"Rodando":run?.integration?"Aguardando sua aprovação":error?"Erro":"Pronta para preparar"}</span></div>
  <p className="mt-2 text-sm text-zinc-400">Cena → fotografia → som e trilha → integração. Um botão executa a sequência; você confere e aprova o resultado junto.</p>
  {!approved&&<p role="status" className="mt-3 text-amber-300">Aprove o roteiro v{version.number} no botão acima para liberar os diretores. A aprovação anterior não vale para esta versão.</p>}
  {!ready&&<p role="status" className="mt-3 text-amber-300">Faltam instruções por função. <a className="underline" href={"/formatos/"+idea.formatId+"#direction-title"}>Escolher ou completar a direção do formato</a>.</p>}
  {error&&<p role="alert" className="mt-3 text-red-300">{error} As etapas feitas estão preservadas.</p>}
  {approved&&ready&&next&&!running&&!problem&&<div className="mt-4"><StateForm action={prepareDirectionAction.bind(null,idea.id)} label={error?"Tentar de novo desta etapa":run?.scene?"Continuar direção":"Preparar direção"} busy="Iniciando…" hint={hint}><input type="hidden" name="versionId" value={idea.currentVersionId}/></StateForm></div>}
  {running&&<p role="status" className="mt-3 text-amber-300">{job?.step??(run?.runningStage?STAGE_LABELS[run.runningStage as keyof typeof STAGE_LABELS]:"Preparando direção")} · acompanhe as etapas abaixo.</p>}
  <ol className="mt-4 divide-y divide-line">{STAGES.map((stage,i)=>{
   const done=Boolean(run?.[stage]);
   const status=done?"Feito":!approved?"Esperando aprovação do roteiro":running&&run?.runningStage===stage?"Rodando":error&&stage===next?"Erro":stage===next?(running?"Rodando":"Próxima etapa"):"Esperando o anterior";
   return <li key={stage} className="py-4" data-stage={stage}><div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{i+1}. {STAGE_LABELS[stage]}</h3><span className={done?"text-sm text-emerald-300":status==="Erro"?"text-sm text-red-300":"text-sm text-zinc-400"}>{status}</span></div>
    <p className="my-2 text-sm text-zinc-400">{descriptions[stage]}</p>
    {done&&<details className="mt-3"><summary className="text-sm text-zinc-300">Ver resultado de {STAGE_LABELS[stage].toLowerCase()}</summary><div className="mt-3 text-sm"><DirectionResult value={JSON.parse(run![stage]!)}/></div></details>}
   </li>;
  })}</ol>
  <div className="mt-3 border-t border-line pt-4"><h3 className="font-semibold">Direção aprovada → Estúdio</h3>
   {run?.integration&&approved&&!run.approvedAt&&<div className="mt-3"><StateForm action={approveDirectionAction.bind(null,idea.id)} label={"Aprovar direção v"+version.number} hint="Leia o resultado da integração acima e confira as pendências. Sem IA."><input type="hidden" name="versionId" value={idea.currentVersionId}/></StateForm></div>}
   {run?.approvedAt&&approved?<p className="mt-3"><a href={"/api/ideias/"+idea.id+"/roteiro?estudio=1"} download className="btn-primary">Baixar .md para o Estúdio</a></p>:<p className="mt-2 text-sm text-zinc-400">Conclua e aprove a direção desta versão para baixar o arquivo de produção.</p>}
  </div>
 </section>;
}
