/*
 * Public review excerpt from mio-companion commit 15da3da.
 * Mechanical line extraction only; no API keys, localStorage values, images or personal data.
 * This is not a standalone program. Line numbers refer to app/index.html at the source commit.
 */

/* ===== UI state: idle / listen / think / speak (source lines 545-565) ===== */
  rlog(text.slice(0,60));
}

var lastSys='';
function sysLine(text){
  if(text===lastSys) return;   /* the same advice four times is noise */
  lastSys=text;
  if(seeded){ logEl.innerHTML=''; seeded=false; }
  var li=document.createElement('li'); li.className='turn sys';
  var p=document.createElement('p'); p.className='said'; p.textContent=text;
  li.appendChild(p); logEl.appendChild(li); logEl.scrollTop=logEl.scrollHeight;
}

/* ================= status pill ================= */
var pill=document.getElementById('pill'), pillText=document.getElementById('pilltext');
var STATE={idle:'待機中',listen:'聞いています',think:'考えています',speak:'話しています',off:'使えません'};
function setState(s){ pill.dataset.s=s; pillText.textContent=STATE[s]||s; }

/* ================= face ================= */
var canvas=document.getElementById('face'), fx=canvas.getContext('2d');


/* ===== Gemini TTS, PCM decoding, Web Audio playback, speechSynthesis fallback (source lines 2453-2820) ===== */
var jaVoice=null, moraPerSec=7.4, speaking=false, curEmotion='neutral';
var VOICE={
  neutral  :[1.00,1.06], relaxed:[0.96,1.03], happy:[1.07,1.13],
  sad      :[0.92,0.98], angry  :[1.09,1.00], surprised:[1.12,1.17]
};

var VOICE_ENGINE_NAME = 'mio.voiceEngine';
var TTS_QUALITY_NAME  = 'mio.ttsQuality';
var TTS_VOICE_NAME    = 'mio.ttsVoice';
var TTS_RATE_NAME     = 'mio.ttsRate';
var TTS_MODEL_NAME    = 'mio.ttsModel';

var ttsAudioCtx = null;
var currentAudioSource = null;
var lastTtsSuccessAt = null;
var lastTtsError = null;
var lastTtsModelUsed = '未実行';
var ttsFreshness = '未取得';

function savedVoiceEngine(){
  try{
    var v=localStorage.getItem(VOICE_ENGINE_NAME);
    return (v==='device'||v==='gemini') ? v : 'gemini';
  }catch(e){ return 'gemini'; }
}
function savedTtsQuality(){
  try{
    var q=localStorage.getItem(TTS_QUALITY_NAME);
    return (q==='high'||q==='fast') ? q : 'fast';
  }catch(e){ return 'fast'; }
}
function savedTtsVoice(){
  try{
    var v=localStorage.getItem(TTS_VOICE_NAME);
    return (v&&/^[A-Za-z0-9_-]+$/.test(v)) ? v : 'Aoede';
  }catch(e){ return 'Aoede'; }
}
function savedTtsRate(){
  try{
    var r=parseFloat(localStorage.getItem(TTS_RATE_NAME)||'1.0');
    return (isNaN(r)||r<0.5||r>2.0)?1.0:r;
  }catch(e){ return 1.0; }
}
function savedTtsModel(){
  var m='';
  try{ m=localStorage.getItem(TTS_MODEL_NAME)||''; }catch(e){}
  return /^[a-z0-9._-]+$/i.test(m)?m:'';
}
function saveVoiceEngine(v){
  try{ localStorage.setItem(VOICE_ENGINE_NAME, v); }catch(e){}
}
function saveTtsQuality(q){
  try{ localStorage.setItem(TTS_QUALITY_NAME, q); }catch(e){}
}
function saveTtsVoice(v){
  try{ localStorage.setItem(TTS_VOICE_NAME, v); }catch(e){}
}
function saveTtsRate(r){
  try{ localStorage.setItem(TTS_RATE_NAME, String(r)); }catch(e){}
}
function saveTtsModel(m){
  try{ localStorage.setItem(TTS_MODEL_NAME, m); }catch(e){}
}

function resolveTtsModel(models, quality){
  if(!models||!models.length) return '';
  var saved=savedTtsModel();
  if(saved && models.indexOf(saved)>=0 && /(?:tts|speech)/i.test(saved)) return saved;

  if(quality==='high'){
    var highCandidates = ['gemini-3.8-flash-tts','gemini-2.5-pro-preview-tts','gemini-3.1-flash-tts-preview','gemini-2.5-flash-preview-tts'];
    for(var i=0; i<highCandidates.length; i++){
      if(models.indexOf(highCandidates[i])>=0) return highCandidates[i];
    }
  }
  var fastCandidates = ['gemini-3.8-flash-lite-tts','gemini-3.8-flash-tts','gemini-2.5-flash-preview-tts','gemini-3.1-flash-tts-preview','gemini-2.5-pro-preview-tts'];
  for(var j=0; j<fastCandidates.length; j++){
    if(models.indexOf(fastCandidates[j])>=0) return fastCandidates[j];
  }
  var ttsOnly=models.filter(function(name){ return /(?:tts|speech)/i.test(name); });
  return ttsOnly[0]||'';
}

function getAudioContext(){
  if(!ttsAudioCtx){
    var AC=window.AudioContext||window.webkitAudioContext;
    if(AC) ttsAudioCtx=new AC();
  }
  if(ttsAudioCtx && ttsAudioCtx.state==='suspended'){
    ttsAudioCtx.resume().catch(function(){});
  }
  return ttsAudioCtx;
}

