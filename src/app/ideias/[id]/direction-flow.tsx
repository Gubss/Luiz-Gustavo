import type {Idea} from "@prisma/client";
import {prisma} from "@/lib/db";
import {STAGES,STAGE_LABELS,nextStage,estimateDirection,isDirectionRunning} from "@/lib/directors";
import {StateForm} from "@/components/StateForm";
import {directorAction} from "@/app/gerador/director-actions";
const descriptions={scene:"Atuação, gestos, posições e continuidade. Uma cena pode reunir várias falas.",photography:"Câmera, planos, luz, cor e composição a partir da encenação.",sound:"Interpretação das vozes, ambiência, Foley, efeitos, música e mixagem.",integration:"Confere vínculos e reúne as direções para exportação. Tempos estimados até existir áudio real."};
const labels:Record<string,string>={cenas:"Cenas",falas:"Interpretação das falas",pendencias:"Pendências",id:"Cena",cenaId:"Cena",falaId:"Fala",falaInicial:"Da fala",falaFinal:"Até a fala",intencao:"Intenção",atuacao:"Atuação",posicoes:"Posições",movimento:"Movimento",continuidade:"Continuidade",ritmo:"Ritmo",plano:"Plano",camera:"Câmera",luz:"Luz",cor:"Cor",composicao:"Composição",transicao:"Transição",entrega:"Entrega vocal",pausas:"Pausas",ambiencia:"Ambiência",foley:"Sons da ação",efeitos:"Efeitos",musica:"Música",mixagem:"Mixagem",duracaoEstimada:"Duração estimada (s)",tempos:"Tempos",inicioEstimado:"Início estimado (s)",fimEstimado:"Fim estimado (s)",fotografia:"Fotografia",som:"Som",interpretacao:"Interpretação"};
function DirectionResult({value}:{value:unknown}){
 if(Array.isArray(value))return value.length?<ul className="space-y-3">{value.map((item,i)=><li key={i} className="border-l border-line pl-3"><DirectionResult value={item}/></li>)}</ul>:<p className="text-zinc-400">Nenhuma.</p>;
 if(value&&typeof value==="object")return <dl className="space-y-2">{Object.entries(value).map(([key,item])=><div key={key}><dt className="font-medium text-zinc-300">{labels[key]??key}</dt><dd className="break-words text-zinc-400"><DirectionResult value={item}/></dd></div>)}</dl>;
 return <>{String(value??"")}</>;
}
export async function DirectionFlow({idea}:{idea:Idea}){
 if(!idea.currentVersionId)return null;
 const run=await prisma.directionRun.findUnique({where:{versionId:idea.currentVersionId}});
 const approved=idea.approvedVersionId===idea.currentVersionId;
 const format=idea.formatId?await prisma.videoFormat.findUnique({where:{id:idea.formatId},select:{directionStudy:true}}):null;
 const study=Boolean(run?.study||format?.directionStudy?.trim());
 const next=nextStage(run);let cost=null;
 if(approved&&study&&next&&next!=="integration")cost=await estimateDirection(idea.id,idea.currentVersionId);
 const running=isDirectionRunning(run);
 return <section aria-labelledby="directors-title" className="rounded-xl border border-line bg-surface p-5">
  <h2 id="directors-title" className="text-lg font-semibold">Direção da versão atual</h2>
  <p className="mt-2 text-sm text-zinc-400">Cada etapa usa a versão aprovada e preserva suas falas e acontecimentos. Aprovar não chama IA.</p>
  {!approved&&<p role="status" className="mt-3 text-amber-300">Aprove as falas desta versão para liberar os diretores.</p>}
  {!study&&<p role="status" className="mt-3 text-amber-300">Sem estudo de direção. <a className="underline" href={"/formatos/"+idea.formatId}>Importar no formato</a>.</p>}
  {run?.error&&<p role="alert" className="mt-3 text-red-300">{run.error} As etapas concluídas estão preservadas; tente novamente a etapa pendente.</p>}
  <ol className="mt-4 divide-y divide-line">{STAGES.map((stage,i)=>{
   const done=Boolean(run?.[stage]);const enabled=approved&&study&&stage===next&&!running;
   const status=done?"Concluído":running&&run?.runningStage===stage?"Em andamento":!approved?"Aguarda aprovação":stage===next?"Próxima etapa":"Aguarda "+STAGE_LABELS[STAGES[i-1]];
   return <li key={stage} className="py-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{i+2}. {STAGE_LABELS[stage]}</h3><span className={done?"text-sm text-emerald-300":"text-sm text-zinc-400"}>{status}</span></div>
    <p className="my-2 text-sm text-zinc-400">{descriptions[stage]}</p>
    {enabled&&<StateForm action={directorAction.bind(null,idea.id)} label={stage==="integration"?"Integrar direções":"Preparar "+STAGE_LABELS[stage].toLowerCase()} busy="Iniciando…" hint={stage==="integration"?"Conferência em código · sem custo de IA":cost?`1 chamada de IA · estimativa US$ ${cost.usd.toFixed(2)} a ${cost.usdMax.toFixed(2)} · custo real depende do uso`:undefined}><input type="hidden" name="versionId" value={idea.currentVersionId!}/><input type="hidden" name="stage" value={stage}/></StateForm>}
    {done&&<details className="mt-3"><summary className="text-sm text-zinc-300">Ver resultado de {STAGE_LABELS[stage].toLowerCase()}</summary><div className="mt-3 text-sm"><DirectionResult value={JSON.parse(run![stage]!)}/></div></details>}
   </li>;
  })}</ol>
  {run?.integration&&approved&&<p className="text-sm text-emerald-300">Direção integrada disponível no arquivo do roteiro. Revise as pendências e sincronize os tempos ao áudio antes de produzir.</p>}
 </section>;
}
