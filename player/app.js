'use strict';
/* Player — toca offline, no iPad, as músicas guardadas por pastas. */
const VERSAO = '1.1.0';   // precisa casar com a VERSAO do sw.js

// Versão sempre à vista: cada [data-versao] da página mostra a deste app.
for (const lugar of document.querySelectorAll('[data-versao]')) lugar.textContent = 'v' + VERSAO;

/* ================= banco de dados (IndexedDB) ================= */
let db;
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open('player-offline',1);
  r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('folders',{keyPath:'id'});d.createObjectStore('tracks',{keyPath:'id'});d.createObjectStore('blobs',{keyPath:'id'});};
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
const store=(s,m='readonly')=>db.transaction(s,m).objectStore(s);
const rq=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
const dbAll=s=>rq(store(s).getAll());
const dbGet=(s,k)=>rq(store(s).get(k));
const dbPut=(s,v)=>rq(store(s,'readwrite').put(v));
const dbDel=(s,k)=>rq(store(s,'readwrite').delete(k));

/* ================= estado ================= */
const $=id=>document.getElementById(id);
const audio=$('audio');
let folders=[],tracks=[];
let view={type:'root',folderId:null};
let query='';
let queue=[],qi=-1,current=null,audioURL=null;
let repeat=0,shuffle=false,vol=1; // repeat: 0 desligado, 1 todas, 2 uma
const coverCache={};
try{const s=JSON.parse(localStorage.getItem('player-prefs')||'{}');repeat=s.repeat||0;shuffle=!!s.shuffle;if(typeof s.vol==='number')vol=s.vol;}catch(e){}
function savePrefs(){try{localStorage.setItem('player-prefs',JSON.stringify({repeat,shuffle,vol}));}catch(e){}}
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);

/* ================= utilidades ================= */
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function fmt(t){if(!isFinite(t)||t<0)t=0;t=Math.floor(t);return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');}
function hash(s){let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return Math.abs(h);}
function initials(s){const w=String(s||'?').split(/\s+/).filter(x=>/[\p{L}\p{N}]/u.test(x));return ((w[0]||'?')[0]+((w[1]||'')[0]||'')).toUpperCase();}
function phStyle(s){const h=hash(s||'x')%360;return `background:hsl(${h} 55% 72%);color:hsl(${h} 35% 38%)`;}
function coverURL(t){if(!t||!t.cover)return null;if(!coverCache[t.id])coverCache[t.id]=URL.createObjectURL(t.cover);return coverCache[t.id];}
let toastT;function toast(msg,ms=2200){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastT);if(ms)toastT=setTimeout(()=>el.classList.remove('show'),ms);}
const byName=(a,b)=>a.localeCompare(b,'pt',{sensitivity:'base',numeric:true});