function decodeBase64ToAudioBuffer(ctx, base64Data, mimeType){
  var binary = atob(base64Data);
  var len = binary.length;
  var bytes = new Uint8Array(len);
  for(var i=0; i<len; i++) bytes[i] = binary.charCodeAt(i);

  var isPcm = (!mimeType || /pcm|L16/i.test(mimeType));
  if(isPcm){
    var rate = 24000;
    var rateMatch = mimeType ? mimeType.match(/rate=(\d+)/i) : null;
    if(rateMatch) rate = parseInt(rateMatch[1], 10) || 24000;
    var int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength/2));
    var buffer = ctx.createBuffer(1, int16.length, rate);
    var channel = buffer.getChannelData(0);
    for(var j=0; j<int16.length; j++){
      channel[j] = int16[j] / 32768.0;
    }
    return Promise.resolve(buffer);
  }

  return new Promise(function(resolve, reject){
    ctx.decodeAudioData(bytes.buffer.slice(0), resolve, function(err){
      reject(err || new Error('decodeAudioData failed'));
    });
  });
}

var TTS_EMOTION_HINTS = {
  neutral  : '自然で落ち着いた親しみやすい口調で',
  relaxed  : '穏やかで優しい、ゆったりとした声で',
  happy    : '明るく楽しそうに、少し弾むような声で',
  sad      : '少し控えめで切ない、しっとりとした声で',
  angry    : 'キリッとした強めの口調で',
  surprised: '少し驚いたように、息を呑むようなニュアンスで'
};

async function synthesizeGeminiAudio(text, emotion){
  var key = savedGeminiKey();
  if(!key) throw {code:'missing_key'};
  var quality = savedTtsQuality();
  var model = resolveTtsModel(availableGeminiModels, quality);
  if(!model){
    await refreshGeminiModels();
    model = resolveTtsModel(availableGeminiModels, quality);
  }
  if(!model) throw {code:'model_unavailable'};

  var voiceName = savedTtsVoice();
  var emoHint = TTS_EMOTION_HINTS[emotion] || TTS_EMOTION_HINTS.neutral;

  var prompt = [
    '指示: ' + emoHint + '、次の日本語の文を自然に読み上げてください。前置き・解説・挨拶等の余計な言葉は一切加えず、指定された文のみを音声として出力してください。',
    '文: ' + text
  ].join('\n');

  var ctl = new AbortController();
  var timer = setTimeout(function(){ ctl.abort(); }, 18000);
  var response;
  try{
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceName
              }
            }
          }
        }
      })
    });
  }catch(e){
    clearTimeout(timer);
    if(e && e.name==='AbortError') throw {code:'timeout', message:'タイムアウト'};
    throw {code:'upstream_error', message:(e && e.message) || '通信失敗'};
  }
  clearTimeout(timer);

  if(response.status===401||response.status===403) throw {code:'auth', status:response.status};
  if(response.status===429) throw {code:'rate_limited', status:429};
  if(!response.ok) throw {code:'upstream_error', status:response.status};

  var data = await response.json();
  var candidate = data && data.candidates && data.candidates[0];
  if(!candidate) throw {code:'refused'};

  var parts = (candidate.content && candidate.content.parts) || [];
  var audioPart = null;
  for(var i=0; i<parts.length; i++){
    if(parts[i].inlineData && parts[i].inlineData.data){
      audioPart = parts[i].inlineData;
      break;
    }
  }
  if(!audioPart) throw {code:'empty_audio', message:'音声データが含まれていません'};

  var ctx = getAudioContext();
  if(!ctx) throw {code:'no_audiocontext', message:'Web Audioが使えません'};

  var buffer = await decodeBase64ToAudioBuffer(ctx, audioPart.data, audioPart.mimeType);
  return { buffer: buffer, model: model };
}

function playGeminiAudio(buffer, text, kana, gestures, modelUsed, myId, done){
  if(currentAudioSource){
    try{ currentAudioSource.stop(); }catch(e){}
    currentAudioSource = null;
  }
  var ctx = getAudioContext();
  var source = ctx.createBufferSource();
  source.buffer = buffer;
  var rate = savedTtsRate();
  source.playbackRate.value = rate;
  source.connect(ctx.destination);

  var durationSec = buffer.duration / Math.max(0.1, rate);
  visSeq = toVisemes(kana || text);
  speaking = true;
  visStart = performance.now();
  setState('speak');

  if(durationSec > 0.3 && visSeq.length > 2){
    moraPerSec = Math.max(3.5, Math.min(16, visSeq.length / durationSec));
    setDiag('話す速さ', moraPerSec.toFixed(1) + ' 拍/秒');
  }

  scheduleHandGestures(gestures, visSeq.length, myId, durationSec);

  lastTtsModelUsed = modelUsed;
  lastTtsSuccessAt = new Date().toTimeString().slice(0, 8);
  lastTtsError = null;
  setDiag('音声方式', 'Gemini自然音声 (' + (savedTtsQuality()==='high'?'高品質':'高速') + ' / ' + savedTtsVoice() + ')', 'ok');
  setDiag('実際に使ったTTSモデル', modelUsed, 'ok');
  setDiag('TTS最終成功', lastTtsSuccessAt, 'ok');
  setDiag('TTSエラー', 'なし');

  var settled = false;
  function settle(){
    if(settled) return;
    settled = true;
    if(currentAudioSource === source) currentAudioSource = null;
    if(myId !== utterSeq) return;
    speaking = false;
    visTarget = 'x';
    setState('idle');
    dismissHands(myId);
    closeEchoWindow();
    if(handsFree) keepFocus();
    done && done();
  }

  source.onended = settle;
  currentAudioSource = source;
  source.start(0);
}

