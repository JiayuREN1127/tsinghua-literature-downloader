#!/usr/bin/env node
// Compatibility entry point; v4 shares the bounded, atomic get-pdf runner.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

async function main() {
  const args = {};
  for (let i=2;i<process.argv.length;i++) {
    const k=process.argv[i];
    if (['--help','-h','--close','--allow-non-pdf'].includes(k)) args[k]=true;
    else if (['--url','--target','--out','--proxy','--timeout','--chunk-size'].includes(k)) args[k]=process.argv[++i];
    else throw new Error('unknown argument '+k);
  }
  if(args['--help']||args['-h']) { console.log('browser_pdf_downloader.mjs --target <tab> [--url <PDF-url>] --out <file.pdf> [--timeout 120]\nPrefer get-pdf.mjs --publisher for fixed database strategies.'); return; }
  if(!args['--out']||(!args['--target']&&!args['--url'])) throw new Error('out and target/url required');
  const budget=Number(args['--timeout']||120);
  if(!(budget>0&&budget<=120))throw new Error('timeout must be remaining seconds, >0 and <=120');
  const deadline=Date.now()+budget*1000,proxy=args['--proxy']||'http://127.0.0.1:3456';
  let target=args['--target'],owned=false;
  const request=async(endpoint,body)=>{
    const remaining=deadline-Date.now();if(remaining<=0)throw new Error('attempt_timeout: hand off to user');
    const r=await fetch(new URL(endpoint,proxy),{method:body===undefined?'GET':'POST',body,signal:AbortSignal.timeout(Math.max(1,remaining))});
    const v=await r.json();if(!r.ok||v.error)throw new Error('browser request failed');return v;
  };
  try {
    if(!target){target=(await request('/new',args['--url'])).targetId;owned=true;}
    let info=await request('/info?target='+encodeURIComponent(target));
    while(info.ready!=='complete') { await new Promise(r=>setTimeout(r,250)); info=await request('/info?target='+encodeURIComponent(target)); }
    const seconds=(deadline-Date.now())/1000;if(seconds<=0)throw new Error('attempt_timeout: hand off to user');
    const plan={mode:'fetch',url:args['--url']||info.url,credentials:'include'};
    const call=[fileURLToPath(new URL('./get-pdf.mjs',import.meta.url)),'--target',target,'--out',args['--out'],'--proxy',proxy,'--timeout',String(seconds),'--plan',JSON.stringify(plan)];
    if(args['--allow-non-pdf'])call.push('--allow-non-pdf');
    if(args['--chunk-size'])call.push('--chunk-size',args['--chunk-size']);
    const r=await promisify(execFile)(process.execPath,call,{maxBuffer:1024*1024});process.stdout.write(r.stdout);
  } finally {
    if(owned&&target)await fetch(new URL('/close?target='+encodeURIComponent(target),proxy),{signal:AbortSignal.timeout(1500)}).catch(()=>{});
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