/* ================= leitura de etiquetas (título, artista, capa) ================= */
function str(dv,p,n){let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(dv.getUint8(p+i));return s;}
function syncsafe(dv,p){return (dv.getUint8(p)&127)<<21|(dv.getUint8(p+1)&127)<<14|(dv.getUint8(p+2)&127)<<7|(dv.getUint8(p+3)&127);}
function decodeBytes(u8,enc){
  let label='windows-1252';
  if(enc===3)label='utf-8';else if(enc===2)label='utf-16be';
  else if(enc===1){label=(u8[0]===0xFE&&u8[1]===0xFF)?'utf-16be':'utf-16le';}
  try{return new TextDecoder(label).decode(u8).replace(/^﻿/,'').split('\0')[0].trim();}catch(e){return '';}
}
function parseID3(dv){
  if(dv.byteLength<10||str(dv,0,3)!=='ID3')return null;
  const ver=dv.getUint8(3),flags=dv.getUint8(5),end=Math.min(10+syncsafe(dv,6),dv.byteLength);
  let p=10;if(flags&0x40){p+=ver===4?syncsafe(dv,10):dv.getUint32(10)+4;}
  const out={},map={TIT2:'title',TT2:'title',TPE1:'artist',TP1:'artist',TALB:'album',TAL:'album'};
  while(p+(ver===2?6:10)<=end){
    let id,size,hdr;
    if(ver===2){id=str(dv,p,3);size=dv.getUint8(p+3)<<16|dv.getUint8(p+4)<<8|dv.getUint8(p+5);hdr=6;}
    else{id=str(dv,p,4);size=ver===4?syncsafe(dv,p+4):dv.getUint32(p+4);hdr=10;}
    if(!/^[A-Z0-9]{3,4}$/.test(id)||size<=0)break;
    const s=p+hdr,e=Math.min(s+size,end);
    if(map[id]&&!out[map[id]])out[map[id]]=decodeBytes(new Uint8Array(dv.buffer,dv.byteOffset+s+1,Math.max(0,e-s-1)),dv.getUint8(s));
    else if((id==='APIC'||id==='PIC')&&!out.cover){
      const enc=dv.getUint8(s);let q=s+1,mime;
      if(id==='PIC'){mime='image/'+str(dv,q,3).toLowerCase();q+=3;}
      else{let m='';while(q<e&&dv.getUint8(q)!==0){m+=String.fromCharCode(dv.getUint8(q));q++;}q++;mime=m||'image/jpeg';}
      q++; // tipo da imagem
      if(enc===1||enc===2){while(q+1<e&&!(dv.getUint8(q)===0&&dv.getUint8(q+1)===0))q+=2;q+=2;}
      else{while(q<e&&dv.getUint8(q)!==0)q++;q++;}
      if(!mime.includes('/'))mime='image/'+mime;mime=mime.replace('jpg','jpeg');
      if(e>q)out.cover={mime,data:dv.buffer.slice(dv.byteOffset+q,dv.byteOffset+e)};
    }
    p=e;
  }
  return out;
}
function parseMP4(dv){
  const out={},keys={'\xA9nam':'title','\xA9ART':'artist','aART':'artist2','\xA9alb':'album'};
  function walk(start,end,parent){
    let p=start;
    while(p+8<=end){
      let size=dv.getUint32(p),hdr=8;const type=str(dv,p+4,4);
      if(size===1){size=Number(dv.getBigUint64(p+8));hdr=16;}else if(size===0)size=end-p;
      if(size<hdr)break;
      const s=p+hdr,e=Math.min(p+size,end);
      if(type==='moov'||type==='udta'||type==='ilst')walk(s,e,type);
      else if(type==='meta')walk(s+4,e,type);
      else if(parent==='ilst'&&(keys[type]||type==='covr')&&s+16<=e&&str(dv,s+4,4)==='data'){
        const dsize=dv.getUint32(s),dtype=dv.getUint32(s+8)&0xFFFFFF,ds=s+16,de=Math.min(s+dsize,e);
        if(type==='covr'){if(!out.cover)out.cover={mime:dtype===14?'image/png':'image/jpeg',data:dv.buffer.slice(dv.byteOffset+ds,dv.byteOffset+de)};}
        else out[keys[type]]=new TextDecoder('utf-8').decode(new Uint8Array(dv.buffer,dv.byteOffset+ds,de-ds)).trim();
      }
      p+=size;
    }
  }
  walk(0,dv.byteLength,'');
  if(!out.artist&&out.artist2)out.artist=out.artist2;
  return out;
}
function parseTags(buf){
  try{const dv=new DataView(buf);
    if(dv.byteLength>12&&str(dv,4,4)==='ftyp')return parseMP4(dv)||{};
    return parseID3(dv)||{};
  }catch(e){console.warn('tags',e);return {};}
}
function fromFileName(name){
  let base=name.replace(/\.[^.]+$/,'').replace(/_/g,' ').replace(/^\s*\d{1,3}\s*[-.)]?\s+/,'').trim();
  const i=base.indexOf(' - ');
  if(i>0)return {artist:base.slice(0,i).trim(),title:base.slice(i+3).trim()};
  return {artist:'',title:base};
}
function getDuration(blob){return new Promise(res=>{const a=new Audio(),u=URL.createObjectURL(blob);let done=false;
  const fin=d=>{if(done)return;done=true;URL.revokeObjectURL(u);res(isFinite(d)?d:0);};
  a.preload='metadata';a.onloadedmetadata=()=>fin(a.duration);a.onerror=()=>fin(0);setTimeout(()=>fin(0),6000);a.src=u;});}