function pickVoice(){
  var vs=window.speechSynthesis?speechSynthesis.getVoices():[];
  var ja=vs.filter(function(v){ return /^ja/i.test(v.lang); });
  jaVoice = ja[0]||null;
  if(jaVoice) setDiag('端末音声', jaVoice.name, 'ok');
  else if(vs.length) setDiag('端末音声','日本語の声が見つからない','bad');
  else setDiag('端末音声','声を読み込み中');
}
if(window.speechSynthesis){
  pickVoice();
  speechSynthesis.onvoiceschanged=pickVoice;
}else{
  setDiag('端末音声','この端末では使えない','bad');
}

var visSeq=['x'], visStart=0, utterSeq=0;

function stopSpeaking(){
  utterSeq++;
  if(currentAudioSource){
    try{ currentAudioSource.stop(); }catch(e){}
    currentAudioSource = null;
  }
  try{ if(window.speechSynthesis) speechSynthesis.cancel(); }catch(e){}
  speaking=false; visTarget='x';
  resetHands();
  closeEchoWindow();
}

function speakDevice(text,kana,gestures,myId,done){
  if(!window.speechSynthesis){
    speaking=false; visTarget='x'; setState('idle'); done&&done(); return;
  }
  var settled=false, t0=0;
  var u=new SpeechSynthesisUtterance(text);
  u.lang='ja-JP'; if(jaVoice) u.voice=jaVoice;
  var V=VOICE[curEmotion]||VOICE.neutral;
  var userRate=savedTtsRate();
  u.rate=Math.max(0.6, Math.min(1.8, V[0]*userRate));
  u.pitch=V[1];
  visSeq=toVisemes(kana||text);
  u.onstart=function(){
    speaking=true; t0=performance.now(); visStart=t0; setState('speak');
    scheduleHandGestures(gestures,visSeq.length,myId);
  };
  function settle(){
    if(settled) return; settled=true;
    if(myId!==utterSeq) return;
    speaking=false; visTarget='x'; setState('idle'); dismissHands(myId);
    closeEchoWindow();
    if(handsFree) keepFocus();
    if(t0){
      var secs=(performance.now()-t0)/1000;
      if(secs>0.4&&visSeq.length>3){
        var measured=visSeq.length/secs;
        moraPerSec=moraPerSec*0.7+Math.min(12,Math.max(4,measured))*0.3;
        setDiag('話す速さ',moraPerSec.toFixed(1)+' 拍/秒');
      }
    }
    done&&done();
  }
  u.onend=settle; u.onerror=settle;
  speechSynthesis.speak(u);
}

function speak(text,kana,gestures,done){
  if(typeof gestures==='function'){ done=gestures; gestures=[]; }
  var myId=++utterSeq;
  getAudioContext();

  var engine=savedVoiceEngine();
  var hasKey=!!savedGeminiKey();

  if(engine==='gemini' && hasKey){
    synthesizeGeminiAudio(text, curEmotion)
    .then(function(res){
      if(myId!==utterSeq) return;
      playGeminiAudio(res.buffer, text, kana, gestures, res.model, myId, done);
    })
    .catch(function(err){
      if(myId!==utterSeq) return;
      var code=(err && err.code) || 'unknown';
      var status=err && err.status;
      var reason=code;
      if(status===429) reason='429 レート制限';
      else if(status===401||status===403) reason='認証エラー('+status+')';
      else if(code==='timeout') reason='タイムアウト';
      else if(code==='cors') reason='CORSエラー';
      else if(code==='model_unavailable') reason='TTSモデル利用不可';

      lastTtsError=reason;
      setDiag('音声方式', '端末読み上げ（Gemini TTS ' + reason + ' のため自動切替）', 'bad');
      setDiag('TTSエラー', reason + ' → 端末音声へ自動切替', 'bad');
      rlog('Gemini TTS失敗 [' + reason + '] → 端末音声(speechSynthesis)へ自動フォールバック');

      speakDevice(text, kana, gestures, myId, done);
    });
  } else {
    if(engine==='gemini' && !hasKey){
      setDiag('音声方式', '端末読み上げ（APIキー未設定）', 'bad');
      setDiag('TTSエラー', 'APIキー未設定', 'bad');
    } else {
      setDiag('音声方式', '端末の読み上げ（設定）', '');
      setDiag('TTSエラー', 'なし');
    }
    speakDevice(text, kana, gestures, myId, done);
  }
}


/* ===== SpeechRecognition lifecycle and automatic restart (source lines 2822-3025) ===== */
var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
var rec=null, listening=false, noSpeechRetries=0, everHeard=false;
var selftile=document.getElementById('selftile');
var recLogEl=document.getElementById('reclog'), recLines=[];
function rlog(m){
  recLines.push(new Date().toTimeString().slice(0,8)+'  '+m);
  if(recLines.length>40) recLines.shift();
  recLogEl.textContent=recLines.join('\n');
  recLogEl.scrollTop=recLogEl.scrollHeight;
}
function selfText(t,dim){
  selftile.innerHTML='';
  var el=document.createElement(dim?'span':'div');
  el.textContent=t; selftile.appendChild(el);
}

