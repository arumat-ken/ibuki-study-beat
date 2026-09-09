const SD='/tmp/claude-0/-home-user-ibuki-study-beat/62ce1506-d81d-5029-86c6-f0ad601ba731/scratchpad';
const {chromium}=require(SD+'/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
    args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const ctx=await b.newContext({permissions:['microphone']});
  async function run(label,url){
    const p=await ctx.newPage();
    await p.goto(url);
    await p.waitForTimeout(2500);
    const t=await p.evaluate(()=>window.__child);
    const r=t?JSON.parse(t):null;
    console.log(label.padEnd(40), r?JSON.stringify(r):'(結果が返らなかった)');
    await p.close(); return r;
  }
  console.log('マイクは存在し、許可済み。拒否しうるのは枠の指定だけ。\n');
  const no  = await run('別オリジンの枠・allow指定なし','http://127.0.0.1:8899/parent_x_noallow.html');
  const yes = await run('別オリジンの枠・allow="microphone"','http://127.0.0.1:8899/parent_x_allow.html');
  console.log('\n---- 結論 ----');
  const f=(r)=>r?(r.gum==='OK'?'使えた':'使えなかった → '+r.gumErr):'不明';
  console.log('allow なし :', f(no));
  console.log('allow あり :', f(yes));
  if(no&&yes){
    console.log('\nallowなしが自己申告した値: policy='+no.policy+' / permission='+no.perm);
    console.log('allowありが自己申告した値: policy='+yes.policy+' / permission='+yes.perm);
    console.log('\n枠のallow指定だけで結果が変わることを証明できたか:',
      (no.gum==='FAIL'&&yes.gum==='OK')?'YES':'NO');
  }
  await b.close();
})();