function guessType(n){const x=n.split('.').pop().toLowerCase();return {mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',wav:'audio/wav',flac:'audio/flac',ogg:'audio/ogg',opus:'audio/ogg'}[x]||'audio/mpeg';}

/* ================= importar músicas ================= */
async function importFiles(files,folderId){
  const list=[...files];let ok=0,fail=0;
  for(let i=0;i<list.length;i++){
    const f=list[i];toast(`Guardando ${i+1} de ${list.length}…`,0);
    try{
      const buf=await f.arrayBuffer();
      const tags=parseTags(buf),fn=fromFileName(f.name);
      const blob=new Blob([buf],{type:(f.type&&f.type.startsWith('audio'))?f.type:guessType(f.name)});
      const dur=await getDuration(blob);
      if(!dur)throw new Error('não é áudio');
      const id=uid();
      await dbPut('blobs',{id,blob});
      const t={id,folderId,file:f.name,title:tags.title||fn.title,artist:tags.artist||fn.artist||'Artista desconhecido',album:tags.album||'',
        cover:tags.cover?new Blob([tags.cover.data],{type:tags.cover.mime}):null,duration:dur,added:Date.now()+i};
      await dbPut('tracks',t);tracks.push(t);ok++;
    }catch(e){console.error(e);fail++;}
  }
  render();
  toast(fail?`${ok} guardada(s). ${fail} arquivo(s) não são músicas que o iPad consiga tocar.`:`${ok} música(s) guardada(s) na pasta.`,3500);
  if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
}

/* ================= listas ================= */
function tracksInView(){
  let arr=view.type==='folder'?tracks.filter(t=>t.folderId===view.folderId):tracks.slice();
  if(query){const q=query.toLowerCase();arr=tracks.filter(t=>(t.title+' '+t.artist+' '+t.album).toLowerCase().includes(q)&&(view.type!=='folder'||t.folderId===view.folderId));}
  return arr.sort((a,b)=>byName(a.title,b.title));
}
function thumbHTML(t){const u=coverURL(t);return u?`<img class="thumb" src="${u}" alt="" loading="lazy">`:`<div class="thumb" style="${phStyle(t.title)}">${esc(initials(t.title))}</div>`;}
const FOLDER_SVG='<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2 2 0 0 1 1.5.7L12 6.3h6.5A2.5 2.5 0 0 1 21 8.8v8.7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>';
const ALL_SVG='<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
const DOTS='<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
const PLAYING='<svg class="playing" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.5-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z"/></svg>';

function trackRow(t){
  return `<div class="row${t.id===current?' cur':''}" data-t="${t.id}">${thumbHTML(t)}<div class="meta"><div class="t1">${esc(t.title)}</div><div class="t2">${esc(t.artist)}</div></div>${t.id===current?PLAYING:''}<button class="more" data-tm="${t.id}" aria-label="Opções">${DOTS}</button></div>`;
}
function render(){
  const list=$('list');let html='';
  $('btnBack').classList.toggle('hidden',view.type==='root');
  if(view.type==='root'&&!query){
    $('crumbTitle').textContent='Pastas';
    $('counter').textContent=`${folders.length} pasta(s) · ${tracks.length} música(s)`;
    if(!folders.length){
      html=`<div class="empty"><div class="big">Comece criando uma pasta</div>Exemplo: Rock, MPB, Minhas músicas.<br>Depois você coloca as músicas dentro dela.<br><button class="pill" id="emptyNew">Criar pasta</button></div>`;
    }else{
      html+=`<div class="row" data-all="1"><div class="thumb all">${ALL_SVG}</div><div class="meta"><div class="t1">Todas as músicas</div><div class="t2">${tracks.length} música(s)</div></div></div>`;
      html+=`<div class="sec">Minhas pastas</div>`;
      for(const f of folders.slice().sort((a,b)=>byName(a.name,b.name))){
        const n=tracks.filter(t=>t.folderId===f.id).length;
        html+=`<div class="row" data-f="${f.id}"><div class="thumb folder">${FOLDER_SVG}</div><div class="meta"><div class="t1">${esc(f.name)}</div><div class="t2">${n} música(s)</div></div><button class="more" data-fm="${f.id}" aria-label="Opções">${DOTS}</button></div>`;
      }
    }
  }else{
    const arr=tracksInView();
    const f=folders.find(x=>x.id===view.folderId);
    $('crumbTitle').textContent=query&&view.type==='root'?'Busca':(view.type==='all'?'Todas as músicas':(f?f.name:''));
    const pos=arr.findIndex(t=>t.id===current);
    $('counter').textContent=pos>=0?`${pos+1}/${arr.length}`:`${arr.length} música(s)`;
    if(!arr.length){
      html=query?`<div class="empty">Nada encontrado para “${esc(query)}”.</div>`
        :view.type==='folder'?`<div class="empty"><div class="big">Pasta vazia</div>Toque no botão abaixo e escolha as músicas<br>no app Arquivos do iPad.<br><button class="pill" id="emptyAdd">Adicionar músicas</button></div>`
        :`<div class="empty">Nenhuma música ainda.</div>`;
    }else html=arr.map(trackRow).join('');
  }
  list.innerHTML=html;
  const en=$('emptyNew');if(en)en.onclick=newFolder;
  const ea=$('emptyAdd');if(ea)ea.onclick=()=>$('file').click();
}
function openView(v){view=v;query='';$('q').value='';$('searchBox').classList.add('hidden');render();$('list').scrollTop=0;}

/* ================= pastas ================= */
async function newFolder(){
  const name=(prompt('Nome da nova pasta:')||'').trim();if(!name)return;
  const f={id:uid(),name,created:Date.now()};await dbPut('folders',f);folders.push(f);
  openView({type:'folder',folderId:f.id});toast('Pasta criada. Agora adicione as músicas.');
}
async function renameFolder(id){
  const f=folders.find(x=>x.id===id);const name=(prompt('Novo nome da pasta:',f.name)||'').trim();if(!name)return;
  f.name=name;await dbPut('folders',f);render();
}
async function deleteFolder(id){
  const f=folders.find(x=>x.id===id),inside=tracks.filter(t=>t.folderId===id);
  if(!confirm(`Apagar a pasta “${f.name}” e as ${inside.length} música(s) dentro dela?`))return;
  for(const t of inside)await removeTrack(t.id,true);
  await dbDel('folders',id);folders=folders.filter(x=>x.id!==id);render();toast('Pasta apagada.');
}
async function removeTrack(id,silent){
  if(current===id){audio.pause();audio.removeAttribute('src');current=null;updatePlayer();}
  await dbDel('blobs',id);await dbDel('tracks',id);
  if(coverCache[id]){URL.revokeObjectURL(coverCache[id]);delete coverCache[id];}
  tracks=tracks.filter(t=>t.id!==id);queue=queue.filter(x=>x!==id);
  if(!silent){render();toast('Música apagada.');}
}
function moveTrack(id){
  const t=tracks.find(x=>x.id===id);
  sheet('Mover para qual pasta?',folders.filter(f=>f.id!==t.folderId).sort((a,b)=>byName(a.name,b.name)).map(f=>({label:f.name,act:async()=>{t.folderId=f.id;await dbPut('tracks',t);render();toast(`Movida para “${f.name}”.`);}})));
}

/* ================= folha de opções ================= */
function sheet(title,items){
  const card=$('card');card.innerHTML=(title?`<h3>${esc(title)}</h3>`:'')+items.map((it,i)=>`<button data-i="${i}" class="${it.danger?'danger':''}">${esc(it.label)}</button>`).join('')+`<button class="cancel" data-i="x">Cancelar</button>`;
  $('sheet').classList.remove('hidden');
  card.onclick=e=>{const b=e.target.closest('button');if(!b)return;$('sheet').classList.add('hidden');if(b.dataset.i!=='x'){const it=items[+b.dataset.i];it.act&&it.act();}};
}
$('sheet').onclick=e=>{if(e.target.id==='sheet')$('sheet').classList.add('hidden');};

/* ================= toque (liberar áudio no iPad) ================= */
let unlocked=false;
function silentURL(){const n=800,b=new ArrayBuffer(44+n),v=new DataView(b),w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  w(0,'RIFF');v.setUint32(4,36+n,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,8000,true);v.setUint16(32,1,true);v.setUint16(34,8,true);w(36,'data');v.setUint32(40,n,true);for(let i=0;i<n;i++)v.setUint8(44+i,128);
  return URL.createObjectURL(new Blob([b],{type:'audio/wav'}));}
function unlock(){if(unlocked)return;unlocked=true;aplicarVolume();if(!audio.src){audio.src=silentURL();audio.play().then(()=>audio.pause()).catch(()=>{});}}

/* ================= volume ================= */
// No iPad o Safari ignora audio.volume. Lá o volume passa por um ganho do Web Audio,
// criado só quando o volume fica abaixo do máximo (no máximo, o áudio segue direto).
const volNativo=(()=>{try{const a=new Audio();a.volume=.5;return a.volume===.5;}catch(e){return false;}})();
let actx=null,ganho=null;
function aplicarVolume(){
  if(volNativo){audio.volume=vol;return;}
  if(vol>=0.999&&!ganho)return;
  if(!actx){
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    actx=new AC();const fonte=actx.createMediaElementSource(audio);
    ganho=actx.createGain();fonte.connect(ganho);ganho.connect(actx.destination);
  }
  ganho.gain.value=vol;
  if(actx.state!=='running')actx.resume().catch(()=>{});
}
function mostrarVolume(){const v=Math.round(vol*100);$('vol').value=v;$('vol').style.setProperty('--p',v+'%');}
$('vol').addEventListener('input',e=>{vol=+e.target.value/100;mostrarVolume();aplicarVolume();});
$('vol').addEventListener('change',savePrefs);
audio.addEventListener('play',()=>{if(actx&&actx.state!=='running')actx.resume().catch(()=>{});});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&actx&&actx.state!=='running')actx.resume().catch(()=>{});});