/* Microphone policy and the actual audio path are checked separately. */
var levelBar=document.getElementById('levelbar');
function probePermission(){
  try{
    var policy=document.permissionsPolicy||document.featurePolicy;
    if(policy&&policy.allowsFeature){
      var ok=policy.allowsFeature('microphone');
      setDiag('枠のマイク許可', ok?'あり':'なし（枠が塞いでいる）', ok?'ok':'bad');
      rlog('Permissions Policy microphone = '+ok);
    }
  }catch(e){}
  try{
    if(navigator.permissions&&navigator.permissions.query){
      navigator.permissions.query({name:'microphone'}).then(function(st){
        /* permissions.query may still say granted when an iframe policy
           blocks the microphone. It is displayed only as OS/browser state;
           policy.allowsFeature above is the frame-policy authority. */
        var label = st.state==='granted' ? '許可'
                  : st.state==='denied' ? '拒否'
                  : '未設定';
        setDiag('OS・ブラウザの許可', label,
                st.state==='denied'?'bad':(st.state==='granted'?'ok':''));
        rlog('permissions.query microphone = '+st.state);
      }).catch(function(){ rlog('permissions.query は使えない'); });
    }
  }catch(e){}
}

document.getElementById('miccheck').addEventListener('click',function(){
  var btn=this;
  probePermission();
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    setDiag('マイク','この端末では開けない','bad'); rlog('getUserMedia が無い'); return;
  }
  btn.disabled=true; btn.textContent='声を出してください…';
  setDiag('マイク','許可を待っています');
  navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
    setDiag('マイク','許可された','ok'); rlog('マイク許可 OK');
    var AC=window.AudioContext||window.webkitAudioContext;
    var ctx=new AC();
    if(ctx.state==='suspended'&&ctx.resume) ctx.resume();
    var an=ctx.createAnalyser(); an.fftSize=1024;
    ctx.createMediaStreamSource(stream).connect(an);
    var buf=new Float32Array(an.fftSize), peak=-90, t0=performance.now();
    (function tick(){
      an.getFloatTimeDomainData(buf);
      var sum=0; for(var i=0;i<buf.length;i++) sum+=buf[i]*buf[i];
      var db=20*Math.log10(Math.max(Math.sqrt(sum/buf.length),1e-7));
      if(db>peak) peak=db;
      levelBar.style.width=Math.round(Math.min(100,Math.max(0,(db+60)/60*100)))+'%';
      if(performance.now()-t0<3000){ requestAnimationFrame(tick); return; }
      levelBar.style.width='0%';
      stream.getTracks().forEach(function(t){ t.stop(); });
      if(ctx.close) ctx.close();
      btn.disabled=false; btn.textContent='マイクを確認';
      var heard=peak>-45;
      setDiag('マイク入力', peak.toFixed(0)+' dBFS '+(heard?'（声が届いています）':'（ほぼ無音）'), heard?'ok':'bad');
      rlog('入力レベル最大 '+peak.toFixed(1)+' dBFS');
      sysLine(heard
        ? 'マイクは届いています。聞き取れないなら原因は音声認識のほうです。'
        : 'マイクからほとんど音が入っていません。本体の消音や、他のアプリがマイクを使っていないか確認してください。');
    })();
  }).catch(function(err){
    btn.disabled=false; btn.textContent='マイクを確認';
    setDiag('マイク', err.name, 'bad');
    rlog('getUserMedia 失敗: '+err.name+' / '+(err.message||''));
    if(err.name==='NotAllowedError'){
      var framed=(window.self!==window.top);
      goDictation(framed
        ? '埋め込み枠にマイクが渡されていません。自己ホストURLを直接開いてください。'
        : 'このサイトのマイク利用が許可されていません。ブラウザのサイト設定でマイクを許可してください。');
    }else{
      sysLine(err.name==='NotFoundError' ? 'マイクが見つかりません。' : 'マイクを開けませんでした（'+err.name+'）。');
    }
  });
});

var pendingListen=false;
function beginListen(){
  if(listening||pendingListen) return;   /* two rec.start() calls throw */
  if(!SR){
    rlog('SpeechRecognition が無い');
    sysLine('この端末では音声認識が使えません。下の入力欄から文字で送ってください。');
    return;
  }
  /* iOS keeps the audio session in playback while it is speaking; starting
     recognition on top of that fails silently, so stop and let it settle. */
  var wasSpeaking=false;
  try{ wasSpeaking=!!(window.speechSynthesis&&speechSynthesis.speaking); }catch(e){}
  stopSpeaking();
  pendingListen=true;
  setTimeout(function(){ pendingListen=false; startListening(); }, wasSpeaking?350:0);
}

var micBlocked=false;
function goDictation(reason){
  if(micBlocked) return;
  micBlocked=true;
  var cb=document.getElementById('autolisten');
  cb.checked=false; cb.disabled=true;
  /* If the viewer asked for continuous listening, turning it back off has to
     be visible: a switch left on while the thing it switches on is refused is
     the same silence they complained about. */
  if(window.micModeOff && window.micModeOn && micModeOn()) micModeOff('マイクを開始できない',reason);
  setDiag('聞き取りの方法','文字入力へ切り替え');
  sysLine(reason+'マイクを直すまでは、下の入力欄から文字で送れます。');
  document.getElementById('typed').focus();
}

var REC_ERR={
  'not-allowed':'',
  'service-not-allowed':'',
  'audio-capture':'マイクを開けませんでした。他のアプリが使っていないか確認してください。',
  'network':'音声認識の通信に失敗しました。回線を確認してもう一度どうぞ。',
  'language-not-supported':'この端末の音声認識が日本語に対応していません。',
  'no-speech':'',
  'aborted':''
};

