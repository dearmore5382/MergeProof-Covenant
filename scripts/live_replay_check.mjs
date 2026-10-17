import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const address=process.env.MERGEPROOF_ADDRESS;
const pr=Number(process.env.MERGEPROOF_PR||4);
if(!/^0x[0-9a-fA-F]{40}$/.test(address||""))throw Error("Set MERGEPROOF_ADDRESS");
const key=name=>{const value=process.env[name]||"";if(!/^(0x)?[0-9a-fA-F]{64}$/.test(value))throw Error(`Set ${name}`);return value.startsWith("0x")?value:`0x${value}`};
const accounts=[createAccount(key("MERGEPROOF_SPONSOR_KEY")),createAccount(key("MERGEPROOF_CONTRIBUTOR_KEY"))];
if(accounts[0].address.toLowerCase()===accounts[1].address.toLowerCase())throw Error("Distinct test wallets required");
const clients=accounts.map(account=>createClient({chain:studionet,account}));
const reader=createClient({chain:studionet});
const source=readFileSync("contracts/MergeProofCovenant.py");
const reportPath=`verification/LIVE_REPLAY_CHECK_${address.slice(-8).toLowerCase()}.json`;
const report=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,"utf8")):{schema:"mergeproof-live-replay-check-v1",network:"studionet",contract:address,repository:"dearmore5382/MergeProof-Covenant",pull_request:pr,budget_wei:"1",roles:{sponsor:accounts[0].address,contributor:accounts[1].address},transactions:[],checks:[],started_at:new Date().toISOString()};
report.checks=[...new Map(report.checks.map(item=>[item.name,item])).values()];
const save=()=>writeFileSync(reportPath,JSON.stringify(report,(_,value)=>typeof value==="bigint"?String(value):value,2)+"\n");
const check=(name,pass,detail={})=>{const item={name,pass:Boolean(pass),detail};const index=report.checks.findIndex(x=>x.name===name);if(index<0)report.checks.push(item);else report.checks[index]=item;save();if(!pass)throw Error(name)};
const read=(functionName,args=[])=>reader.readContract({address,functionName,args});
const canon=x=>typeof x==="bigint"?String(x):Array.isArray(x)?`[${x.map(canon).join(",")}]`:x&&typeof x==="object"?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canon(x[k])}`).join(",")}}`:JSON.stringify(x);
async function send(actor,label,functionName,args=[],value=0n,cid){
  let row=report.transactions.find(item=>item.label===label);
  if(!row){row={label,actor:accounts[actor].address,function:functionName,args,value:String(value),before:cid===undefined?await read("get_config"):await read("get_covenant",[cid])};report.transactions.push(row);save();}
  if(!row.hash){const sent=await clients[actor].writeContract({address,functionName,args,value});row.hash=typeof sent==="string"?sent:sent.txId;save();}
  if(!row.receipt)await reader.waitForTransactionReceipt({hash:row.hash,status:TransactionStatus.FINALIZED,interval:5000,retries:240});
  if(!row.receipt||!row.receipt.consensus_data)row.receipt=await reader.getTransaction({hash:row.hash});row.after=row.after||(cid===undefined?await read("get_config"):await read("get_covenant",[cid]));
  const receipts=row.receipt.consensus_data?.leader_receipt||[];const leader=[...receipts].reverse().find(x=>x.mode!=="validator")||receipts.at(-1);const payload=leader?.result?.payload;const readable=typeof payload==="string"?payload:payload?.readable;row.execution={status:row.receipt.status,consensus_votes:row.receipt.consensus_data?.votes||{},leader_execution_result:leader?.execution_result,leader_result_status:leader?.result?.status,leader_result_payload:payload,readable};
  row.receipt={hash:row.hash,status:row.receipt.status,leader_execution_result:leader?.execution_result,leader_result_status:leader?.result?.status,leader_result_payload:payload};
  if(row.returned===undefined&&leader?.result?.status==="return")row.returned=JSON.parse(leader.result.payload.readable);save();return row;
}
try{
  const deployed=Buffer.from(await reader.request({method:"gen_getContractCode",params:[address]}),"base64");
  const sourceHash=createHash("sha256").update(source).digest("hex");
  check("exact source parity",source.equals(deployed),{source_sha256:sourceHash,deployed_sha256:createHash("sha256").update(deployed).digest("hex")});
  const config=await read("get_config");check("v2 contract schema",config.schema==="mergeproof-covenant-v2",config);
  const now=Math.floor(Date.now()/1000);const terms={title:"One-wei live duplicate merge check",contributor:accounts[1].address.toLowerCase(),repo:"dearmore5382/MergeProof-Covenant",base_branch:"main",production_prefix:"contracts/",test_prefix:"tests/",criteria:["The exact merged implementation binds proof to pull request changes.","Regression tests cover the source-bound milestone behavior."],budget:1,partial_bps:0,proof_deadline:now+300,challenge_end:now+600,expires:now+900};
  const created=await send(0,"create one-wei replay covenant","create_covenant",[canon(terms)]);const cid=Number(created.returned);report.covenant_id=cid;save();
  check("covenant id returned",Number.isInteger(cid),{cid});
  await send(0,"fund one wei","fund",[cid],1n,cid);
  await send(1,"submit already-used PR #4","submit_merge",[cid,pr],0n,cid);
  const before=await read("get_covenant",[cid]);
  const verified=await send(0,"verify reused merge SHA","verify_merge",[cid],0n,cid);
  const readable=verified.execution.readable||"";
  if(verified.returned==="SOURCE_UNAVAILABLE"){
    check("GitHub source unavailable: no positive verdict or credit",verified.after.verdict.result.outcome==="SOURCE_UNAVAILABLE"&&Object.keys(verified.after.credits||{}).length===0,{outcome:verified.after.verdict.result.outcome,credits:verified.after.credits});
    report.result="INCONCLUSIVE_SOURCE_UNAVAILABLE";
  }else if(verified.execution.leader_result_status==="return"){
    check("reused merge cannot receive a positive verdict",false,{returned:verified.returned,readable});report.result="UNEXPECTED_POSITIVE_RESULT";
  }else{
    const unchanged=canon(before)===canon(verified.after);
    check("MERGE_ALREADY_USED rejection leaves covenant unchanged",unchanged,{readable,phase_before:before.phase,phase_after:verified.after.phase});
    report.result=readable.includes("MERGE_ALREADY_USED")?"REPLAY_REJECTED":"TRANSACTION_REJECTED";
  }
  report.finished_at=new Date().toISOString();save();console.log(report.result,reportPath);
}catch(error){report.error=String(error);save();throw error}
