import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import * as actions from '../actions/index.mjs';

const exec = promisify(execFile);
const runner = fileURLToPath(new URL('../scripts/get-pdf.mjs',import.meta.url));
const pdf = Buffer.from('%PDF-1.7\nmock article bytes\n%%EOF');

async function fixture(fn, options={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'thu-v4-test-'));
  const events=[]; let newTab=false;
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks).toString();
    const send=x=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(x));};
    events.push({route:url.pathname,body,target:url.searchParams.get('target')});
    if(url.pathname==='/targets')return send([{targetId:'article',url:'https://article.example'}, {targetId:'old-cdn',url:'https://pdf.sciencedirectassets.com/old'},...(newTab?[{targetId:'fresh-cdn',url:'https://pdf.sciencedirectassets.com/fresh'}]:[])]);
    if(url.pathname==='/new'){fs.writeFileSync(path.join(dir,'instant.pdf'),pdf);return send({targetId:'native'});}
    if(url.pathname==='/info')return send({ready:'complete'});
    if(url.pathname==='/close')return send({ok:true});
    if(url.pathname==='/eval'){
      if(body.includes('delete window.__getPdfBytes'))return send({value:true});
      if(options.hang){await new Promise(r=>setTimeout(r,500));if(!res.destroyed)send({value:{ok:true}});return;}
      if(body.includes('return btoa(s)')){
        if(options.chunkFail){res.statusCode=500;return send({error:'transfer failed'});}
        const match=body.match(/subarray\((\d+),(\d+)\)/);
        return send({value:pdf.subarray(Number(match[1]),Number(match[2])).toString('base64')});
      }
      if(body.includes('await fetch('))return send({value:{ok:true,status:200,type:options.html?'text/html':'application/pdf',size:pdf.length,head:Array.from(options.html?Buffer.from('<!doctype'):pdf.subarray(0,8))}});
      newTab=true;
      return send({value:{mode:'newtab-fetch',publisher:'sciencedirect',found:true,clicked:true,newTabHostContains:'sciencedirectassets'}});
    }
    res.statusCode=404;send({error:'unknown route'});
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const proxy=`http://127.0.0.1:${server.address().port}`;
  try{await fn({dir,events,run:args=>exec(process.execPath,[runner,'--target','article','--proxy',proxy,'--download-dir',dir,'--out',path.join(dir,'result.pdf'),...args])});}
  finally{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
}

test('EBSCO fetch stays on viewer; output bytes and no premature tab close',()=>fixture(async({dir,events,run})=>{
  await run(['--plan',JSON.stringify({mode:'fetch',url:'https://content.ebscohost.com/cds/retrieve?content=test',credentials:'omit'})]);
  assert.deepEqual(fs.readFileSync(path.join(dir,'result.pdf')),pdf);
  assert.equal(events.some(x=>x.route==='/new'),false);
  assert.ok(events.find(x=>x.body.includes('credentials:"omit"')));
}));

test('newtab fetch excludes old CDN tab and transfers before close',()=>fixture(async({events,run})=>{
  await run(['--publisher','sciencedirect','--arg','pii=S0002961018300801']);
  const transfer=events.findIndex(x=>x.body.includes('return btoa(s)'));
  const close=events.findIndex(x=>x.route==='/close'&&x.target==='fresh-cdn');
  assert.ok(transfer>=0&&close>transfer);
  assert.equal(events[transfer].target,'fresh-cdn');
  assert.equal(events.some(x=>x.route==='/close'&&x.target==='old-cdn'),false);
}));

test('snapshot precedes native trigger, including instantaneous download',()=>fixture(async({dir,run})=>{
  await run(['--plan',JSON.stringify({mode:'navigate-download',url:'https://publisher.example/pdf'})]);
  assert.deepEqual(fs.readFileSync(path.join(dir,'result.pdf')),pdf);
}));