function startListening(){
  try{
    rec=new SR();
    rec.lang='ja-JP'; rec.interimResults=true; rec.continuous=true; rec.maxAlternatives=1;
    var finalText='', gotAny=false, errCode='';
    rec.onstart=function(){
      listening=true; setState('listen'); selfText('…',true);
      talkBtn.dataset.live='1'; talkBtn.textContent='聞いています（押すと終了）';
      rlog('聞き取り開始');
    };
    rec.onaudiostart=function(){ rlog('音声の取り込み開始'); };
    rec.onspeechstart=function(){ gotAny=true; rlog('声を検出'); };
    rec.onresult=function(e){
      gotAny=true;
      var interim='';
      for(var i=e.resultIndex;i<e.results.length;i++){
        var r=e.results[i];
        if(r.isFinal) finalText+=r[0].transcript; else interim+=r[0].transcript;
      }
      var shown=finalText+interim;
      selfText(shown||'…', !shown);
      if(shown) rlog('認識: '+shown.slice(0,40));
      if(finalText){ try{ rec.stop(); }catch(stopError){} }
    };
    rec.onerror=function(e){
      errCode=e.error||'unknown';
      rlog('エラー: '+errCode);
      if(errCode!=='no-speech'&&errCode!=='aborted') setDiag('音声認識','エラー: '+errCode,'bad');
    };
    rec.onend=function(){
      listening=false;
      talkBtn.dataset.live='0'; talkBtn.textContent='話す';
      var said=finalText.trim();
      rlog('終了 / 結果='+(said?('「'+said.slice(0,30)+'」'):'なし')+(errCode?(' / '+errCode):''));
      if(said){
        everHeard=true; noSpeechRetries=0;
        setDiag('音声認識','聞き取れています','ok');
        selfText(said); ask(said); return;
      }
      setState('idle');
      if(errCode==='not-allowed'||errCode==='service-not-allowed'){
        var framed=(window.self!==window.top);
        goDictation(framed
          ? '埋め込み枠にマイクが渡されていません。自己ホストURLを直接開いてください。'
          : 'このサイトのマイク利用が許可されていません。ブラウザのサイト設定でマイクを許可してください。');
        return;
      }
      var msg=REC_ERR[errCode];
      if(msg){ sysLine(msg); return; }
      /* In a live call, silence is normal. Restart with a short delay while
         the call and automatic listening are still enabled. */
      if(started && autoListen()){
        noSpeechRetries++; rlog('待ち受けを再開');
        selfText('聞いています…',true);
        setTimeout(beginListen,700); return;
      }
      noSpeechRetries=0;
      selfText(gotAny?'うまく聞き取れませんでした':'声が届きませんでした。「マイクを確認」を試してください',true);
      if(!gotAny && !everHeard) sysLine('声が届いていません。「マイクを確認」を押して、バーが動くか見てください。');
    };
    rec.start();
  }catch(err){
    listening=false;
    talkBtn.dataset.live='0'; talkBtn.textContent='話す';
    rlog('起動できない: '+err.name+' / '+(err.message||''));
    setDiag('音声認識','起動できない: '+err.name,'bad');
    sysLine('音声認識を起動できませんでした（'+err.name+'）。下の入力欄から文字で送れます。');
  }
}

/* ===== Gemini model selection, structured JSON request and parser (source lines 3065-3295) ===== */
}

var ERR={
  missing_key:'Gemini APIキーが未設定です。「顔と声の設定」から入力してください。',
  auth:'APIキーを確認できませんでした。キーを入れ直してください。',
  rate_limited:'呼び出しが混み合っています。少し待ってからもう一度どうぞ。',
  invalid_json:'返事の形が崩れました。もう一度話しかけてください。',
  empty_completion:'返事が空でした。もう一度話しかけてください。',
  refused:'その話題には答えられないそうです。',
  timeout:'通信に時間がかかりすぎました。回線を確認してもう一度どうぞ。',
  upstream_error:'Gemini APIとの通信に失敗しました。もう一度どうぞ。'
};
ERR.cors='ブラウザからGemini APIの応答を読めません。CORSまたは通信環境を確認してください。';
ERR.no_models='このAPIキーで会話に使えるGeminiモデルが見つかりません。';
ERR.model_unavailable='選んだモデルは現在このAPIキーでは使えません。モデル一覧を更新してください。';