/* ================= tocar ================= */
async function playTrack(id,newQueue){
  if(newQueue)queue=newQueue;
  qi=queue.indexOf(id);
  const rec=await dbGet('blobs',id);if(!rec){toast('Arquivo não encontrado.');return;}
  if(audioURL)URL.revokeObjectURL(audioURL);
  audioURL=URL.createObjectURL(rec.blob);
  current=id;audio.src=audioURL;
  try{await audio.play();}catch(e){console.warn(e);}
  updatePlayer();render();
}
function nextIndex(dir){
  if(!queue.length)return -1;
  if(shuffle&&dir>0){if(queue.length===1)return 0;let r;do r=Math.floor(Math.random()*queue.length);while(r===qi);return r;}
  const n=qi+dir;
  if(n>=queue.length)return repeat===1?0:-1;
  if(n<0)return repeat===1?queue.length-1:0;
  return n;
}
function next(){const n=nextIndex(1);if(n>=0)playTrack(queue[n]);}
function prev(){if(audio.currentTime>3){audio.currentTime=0;return;}const n=nextIndex(-1);if(n>=0)playTrack(queue[n]);}
function togglePlay(){if(!current){const arr=tracksInView();if(arr.length)playTrack(arr[0].id,arr.map(t=>t.id));return;}audio.paused?audio.play():audio.pause();}

