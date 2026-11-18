import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const categories = [
 ["Anime","Isekai · Shonen · Romance · Shojo · Seinen · Fantasy · Action · Sports · Mystery"]
];
const subcategories = ["All","Isekai","Shonen","Romance","Shojo","Seinen","Fantasy","Action","Comedy","Slice of Life","Horror","Sports","Adventure","Mystery","Sci-Fi","Drama","Superhero","RPG"];
let soloScore=0, characterGuessAwarded=false, titleGuessAwarded=false;
let selectedCategory="Anime", catalog=[], app, auth, db, user=null, roomId=null, roomUnsub=null, chatUnsub=null, activeCharacter=null, mode="solo", roomData=null, timer=null;
let getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, addDoc, serverTimestamp;
const toast = msg => { $("toast").textContent=msg; $("toast").classList.add("show"); setTimeout(()=>$("toast").classList.remove("show"),2600); };
function showSetup(kind){mode=kind;$("setupTitle").textContent=kind==="room"?"Set up your room":"Set up solo mode";$("categorySelect").value="Anime";updateSubcategories();$("setupDialog").showModal();}
function renderCategories(){ $("categoryGrid").innerHTML=categories.map(([name,desc])=>`<button class="category ${selectedCategory===name?"active":""}" data-cat="${name}"><b>${name}</b><small>${desc}</small></button>`).join(""); document.querySelectorAll("[data-cat]").forEach(b=>b.onclick=()=>{selectedCategory=b.dataset.cat;$("categorySelect").value=selectedCategory;renderCategories();});}
function updateSubcategories(){const c=$("categorySelect").value;const opts=c==="Anime"?["All","Isekai","Shonen","Romance","Shojo","Seinen","Fantasy","Action","Comedy","Slice of Life","Horror","Sports"]:subcategories;$("subSelect").innerHTML=opts.map(x=>`<option>${x}</option>`).join("");}
async function loadCatalog(){try{const r=await fetch("./data/characters.json");const data=await r.json();catalog=data.filter(x=>x.category==="Anime");}catch(e){catalog=[];}}
function chooseCharacter(cat,sub){let pool=catalog.filter(x=>(sub==="All"||x.subcategory.includes(sub)));if(!pool.length)pool=catalog;return pool[Math.floor(Math.random()*pool.length)];}
function setArt(container, url, alt){
  container.innerHTML="";
  if(url){const img=document.createElement("img");img.src=url;img.alt=alt;img.loading="lazy";img.onerror=()=>{container.innerHTML='<div class="art-placeholder">✦</div>';};container.append(img);}
  else container.innerHTML='<div class="art-placeholder">✦</div>';
}
// Anime artwork is fetched from the public Jikan API and cached in this browser.
const artworkCache = new Map();
function readArtworkCache(id){
  try{return JSON.parse(localStorage.getItem("kalyon-anime-artwork")||"{}")[id]||{};}catch{return {};}
}
function saveArtworkCache(id, data){
  try{const all=JSON.parse(localStorage.getItem("kalyon-anime-artwork")||"{}");all[id]=data;localStorage.setItem("kalyon-anime-artwork",JSON.stringify(all));}catch(e){console.info("Artwork cache unavailable.");}
}
async function jikanSearch(kind, query){
  const url=`https://api.jikan.moe/v4/${kind}?q=${encodeURIComponent(query)}&limit=5`;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url);
      if(response.status===429){await new Promise(resolve=>setTimeout(resolve,1200*(attempt+1)));continue;}
      if(!response.ok)return null;
      const data=await response.json();
      return (data.data||[])[0]||null;
    }catch(e){if(attempt===2)throw e;await new Promise(resolve=>setTimeout(resolve,500));}
  }
  return null;
}
async function loadCharacterArtwork(character){
  const characterBox=$("mysteryArt"), seriesBox=$("seriesArt");
  const cached=artworkCache.get(character.id)||readArtworkCache(character.id);
  if(cached.image)character.image=cached.image;
  if(cached.franchiseImage)character.franchiseImage=cached.franchiseImage;
  setArt(characterBox,character.image||character.characterImage||"","Character artwork: "+character.name);
  $("seriesArtLabel").textContent=(character.franchise||"Series").toUpperCase();
  setArt(seriesBox,character.franchiseImage||character.seriesImage||"",character.franchise||"Anime title artwork");
  const current=()=>activeCharacter?.id===character.id;
  if(character.category!=="Anime"||(character.image&&character.franchiseImage))return;
  const updated={image:character.image||"",franchiseImage:character.franchiseImage||""};
  try{
    if(!updated.image){
      const hit=await jikanSearch("characters",character.name);
      const portrait=hit?.images?.jpg?.image_url||hit?.images?.webp?.image_url||"";
      if(portrait){updated.image=portrait;character.image=portrait;if(current())setArt(characterBox,portrait,character.name);}
    }
  }catch(e){console.info("Character artwork lookup unavailable.",e);}
  try{
    if(!updated.franchiseImage){
      const hit=await jikanSearch("anime",character.franchise);
      const poster=hit?.images?.jpg?.large_image_url||hit?.images?.jpg?.image_url||hit?.images?.webp?.image_url||"";
      if(poster){updated.franchiseImage=poster;character.franchiseImage=poster;if(current())setArt(seriesBox,poster,character.franchise);}
    }
  }catch(e){console.info("Anime poster lookup unavailable.",e);}
  if(updated.image||updated.franchiseImage){artworkCache.set(character.id,updated);saveArtworkCache(character.id,updated);}
  // If a portrait is unavailable, show the anime poster rather than an empty image box.
  if(current()&&!updated.image&&updated.franchiseImage)setArt(characterBox,updated.franchiseImage,character.franchise+" artwork");
}
function openRound(character){$("gameDialog").classList.toggle("solo-mode",mode==="solo");if(!character){toast("No characters in that collection yet.");return;}activeCharacter=character;characterGuessAwarded=false;titleGuessAwarded=false;$("soloScore").textContent=`Score: ${soloScore}`;$("mysteryArt").innerHTML='<div class="art-placeholder">?</div>';$("seriesArt").innerHTML='<div class="art-placeholder">✦</div>';
  $("mysteryName").textContent="Hidden from you";
  $("mysteryHint").textContent=`Category: ${character.category} · Difficulty: ${character.difficulty}`;
  $("guessInput").value="";$("titleInput").value="";$("guessFeedback").textContent="";$("guessFeedback").className="guess-feedback";$("questionList").innerHTML='<p class="muted">Questions will appear here.</p>';
  $("chatLog").innerHTML="";$("chatInput").value="";document.querySelectorAll(".game-side .panel").forEach((p,i)=>{if(i===2)p.classList.toggle("hidden",mode==="solo");});$("questionPanelTitle").textContent=mode==="solo"?"ASK THE AI":"ASK EVERYONE";$("askBtn").textContent=mode==="solo"?"Ask AI":"Ask";$("gameDialog").showModal();$("gameMode").textContent=mode==="solo"?"SOLO ROUND":"ROOM ROUND";
  loadCharacterArtwork(character);
}
function normalize(s){return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function checkGuess(value,answers){const v=normalize(value);return !!v&&answers.filter(a=>typeof a==="string").some(a=>normalize(a)===v);}
function showGuessFeedback(correct,type){
 const el=$("guessFeedback");
 if(!el)return;
 el.textContent=correct?(type==="character"?"🏆 WINNER! CHARACTER FOUND!":"🏆 WINNER! TITLE FOUND!"):"✖ WRONG! TRY AGAIN";
 el.className="guess-feedback "+(correct?"winner":"wrong");
 // Restart the CSS animation so every guess gets its own visible effect.
 void el.offsetWidth;
 el.classList.add("play");
}
function guess(type){
 const field=type==="character"?"guessInput":"titleInput";
 const input=$(field);
 if(!activeCharacter){toast("Start a round before guessing.");return;}
 if(!input){console.error("Missing guess input:",field);return;}
 const value=input.value.trim();if(!value){toast(type==="character"?"Type a character name first.":"Type a title first.");input.focus();return;}
 const answers=type==="character"?[activeCharacter.name,...(activeCharacter.aliases||[])]:[activeCharacter.franchise,...(activeCharacter.franchiseAliases||[])];
 if(checkGuess(value,answers)){
   const alreadyAwarded=type==="character"?characterGuessAwarded:titleGuessAwarded;
   if(alreadyAwarded){toast("You already earned points for that!");return;}
   if(type==="character"){soloScore+=1;characterGuessAwarded=true;toast("Correct character! +1 point");}
   else{soloScore+=2;titleGuessAwarded=true;toast("Correct title! +2 points");}
   showGuessFeedback(true,type);
   $("soloScore").textContent=`Score: ${soloScore}`;
   input.disabled=true;
   input.placeholder="Correct! Start a new round to guess again.";
 }else{
   showGuessFeedback(false,type);
   toast("Not quite — unlimited guesses, keep trying!");
   input.select();
 }
}

// Free character-knowledge helper.
// It uses public Wikipedia summaries (no API key and no paid AI service).
// It only answers from retrieved text and says when a detail cannot be verified.
const wikiKnowledgeCache = new Map();

function cleanWikiTitle(value){
 return String(value||"").trim().replace(/\s+/g," ");
}
async function fetchWikiSummary(title){
 const safeTitle=cleanWikiTitle(title);
 if(!safeTitle)return "";
 const key=safeTitle.toLowerCase();
 if(wikiKnowledgeCache.has(key))return wikiKnowledgeCache.get(key);
 try{
   const url="https://en.wikipedia.org/api/rest_v1/page/summary/"+encodeURIComponent(safeTitle);
   const response=await fetch(url,{headers:{Accept:"application/json"}});
   if(!response.ok)throw new Error("Wikipedia summary unavailable");
   const data=await response.json();
   const extract=typeof data.extract==="string"?data.extract:"";
   wikiKnowledgeCache.set(key,extract);
   return extract;
 }catch(error){
   wikiKnowledgeCache.set(key,"");
   return "";
 }
}
function redactSecret(text,c){
 let result=String(text||"");
 const secretNames=[c?.name,...(c?.aliases||[])].filter(Boolean).sort((a,b)=>b.length-a.length);
 for(const name of secretNames){
   result=result.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"gi"),"the character");
 }
 return result;
}
function questionTopic(q){
 if(/hair|hairstyle|hair colour|hair color|eyes|eye colour|eye color|appearance|look like|wear|outfit|clothes|height/.test(q))return "appearance";
 if(/power|ability|abilities|skill|weapon|fight|strong|strength|magic|technique|attack/.test(q))return "abilities";
 if(/personality|behav|kind of person|attitude|characteristic|temper/.test(q))return "personality";
 if(/friend|family|sister|brother|mother|father|parent|enemy|rival|relationship|love|partner/.test(q))return "relationships";
 if(/backstory|past|childhood|origin|history|where.*from|background/.test(q))return "background";
 if(/anime|show|series|movie|game|franchise|title/.test(q))return "title";
 if(/genre|category|type|kind/.test(q))return "genre";
 return "general";
}
function answerFromSource(question,source,c){
 const q=question.toLowerCase();
 const topic=questionTopic(q);
 const sentences=(source||"").replace(/\s+/g," ").match(/[^.!?]+[.!?]?/g)||[];
 const topicWords={
  appearance:["hair","eyes","wears","wearing","appearance","tall","short","clothing","outfit","skin"],
  abilities:["power","ability","abilities","magic","fights","fighter","weapon","skill","technique","strength","can","uses"],
  personality:["personality","kind","calm","cheerful","quiet","serious","brave","shy","friendly","arrogant","intelligent"],
  relationships:["friend","family","sister","brother","mother","father","enemy","rival","wife","husband","relationship"],
  background:["born","childhood","past","origin","grew","raised","background","before","village","kingdom"],
  general:[]
 };
 let candidates=sentences.filter(s=>s.length>25 && s.length<420);
 if(topic!=="general" && topic!=="title" && topic!=="genre"){
   const words=topicWords[topic]||[];
   const matches=candidates.filter(s=>words.some(w=>s.toLowerCase().includes(w)));
   if(matches.length)candidates=matches;
   else return "";
 }
 if(topic==="title"||topic==="genre")return "";
 const chosen=candidates.slice(0,2).join(" ").trim();
 return chosen?redactSecret(chosen,c):"";
}
async function answerSoloQuestion(question){
 const c=activeCharacter;
 if(!c)return "Start a round first.";
 const q=question.toLowerCase();
 if(/(what|which) (anime|show|series|movie|game|franchise|title)/.test(q))return `The title is ${c.franchise}.`;
 if(q.includes("category"))return `This character is in ${c.category}.`;
 if(q.includes("difficult")||q.includes("difficulty"))return `Difficulty: ${c.difficulty}.`;
 if(q.includes("genre")||q.includes("type")||q.includes("kind"))return `Known tags: ${(c.subcategory||[]).join(", ")||"not listed"}.`;
 if(q.includes("name")||q.includes("who is")||q.includes("tell me who"))return "I can't reveal the character's name—that's what you're guessing!";
 const [characterFacts,titleFacts]=await Promise.all([
   fetchWikiSummary(c.name),
   fetchWikiSummary(c.franchise)
 ]);
 const answer=answerFromSource(question,characterFacts,c);
 if(answer)return `From my free character encyclopedia: ${answer}`;
 const titleAnswer=answerFromSource(question,titleFacts,c);
 if(titleAnswer)return `From the series information: ${titleAnswer}`;
 return "I don't have a reliable source for that detail yet. I won't make something up. Try asking about appearance, abilities, personality, relationships or backstory.";
}
async function askQuestion(){
 const q=$("questionInput").value.trim();if(!q)return toast("Write a question first.");
 const el=document.createElement("div");el.className="question-item";
 if(mode==="solo"){
   el.textContent=`You: ${q} — AI: Looking up character information…`;
   $("questionList").prepend(el);
   $("questionInput").value="";
   const answer=await answerSoloQuestion(q);
   el.textContent=`You: ${q} — AI: ${answer}`;
 }else{
   el.textContent=q+" — waiting for answers";
   $("questionList").prepend(el);$("questionInput").value="";
   toast("Question sent to the room.");
 }
}
function giveUp(){
 if(!activeCharacter)return;
 $("mysteryName").textContent=activeCharacter.name;
 $("mysteryHint").textContent=`Answer: ${activeCharacter.name} · Title: ${activeCharacter.franchise}`;
 setArt($("mysteryArt"),activeCharacter.image||"",activeCharacter.name);
 $("seriesArtLabel").textContent=(activeCharacter.franchise||"Series").toUpperCase();
 setArt($("seriesArt"),activeCharacter.franchiseImage||"",activeCharacter.franchise);
 $("guessInput").disabled=true;$("titleInput").disabled=true;$("giveUpBtn").disabled=true;
 toast("Round revealed. No points earned for giving up.");
}
async function initFirebase(){
  const status=$("connection");
  status.innerHTML="<i></i> Connecting…";
  status.classList.remove("online");
  try{
    // Load Firebase lazily so a blocked/offline Firebase CDN never prevents the game UI from starting.
    const [appMod, authMod, dbMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js")
    ]);
    const { initializeApp } = appMod;
    const { getAuth, signInAnonymously, onAuthStateChanged } = authMod;
    ({ getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, addDoc, serverTimestamp } = dbMod);
    app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
    onAuthStateChanged(auth,u=>{
      user=u;
      if(u){status.innerHTML="<i></i> Multiplayer connected";status.classList.add("online");}
      else{status.innerHTML="<i></i> Solo ready · Multiplayer offline";status.classList.remove("online");}
    });
    const credential = await signInAnonymously(auth);
    user = credential.user;
  }catch(e){
    user=null;status.innerHTML="<i></i> Solo ready · Multiplayer offline";status.classList.remove("online");
    console.warn("Firebase connection unavailable; solo mode remains usable:",e);
  }
}
function makeCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join("");}
async function createRoom(){roomId=null;if(!db||!user){toast("Firebase is still signing you in. Wait for Multiplayer connected and try again.");return false;}try{const code=makeCode();const ref=doc(db,"rooms",code);const settings={host:user.uid,code,players:[{uid:user.uid,name:"Host",score:0}],category:$("categorySelect").value,subcategory:$("subSelect").value,maxPlayers:Number($("playerLimit").value),roundLength:Number($("roundLength").value),status:"lobby",createdAt:serverTimestamp()};await setDoc(ref,settings);roomId=code;roomData=settings;$("roomInfo").classList.remove("hidden");$("roomCodeDisplay").textContent=code;$("gameHeading").textContent="Waiting for friends";$("gameMode").textContent="MULTIPLAYER ROOM";$("mysteryArt").textContent="⌛";$("mysteryName").textContent="Room lobby";$("mysteryHint").textContent="Share the code with your friends. Lobby syncing is active.";$("gameDialog").showModal();listenRoom();return true;}catch(e){console.error("Room creation failed:",e);toast("Room creation failed: "+(e?.message||e?.code||"Unknown error"));return false;}}
async function joinRoom(code){if(!db||!user)return toast("Enable Firebase first (see README).");code=code.toUpperCase().trim();if(code.length!==6)return toast("Enter a 6-character room code.");try{const ref=doc(db,"rooms",code),snap=await getDoc(ref);if(!snap.exists())return toast("Room not found.");const data=snap.data();if(data.players.length>=data.maxPlayers)return toast("That room is full.");if(!data.players.some(p=>p.uid===user.uid)){await updateDoc(ref,{players:[...data.players,{uid:user.uid,name:"Player "+(data.players.length+1),score:0}]});}roomId=code;roomData=data;$("roomInfo").classList.remove("hidden");$("roomCodeDisplay").textContent=code;$("gameHeading").textContent="Waiting for host";$("gameMode").textContent="MULTIPLAYER ROOM";$("mysteryArt").textContent="⌛";$("mysteryName").textContent="Room lobby";$("mysteryHint").textContent="You joined. Wait for the host to start."; $("gameDialog").showModal();listenRoom();}catch(e){toast("Could not join room. Check the code and Firebase rules.");console.error(e);}}
function listenRoom(){
  if(roomUnsub)roomUnsub(); if(chatUnsub)chatUnsub();
  roomUnsub=onSnapshot(doc(db,"rooms",roomId),snap=>{
    if(!snap.exists())return; roomData=snap.data();
    $("playersList").innerHTML=(roomData.players||[]).map(p=>`<div class="question-item">${escapeHTML(p.name||"Player")} <span style="float:right">${Number(p.score)||0} pts</span></div>`).join("");
    $("gameHeading").textContent=roomData.status==="lobby"?"Waiting in lobby":"Round in progress";
  },err=>{console.error("Room listener:",err);toast("Live room connection lost.");});
  chatUnsub=onSnapshot(collection(db,"rooms",roomId,"chat"),snap=>{
    const players=roomData?.players||[];
    const messages=snap.docs.map(d=>({id:d.id,...d.data()}));
    messages.sort((a,b)=>(a.createdAt?.toMillis?.()||0)-(b.createdAt?.toMillis?.()||0));
    const log=$("chatLog");log.innerHTML="";
    for(const m of messages){const player=players.find(p=>p.uid===m.uid);const name=player?.name||(m.uid===user?.uid?"You":"Player");
      const row=document.createElement("div");row.className="question-item";row.textContent=`${name}: ${m.message||""}`;log.append(row);}
    log.scrollTop=log.scrollHeight;
  },err=>{console.error("Chat listener:",err);toast("Chat couldn't sync. Check Firestore chat rules.");});
}
function escapeHTML(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","\'":"&#39;"}[c]));}
async function sendChat(){const msg=$("chatInput").value.trim();if(!msg)return;if(!roomId||!db||!user){toast("Join a multiplayer room to use live chat.");return;}try{await addDoc(collection(db,"rooms",roomId,"chat"),{uid:user.uid,message:msg,createdAt:serverTimestamp()});$("chatInput").value="";}catch(e){toast("Chat could not send. Check Firestore chat rules.");console.error("Send chat:",e);}}
async function startSetup(e){e.preventDefault();const cat=$("categorySelect").value,sub=$("subSelect").value;if(mode==="room"){const created=await createRoom();if(!created)return;}else{$("roomInfo").classList.add("hidden");openRound(chooseCharacter(cat,sub));}$("setupDialog").close();}
$("createBtn").onclick=()=>showSetup("room");$("multiplayerBtn").onclick=()=>showSetup("room");$("soloBtn").onclick=()=>showSetup("solo");$("joinToggle").onclick=()=>$("joinPanel").classList.toggle("hidden");$("joinBtn").onclick=()=>joinRoom($("joinCode").value);$("setupForm").addEventListener("submit",startSetup);$("categorySelect").onchange=updateSubcategories;
$("guessCharacter").type="button";$("guessTitle").type="button";$("guessCharacter").addEventListener("click",e=>{e.preventDefault();guess("character");});$("giveUpBtn").onclick=giveUp;$("guessInput").onkeydown=e=>{if(e.key==="Enter")guess("character");};$("titleInput").onkeydown=e=>{if(e.key==="Enter")guess("title");};$("questionInput").onkeydown=e=>{if(e.key==="Enter")askQuestion();};$("chatInput").onkeydown=e=>{if(e.key==="Enter")sendChat();};$("guessTitle").addEventListener("click",e=>{e.preventDefault();guess("title");});$("askBtn").onclick=askQuestion;$("sendChat").onclick=sendChat;$("closeGame").onclick=()=>{$("gameDialog").close();if(roomUnsub)roomUnsub();if(chatUnsub)chatUnsub();};$("howBtn").onclick=()=>$("howDialog").showModal();$("closeHow").onclick=()=>$("howDialog").close();$("newRound").onclick=()=>{if(mode==="solo"){ $("guessInput").disabled=false;$("titleInput").disabled=false;$("giveUpBtn").disabled=false;openRound(chooseCharacter($("categorySelect").value,$("subSelect").value));}else toast("Host-controlled round start is part of the next build step.");};$("copyCode").onclick=()=>navigator.clipboard.writeText(roomId).then(()=>toast("Room code copied!")).catch(()=>toast("Copy the code: "+roomId));
$("categorySelect").value="Anime";renderCategories();updateSubcategories();await loadCatalog();await initFirebase();