function savedGeminiKey(){
  try{ return localStorage.getItem(GEMINI_KEY_NAME)||''; }catch(e){ return ''; }
}
function savedGeminiModel(){
  var m='';
  try{ m=localStorage.getItem(GEMINI_MODEL_NAME)||''; }catch(e){}
  return /^[a-z0-9._-]+$/i.test(m)?m:'';
}
function preferredGeminiModel(models){
  var saved=savedGeminiModel();
  var policy='';
  try{ policy=localStorage.getItem(GEMINI_POLICY_NAME)||''; }catch(e){}
  /* v0.6.1 changes the recommended conversation model. Apply that choice
     once to existing installations, then preserve any later manual choice. */
  if(policy!==GEMINI_POLICY_VERSION && models.indexOf(GEMINI_MODEL_DEFAULT)>=0){
    try{
      localStorage.setItem(GEMINI_POLICY_NAME,GEMINI_POLICY_VERSION);
      localStorage.setItem(GEMINI_MODEL_NAME,GEMINI_MODEL_DEFAULT);
    }catch(e){}
    return GEMINI_MODEL_DEFAULT;
  }
  if(saved&&models.indexOf(saved)>=0) return saved;
  if(models.indexOf(GEMINI_MODEL_DEFAULT)>=0) return GEMINI_MODEL_DEFAULT;
  var stable=models.filter(function(name){ return /^gemini-\d+(?:\.\d+)+-flash$/.test(name); });
  stable.sort(function(a,b){
    var av=a.match(/[\d.]+/)[0].split('.').map(Number), bv=b.match(/[\d.]+/)[0].split('.').map(Number);
    for(var i=0;i<Math.max(av.length,bv.length);i++){
      var d=(bv[i]||0)-(av[i]||0); if(d) return d;
    }
    return 0;
  });
  return stable[0]||models[0]||'';
}
function paintGeminiModels(models,selected){
  var select=document.getElementById('geminimodel');
  select.innerHTML='';
  if(!models.length){
    var empty=document.createElement('option'); empty.value=''; empty.textContent='APIキー保存後に一覧を取得';
    select.appendChild(empty); select.disabled=true; return;
  }
  models.forEach(function(name){
    var option=document.createElement('option'); option.value=name; option.textContent=name;
    select.appendChild(option);
  });
  select.disabled=false; select.value=selected;
}
async function listGeminiModels(){
  var key=savedGeminiKey();
  if(!key) throw {code:'missing_key'};
  var response;
  try{
    response=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',{
      headers:{'x-goog-api-key':key}
    });
  }catch(e){
    setDiag('Gemini CORS','応答を読めない','bad');
    throw {code:'cors'};
  }
  /* Reaching a readable Response proves that the browser passed CORS,
     even when the status later says the key itself is invalid. */
  setDiag('Gemini CORS','通過','ok');
  if(response.status===401||response.status===403) throw {code:'auth'};
  if(response.status===429) throw {code:'rate_limited'};
  if(!response.ok) throw {code:'upstream_error'};
  var data=await response.json();
  var models=(data.models||[]).filter(function(model){
    return Array.isArray(model.supportedGenerationMethods)
      && model.supportedGenerationMethods.indexOf('generateContent')>=0;
  }).map(function(model){ return String(model.name||'').replace(/^models\//,''); })
    .filter(function(name){ return /^gemini-[a-z0-9._-]+$/i.test(name); });
  models=Array.from(new Set(models)).sort();
  if(!models.length) throw {code:'no_models'};
  return models;
}
async function refreshGeminiModels(){
  if(modelListPromise) return modelListPromise;
  modelListPromise=listGeminiModels().then(function(models){
    availableGeminiModels=models;
    var selected=preferredGeminiModel(models);
    paintGeminiModels(models,selected);
    try{ localStorage.setItem(GEMINI_MODEL_NAME,selected); }catch(e){}
    setDiag('利用可能モデル',models.length+'件 / '+selected,'ok');
    setDiag('会話モデル方針','自然さと安定性: '+selected+' / 失敗時は安定版Flashへ自動切替','ok');
    return selected;
  }).finally(function(){ modelListPromise=null; });
  return modelListPromise;
}
async function ensureGeminiModel(){
  var saved=savedGeminiModel();
  if(saved&&availableGeminiModels.indexOf(saved)>=0) return saved;
  var selected=await refreshGeminiModels();
  if(!selected) throw {code:'model_unavailable'};
  return selected;
}
function fileAsPart(file){
  return new Promise(function(resolve,reject){
    var fr=new FileReader();
    fr.onload=function(){
      var s=String(fr.result||''), comma=s.indexOf(',');
      if(comma<0){ reject(new Error('image encode failed')); return; }
      resolve({inlineData:{mimeType:file.type||'image/jpeg',data:s.slice(comma+1)}});
    };
    fr.onerror=function(){ reject(new Error('image read failed')); };
    fr.readAsDataURL(file);
  });
}
function parseGeminiJson(text){
  var clean=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{ return JSON.parse(clean); }catch(e){}
  /* A model can occasionally wrap otherwise valid JSON in one explanatory
     sentence. Extract the first complete object before giving up. */
  var start=clean.indexOf('{'), end=clean.lastIndexOf('}');
  if(start>=0&&end>start){
    try{ return JSON.parse(clean.slice(start,end+1)); }catch(e2){}
  }
  /* Keeping the conversation alive matters more than animation metadata.
     If Gemini returned usable prose, speak it with a neutral expression. */
  if(clean && clean.length<=600 && clean.indexOf('<')<0){
    return {reply:clean,kana:clean,emotion:'neutral',strength:0.35,tears:false,gesture:'none',gestures:[]};
  }
  throw {code:'invalid_json'};
}
var GEMINI_RESPONSE_SCHEMA={
  type:'object',
  properties:{
    reply:{type:'string'}, kana:{type:'string'},
    emotion:{type:'string',enum:['neutral','happy','sad','angry','surprised','relaxed']},
    strength:{type:'number',minimum:0,maximum:1}, tears:{type:'boolean'},
    gesture:{type:'string',enum:['nod','tilt','shake','none']},
    gestures:{type:'array',maxItems:2,items:{type:'object',properties:{
      pose:{type:'string',enum:['wave','palm_up','point_self','index_up','think_finger','gassho','open_heart','hug_invite']},
      at:{type:'number',minimum:0,maximum:1}
    },required:['pose','at']}}
  },
  required:['reply','kana','emotion','strength','tears','gesture','gestures']
};
function waitMs(ms){ return new Promise(function(resolve){ setTimeout(resolve,ms); }); }
function conversationCandidates(primary){
  var ordered=[primary,'gemini-3.5-flash','gemini-3.5-flash-lite','gemini-3.6-flash','gemini-2.5-flash'];
  var out=[];
  ordered.concat(availableGeminiModels).forEach(function(name){
    if(!name||out.indexOf(name)>=0||availableGeminiModels.indexOf(name)<0) return;
    if(!/flash/i.test(name)||/(?:tts|live|image|transcribe|preview|exp)/i.test(name)) return;
    out.push(name);
  });
  return out.slice(0,2);
}
async function readGeminiError(response){
  try{
    var data=await response.clone().json();
    var message=data&&data.error&&(data.error.message||data.error.status);
    return String(message||'').slice(0,180);
  }catch(e){ return ''; }
}
async function requestGeminiJson(model,key,contents){
  var ctl=new AbortController(), timer=setTimeout(function(){ ctl.abort(); },22000);
  var startedAt=performance.now(), response;
  try{
    response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
      method:'POST',signal:ctl.signal,
      headers:{'Content-Type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({
        systemInstruction:{parts:[{text:RULES}]},contents:contents,
        generationConfig:{
          responseFormat:{text:{mimeType:'application/json',schema:GEMINI_RESPONSE_SCHEMA}},
          temperature:0.45,maxOutputTokens:520
        }
      })
    });
  }catch(e){
    clearTimeout(timer);
    if(e&&e.name==='AbortError') throw {code:'timeout',model:model};
    throw {code:'upstream_error',model:model,message:(e&&e.message)||'network error'};
  }
  clearTimeout(timer);
  var elapsed=((performance.now()-startedAt)/1000).toFixed(1);
  if(response.status===401||response.status===403) throw {code:'auth',status:response.status,model:model};
  if(response.status===429) throw {code:'rate_limited',status:429,model:model,message:await readGeminiError(response)};
  if(!response.ok) throw {code:'upstream_error',status:response.status,model:model,message:await readGeminiError(response)};
  var data=await response.json();
  var candidate=data&&data.candidates&&data.candidates[0];
  if(!candidate) throw {code:'refused',model:model};
  var text=(candidate.content&&candidate.content.parts||[]).map(function(p){return p.text||'';}).join('');
  if(!text) throw {code:'empty_completion',model:model};
  var parsed=parseGeminiJson(text);
  setDiag('Gemini会話 最終成功',new Date().toTimeString().slice(0,8)+' / '+model+' / '+elapsed+'秒','ok');
  setDiag('Gemini会話エラー','なし');
  return parsed;
}
async function geminiJson(pictures){
  var key=savedGeminiKey();
  if(!key) throw {code:'missing_key'};
  var model=await ensureGeminiModel();
  var contents=turns.slice(-12).map(function(t){
    return {role:t.role==='assistant'?'model':'user',parts:[{text:t.content}]};
  });
  if(pictures&&pictures.length&&contents.length){
    var parts=await Promise.all(pictures.map(fileAsPart));
    Array.prototype.push.apply(contents[contents.length-1].parts,parts);
  }
  var candidates=conversationCandidates(model), lastError=null;
  if(!candidates.length) candidates=[model];
  for(var i=0;i<candidates.length;i++){
    var candidateModel=candidates[i];
    setDiag('Gemini会話処理',(i?'自動切替':'送信中')+' / '+candidateModel,i?'':'ok');
    try{
      var result=await requestGeminiJson(candidateModel,key,contents);
      setDiag('Gemini会話処理',i?'別モデルで回復':'正常','ok');
      if(i){
        try{ localStorage.setItem(GEMINI_MODEL_NAME,candidateModel); }catch(e){}
        var select=document.getElementById('geminimodel'); if(select) select.value=candidateModel;
        setDiag('頭脳','Gemini / '+candidateModel+'（自動切替）','ok');
      }
      return result;
    }catch(e){

/* ===== Conversation orchestration and call controls (source lines 3468-3560) ===== */
    setDiag('TTSデータ鮮度','未取得');
  });
}