function updatePlayer(){
  const t=tracks.find(x=>x.id===current);
  const cov=$('cover');
  if(!t){$('pTitle').textContent='Nenhuma música';$('pArtist').textContent='';$('pAlbum').textContent='';$('bg').style.backgroundImage='';return;}
  const u=coverURL(t);
  if(u){cov.innerHTML=`<img src="${u}" alt="">`;cov.removeAttribute('style');$('bg').style.backgroundImage=`url("${u}")`;}
  else{cov.innerHTML=esc(initials(t.title));cov.setAttribute('style',phStyle(t.title));$('bg').style.backgroundImage='';}
  $('pTitle').textContent=t.title;$('pArtist').textContent=t.artist;$('pAlbum').textContent=t.album;
  if('mediaSession' in navigator){
    navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:t.artist,album:t.album,artwork:u?[{src:u,sizes:'512x512',type:t.cover.type}]:[]});
  }
}
function updateButtons(){
  const playing=!audio.paused;
  $('icPlay').classList.toggle('hidden',playing);$('icPause').classList.toggle('hidden',!playing);
  $('btnRepeat').classList.toggle('on',repeat>0);$('rep1').classList.toggle('hidden',repeat!==2);
  $('btnShuffle').classList.toggle('on',shuffle);
}
let seeking=false;
function updateTime(){
  const d=audio.duration||0,c=audio.currentTime||0;
  if(!seeking){const p=d?c/d*1000:0;$('seek').value=p;$('seek').style.setProperty('--p',p/10+'%');}
  $('tCur').textContent=fmt(c);$('tLeft').textContent='-'+fmt(d-c);
}