test('HTTP 200 HTML is rejected without final/partial PDF',()=>fixture(async({dir,run})=>{
  await assert.rejects(run(['--plan',JSON.stringify({mode:'fetch',url:'https://publisher.example/pdf'})]),/not_pdf_response/);
  assert.equal(fs.existsSync(path.join(dir,'result.pdf')),false);
  assert.equal(fs.existsSync(path.join(dir,'result.pdf.partial')),false);
},{html:true}));

test('failed transfer cleans temporary output but retains failed tab',()=>fixture(async({dir,events,run})=>{
  await assert.rejects(run(['--publisher','sciencedirect']),/transfer failed/);
  assert.equal(fs.existsSync(path.join(dir,'result.pdf')),false);
  assert.equal(events.some(x=>x.route==='/close'),false);
},{chunkFail:true}));

test('cumulative deadline aborts stalled request; no next-paper action',()=>fixture(async({events,run})=>{
  const start=Date.now();
  await assert.rejects(run(['--plan',JSON.stringify({mode:'fetch',url:'https://publisher.example/pdf'}),'--timeout','0.1']),/attempt_timeout/);
  assert.ok(Date.now()-start<2000);
  assert.ok(events.filter(x=>x.body.includes('await fetch(')).length<=1);
  assert.equal(events.some(x=>x.route==='/new'),false);
},{hang:true}));

test('publisher discovery uses existing reader CDS without a click',()=>{
  const cds='https://content.ebscohost.com/cds/retrieve?content=valid';
  const plan=vm.runInNewContext(actions.get('ebsco').build({}),{performance:{getEntriesByType:()=>[{name:cds}]}});
  return Promise.resolve(plan).then(p=>{assert.equal(p.url,cds);assert.equal(p.credentials,'omit');assert.equal(p.mode,'fetch');});
});

test('Royal Society does not select a related paper PDF',()=>{
  const doi='10.1098/rsos.191255';
  const plan=vm.runInNewContext(actions.get('royalsociety').build({doi}),{document:{querySelectorAll:()=>[{href:'https://royalsocietypublishing.org/rsos/article-pdf/doi/10.1098/rsos.other/1/a.pdf'},{href:`https://royalsocietypublishing.org/rsos/article-pdf/doi/${doi}/974327/rsos.191255.pdf`}]}});
  assert.ok(plan.url.includes(doi));
});

test('SD selects actual matching PDF link without clicking or fetching',()=>{
  const links=[{href:'https://www.sciencedirect.com/science/article/pii/OTHER/pdfft',textContent:'View PDF'}, {href:'https://www.sciencedirect.com/science/article/pii/CURRENT/pdfft?pid=actual',textContent:'View\nPDF',click:()=>assert.fail('must not click')}];
  const plan=vm.runInNewContext(actions.get('sciencedirect').build({pii:'CURRENT'}),{document:{querySelectorAll:()=>links}});
  assert.equal(plan.mode,'navigate-download');assert.equal(plan.url,links[1].href);
});

test('successful native PDF saved before paper/download tabs close',()=>fixture(async({dir,events,run})=>{
  await run(['--plan',JSON.stringify({mode:'navigate-download',url:'https://publisher.example/pdf'})]);
  assert.deepEqual(fs.readFileSync(path.join(dir,'result.pdf')),pdf);
  assert.ok(events.some(x=>x.route==='/close'&&x.target==='native'));
  assert.ok(events.some(x=>x.route==='/close'&&x.target==='article'));
  assert.equal(events.some(x=>x.route==='/close'&&x.target==='old-cdn'),false);
}));

test('keep-target preserves authentication tab, closes successful native download tab',()=>fixture(async({events,run})=>{
  await run(['--keep-target','--plan',JSON.stringify({mode:'navigate-download',url:'https://publisher.example/pdf'})]);
  assert.ok(events.some(x=>x.route==='/close'&&x.target==='native'));
  assert.equal(events.some(x=>x.route==='/close'&&x.target==='article'),false);
}));