function ask(said){
  if(busy) return;
  addTurn('ケン',said);
  if(!savedGeminiKey()){
    sysLine(ERR.missing_key);
    setState('idle'); return;
  }
  busy=true; setState('think');

  /* Pictures ride with this turn only — earlier ones are not re-sent — so say
     in the words what she is being shown, or the next turn refers to
     something she can no longer see. Files that are not pictures cannot be
     opened here at all; name them and say so, rather than pretending. */
  var pics=[], named=[];
  attached.forEach(function(a){ (a.url?pics:named).push(a.file); });
  var note='';
  if(pics.length) note+='\n（'+pics.length+'枚の写真を見せています：'+pics.map(function(f){return f.name;}).join('、')+'）';
  if(named.length) note+='\n（'+named.map(function(f){return f.name;}).join('、')+' というファイルの名前だけ伝えています。中身は見えていません）';

  turns.push({role:'user',content:said+note});
  if(turns.length>12) turns=turns.slice(-12);
  if(window.clearAttached) clearAttached();
  geminiJson(pics)
  .then(function(d){
    var reply=(d&&d.reply)||'', kana=(d&&d.kana)||reply, emo=(d&&d.emotion)||'neutral';
    if(!EMO[emo]) emo='neutral';
    var strength=(d&&typeof d.strength==='number')?d.strength:undefined;
    var tears=(d&&d.tears)?1:0;
    var gesture=(d&&d.gesture)||'none';
    var handGestures=completeHandGestures(d&&d.gestures,said,reply,emo,strength);
    if(!reply){ throw {code:'empty_completion'}; }
    turns.push({role:'assistant',content:reply});
    addTurn('澪 · '+emo,reply,'mio');
    setDiag('最後の感情',emo+(strength!==undefined?(' '+Math.round(strength*100)+'%'):'')+(tears?' / 涙':''));
    setExpression(emo,strength,tears?0.85:undefined);
    doGesture(gesture);
    busy=false;
    speak(reply,kana,handGestures,function(){
      if(micBlocked){ typed.focus(); return; }
      if(started && autoListen() && !listening) beginListen();
    });
  })
  .catch(function(e){
    busy=false; setState('idle');
    var code=(e&&e.code)||'upstream_error';
    sysLine(ERR[code]||('うまくいきませんでした（'+code+'）'));
    if(code==='auth'||code==='missing_key') setDiag('頭脳','APIキーを確認','bad');
  });
}