/* ================= eventos ================= */
audio.addEventListener('timeupdate',updateTime);
audio.addEventListener('loadedmetadata',updateTime);
audio.addEventListener('play',updateButtons);
audio.addEventListener('pause',updateButtons);
audio.addEventListener('ended',()=>{if(repeat===2){audio.currentTime=0;audio.play();}else next();});
$('seek').addEventListener('input',e=>{seeking=true;const v=+e.target.value;e.target.style.setProperty('--p',v/10+'%');$('tCur').textContent=fmt(v/1000*(audio.duration||0));});
$('seek').addEventListener('change',e=>{if(audio.duration)audio.currentTime=+e.target.value/1000*audio.duration;seeking=false;});
$('btnPlay').onclick=()=>{unlock();togglePlay();};
$('btnNext').onclick=()=>{unlock();next();};
$('btnPrev').onclick=()=>{unlock();prev();};
$('btnRepeat').onclick=()=>{repeat=(repeat+1)%3;savePrefs();updateButtons();toast(['Repetir: desligado','Repetir: todas','Repetir: esta música'][repeat]);};
$('btnShuffle').onclick=()=>{shuffle=!shuffle;savePrefs();updateButtons();toast(shuffle?'Aleatório: ligado':'Aleatório: desligado');};
$('btnBack').onclick=()=>openView({type:'root'});
$('btnSearch').onclick=()=>{const b=$('searchBox');b.classList.toggle('hidden');if(!b.classList.contains('hidden'))$('q').focus();else{query='';$('q').value='';render();}};
$('q').addEventListener('input',e=>{query=e.target.value.trim();render();});
$('btnAdd').onclick=()=>{if(view.type==='folder')$('file').click();else if(view.type==='all')toast('Abra uma pasta para adicionar músicas nela.');else newFolder();};
$('file').addEventListener('change',e=>{const fs=e.target.files;if(fs&&fs.length&&view.type==='folder')importFiles(fs,view.folderId);e.target.value='';});
$('btnMenu').onclick=async()=>{
  let info='';
  try{const est=await navigator.storage.estimate();info=`Espaço usado: ${(est.usage/1048576).toFixed(0)} MB`;}catch(e){}
  sheet(info||'Menu',[
    {label:'Nova pasta',act:newFolder},
    {label:'Todas as músicas',act:()=>openView({type:'all'})},
    {label:'Pastas',act:()=>openView({type:'root'})},
  ]);
};
$('list').addEventListener('click',e=>{
  const tm=e.target.closest('[data-tm]'),fm=e.target.closest('[data-fm]');
  if(tm){const id=tm.dataset.tm,t=tracks.find(x=>x.id===id);
    sheet(t.title,[{label:'Mover para outra pasta',act:()=>moveTrack(id)},{label:'Apagar música',danger:true,act:()=>{if(confirm(`Apagar “${t.title}” do Player?`))removeTrack(id);}}]);return;}
  if(fm){const id=fm.dataset.fm;sheet(folders.find(f=>f.id===id).name,[{label:'Renomear pasta',act:()=>renameFolder(id)},{label:'Apagar pasta',danger:true,act:()=>deleteFolder(id)}]);return;}
  const row=e.target.closest('.row');if(!row)return;
  if(row.dataset.all){openView({type:'all'});return;}
  if(row.dataset.f){openView({type:'folder',folderId:row.dataset.f});return;}
  if(row.dataset.t){unlock();const arr=tracksInView();playTrack(row.dataset.t,arr.map(t=>t.id));}
});
if('mediaSession' in navigator){
  const ms=navigator.mediaSession;
  ms.setActionHandler('play',()=>audio.play());ms.setActionHandler('pause',()=>audio.pause());
  ms.setActionHandler('nexttrack',next);ms.setActionHandler('previoustrack',prev);
  try{ms.setActionHandler('seekto',d=>{audio.currentTime=d.seekTime;});}catch(e){}
}

/* ================= início ================= */
(async()=>{
  db=await openDB();
  [folders,tracks]=await Promise.all([dbAll('folders'),dbAll('tracks')]);
  updateButtons();mostrarVolume();if(volNativo)aplicarVolume();render();
  if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