/* ================= controls ================= */
var talkBtn=document.getElementById('talk'), hangBtn=document.getElementById('hangup');
var started=false;
talkBtn.addEventListener('click',function(){
  if(!started){
    started=true; hangBtn.disabled=false; talkBtn.textContent='話す';
    setState('idle');
    /* iOS only speaks later if synthesis is first used inside a gesture. A real
       greeting does that AND opens the call, where an empty utterance could
       leave the queue wedged. */
    var hello='はい、澪です。ケンさん、聞こえますか。';
    addTurn('澪',hello,'mio');
    speak(hello,'はい、みおです。けんさん、きこえますか。',[{pose:'wave',at:0}],function(){
      if(autoListen()) beginListen();
      else sysLine('「話す」を押してから話しかけてください。');
    });
    return;
  }
  if(listening){ try{ rec&&rec.stop(); }catch(e){} return; }
  noSpeechRetries=0;
  beginListen();
});
hangBtn.addEventListener('click',function(){
  try{ rec&&rec.stop(); }catch(e){}
  stopSpeaking(); pendingListen=false;
  listening=false; speaking=false; started=false; visTarget='x'; noSpeechRetries=0;
  talkBtn.dataset.live='0'; talkBtn.textContent='通話を始める';
  hangBtn.disabled=true; setState('idle'); selfText('あなたの声がここに出ます',true);
  sysLine('通話を終了しました。');
});

(function(){
  var wrap=document.getElementById('topics');
  ['おつかれさま','今日はどうだった？','ちょっと聞いてほしいことがある','元気出ないんだ'].forEach(function(t){
    var b=document.createElement('button'); b.className='chip'; b.type='button'; b.textContent=t;
    b.addEventListener('click',function(){
      if(!started){ started=true; hangBtn.disabled=false; talkBtn.textContent='話す'; }
      ask(t);
    });

/* ===== Echo suppression window and hands-free refocus (source lines 3621-3678) ===== */
/* Hands-free dictation (macOS / iOS Voice Control) never stops listening, so
   it hears her reply through the speaker and types it into the same box —
   which then auto-sends, and she answers herself, forever. Nothing typed
   while she is speaking is the viewer, so throw it away. The window stays
   open a moment after she stops, for the tail the recogniser is still
   transcribing. Headphones remove the problem at the source; this keeps the
   loop from starting for anyone using the speaker. */
var echoUntil=0;
function echoWindow(){ return speaking || performance.now() < echoUntil; }
function closeEchoWindow(){ echoUntil = performance.now() + 900; }

function armAutoSend(){
  clearTimeout(sendTimer);
  if(echoWindow()){
    /* her own words, arriving through the microphone */
    if(handsFree && typed.value.trim()) hfState('澪の声が入ったので捨てました（イヤホンで防げます）');
    typed.value='';
    return;
  }
  if(handsFree && typed.value.trim()) hfState('聞こえています：「'+typed.value.trim().slice(0,24)+'」');
  if(!document.getElementById('autosend').checked) return;
  if(!typed.value.trim()) return;
  /* dictation drops text in without a "finished" event, so a pause is the
     only signal we get; any further input restarts the wait */
  sendTimer=setTimeout(sendTyped,2200);
}
function sendTyped(){
  clearTimeout(sendTimer);
  var t=typed.value.trim();
  if(!t && attached.length) t='これ、見てもらえる？';
  if(!t) return;
  typed.value='';
  /* Only the recogniser used to write here, so on a device where the frame
     never gets the microphone the tile held its placeholder forever — "your
     voice appears here", and it never did. What was said reaches her the same
     way whichever route it took; show it. */
  selfText(t);
  if(!started){ started=true; hangBtn.disabled=false; talkBtn.textContent='話す'; }
  /* Dictation types into whatever holds focus. Sending emptied the box but
     also let focus go, so the next sentence landed nowhere and the viewer had
     to touch the screen again — the thing hands-free is meant to avoid. */
  keepFocus();
  ask(t);
}
/* Focus has to come back after her turn as well: on iOS, speaking can take
   it away. Refuse it while a text field is deliberately not wanted (during
   calibration taps on the picture). */
function keepFocus(){
  if(calibrating) return;
  try{ typed.focus({preventScroll:true}); }catch(e){ try{ typed.focus(); }catch(e2){} }
}
/* Continuous listening, offered as a switch because whether it can work is
   a property of where this page is running, not of the code: a frame the
   microphone was never delegated to refuses at the first attempt. Rather
   than deciding for the viewer, try it when asked and say exactly what came
   back — "not-allowed from a frame" is a different problem from "no
   microphone" and from "you declined", and they were all showing up as
   nothing happening. */
