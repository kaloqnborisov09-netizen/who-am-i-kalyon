import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const categories = [
 ["Anime","Isekai · Shonen · Romance · Shojo · Seinen · Fantasy · Action"],
 ["Western Animation","Cartoons · Adventure · Comedy · Fantasy"],
 ["Movies","Animation · Sci-Fi · Action · Comedy · Fantasy"],
 ["TV Shows","Drama · Mystery · Comedy · Sci-Fi · Fantasy"],
 ["Video Games","RPG · Adventure · Action · Indie · Fighting"],
 ["Comics","Marvel · DC · Superhero · Manga-style comics"]
];
const subcategories = ["All","Isekai","Shonen","Romance","Shojo","Seinen","Fantasy","Action","Comedy","Slice of Life","Horror","Sports","Adventure","Mystery","Sci-Fi","Drama","Superhero","RPG"];
let soloScore=0, characterGuessAwarded=false, titleGuessAwarded=false;
let selectedCategory="All", catalog=[], app, auth, db, user=null, roomId=null, roomUnsub=null, chatUnsub=null, activeCharacter=null, mode="solo", roomData=null, timer=null;
const toast = msg => { $("toast").textContent=msg; $("toast").classList.add("show"); setTimeout(()=>$("toast").classList.remove("show"),2600); };
function showSetup(kind){mode=kind;$("setupTitle").textContent=kind==="room"?"Set up your room":"Set up solo mode";$("setupDialog").showModal();}
function renderCategories(){ $("categoryGrid").innerHTML=categories.map(([name,desc])=>`<button class="category ${selectedCategory===name?"active":""}" data-cat="${name}"><b>${name}</b><small>${desc}</small></button>`).join(""); document.querySelectorAll("[data-cat]").forEach(b=>b.onclick=()=>{selectedCategory=b.dataset.cat;$("categorySelect").value=selectedCategory;renderCategories();});}
function updateSubcategories(){const c=$("categorySelect").value;const opts=c==="Anime"?["All","Isekai","Shonen","Romance","Shojo","Seinen","Fantasy","Action","Comedy","Slice of Life","Horror","Sports"]:subcategories;$("subSelect").innerHTML=opts.map(x=>`<option>${x}</option>`).join("");}
async function loadCatalog(){try{const r=await fetch("./data/characters.json");catalog=await r.json();}catch(e){catalog=[];}}
function chooseCharacter(cat,sub){let pool=catalog.filter(x=>(cat==="All"||x.category===cat)&&(sub==="All"||x.subcategory.includes(sub)));if(!pool.length)pool=catalog.filter(x=>cat==="All"||x.category===cat);return pool[Math.floor(Math.random()*pool.length)];}
function setArt(container, url, alt){
  container.innerHTML="";
  if(url){const img=document.createElement("img");img.src=url;img.alt=alt;img.loading="lazy";img.onerror=()=>{container.innerHTML='<div class="art-placeholder">✦</div>';};container.append(img);}
  else container.innerHTML='<div class="art-placeholder">✦</div>';
}
async function commonsArtwork(searchText){
  // Wikimedia Commons public API: best-effort image search for non-anime characters and titles.
  const url=`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchText)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*`;
  const response=await fetch(url); if(!response.ok) return "";
  const json=await response.json(); const pages=Object.values(json.query?.pages||{});
  const page=pages.find(x=>x.imageinfo?.[0]?.thumburl||x.imageinfo?.[0]?.url);
  return page?.imageinfo?.[0]?.thumburl||page?.imageinfo?.[0]?.url||"";
}
async function loadCharacterArtwork(character){
  const characterBox=$("mysteryArt"), seriesBox=$("seriesArt");
  setArt(characterBox, character.image || character.characterImage || "", character.name);
  $("seriesArtLabel").textContent=(character.franchise||"Series").toUpperCase();
  setArt(seriesBox, character.franchiseImage || character.seriesImage || "", character.franchise||"Series artwork");
  const current=()=>activeCharacter?.id===character.id;
  if(character.category==="Anime"){
    if(!character.image){
      try{
        const res=await fetch(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(character.name)}&limit=5`);
        if(res.ok){const data=await res.json();const hit=(data.data||[]).find(x=>normalize(x.name||"")===normalize(character.name));
          const portrait=hit?.images?.jpg?.image_url||hit?.images?.webp?.image_url;
          if(portrait&&current())setArt(characterBox,portrait,character.name);
        }
      }catch(e){console.info("Character artwork lookup unavailable.");}
    }
    if(!character.franchiseImage){
      try{const res=await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(character.franchise)}&limit=1`);
        if(res.ok){const data=await res.json(),hit=(data.data||[]).find(x=>normalize(x.title||"")===normalize(character.franchise)||normalize(x.title_english||"")===normalize(character.franchise));const poster=hit?.images?.jpg?.image_url||hit?.images?.webp?.image_url;if(poster&&current())setArt(seriesBox,poster,character.franchise);}
      }catch(e){console.info("Series artwork lookup unavailable.");}
    }
  }else{
    try{const portrait=character.image||await commonsArtwork(`${character.name} ${character.franchise} character`);if(portrait&&current())setArt(characterBox,portrait,character.name);}catch(e){console.info("Character artwork lookup unavailable.");}
    try{const poster=character.franchiseImage||await commonsArtwork(`${character.franchise} poster logo`);if(poster&&current())setArt(seriesBox,poster,character.franchise);}catch(e){console.info("Title artwork lookup unavailable.");}
  }
}
function openRound(character){if(!character){toast("No characters in that collection yet.");return;}activeCharacter=character;characterGuessAwarded=false;titleGuessAwarded=false;$("soloScore").textContent=`Score: ${soloScore}`;$("mysteryArt").innerHTML='<div class="art-placeholder">?</div>';$("seriesArt").innerHTML='<div class="art-placeholder">✦</div>';
  $("mysteryName").textContent="Hidden from you";
  $("mysteryHint").textContent=`Category: ${character.category} · Difficulty: ${character.difficulty}`;
  $("guessInput").value="";$("titleInput").value="";$("questionList").innerHTML='<p class="muted">Questions will appear here.</p>';
  $("chatLog").innerHTML="";$("chatInput").value="";document.querySelectorAll(".game-side .panel").forEach((p,i)=>{if(i===2)p.classList.toggle("hidden",mode==="solo");});$("questionPanelTitle").textContent=mode==="solo"?"ASK THE AI":"ASK EVERYONE";$("askBtn").textContent=mode==="solo"?"Ask AI":"Ask";$("gameDialog").showModal();$("gameMode").textContent=mode==="solo"?"SOLO ROUND":"ROOM ROUND";
  loadCharacterArtwork(character);
}
function normalize(s){return s.toLowerCase().replace(/[^a-z0-9]/g,"");}
function checkGuess(value,answers){const v=normalize(value);return !!v&&answers.some(a=>normalize(a)===v);}
function guess(type){
 const field=type==="character"?"guessInput":"titleInput";
 const value=$(field).value.trim();if(!value)return toast("Type your guess first.");
 const answers=type==="character"?[activeCharacter.name,...(activeCharacter.aliases||[])]:[activeCharacter.franchise,...(activeCharacter.franchiseAliases||[])];
 if(checkGuess(value,answers)){
   if(type==="character"&&!characterGuessAwarded){soloScore+=1;characterGuessAwarded=true;toast("Correct character! +1 point");}
   else if(type==="title"&&!titleGuessAwarded){soloScore+=2;titleGuessAwarded=true;toast("Correct title! +2 points");}
   else toast("You already earned points for that!");
   $("soloScore").textContent=`Score: ${soloScore}`;
   $(field).disabled=true;
 }else toast("Not quite — unlimited guesses, keep trying!");
}
function answerSoloQuestion(question){
 const c=activeCharacter, q=question.toLowerCase();
 const tags=[...(c.subcategory||[]),c.category,c.difficulty].map(x=>String(x).toLowerCase());
 if(/(what|which) (anime|show|series|movie|game|franchise|title)/.test(q))return `The title is ${c.franchise}.`;
 if(q.includes("category"))return `This character is in ${c.category}.`;
 if(q.includes("difficult")||q.includes("difficulty"))return `Difficulty: ${c.difficulty}.`;
 if(q.includes("genre")||q.includes("type")||q.includes("kind"))return `Known tags: ${(c.subcategory||[]).join(", ")||"not listed"}.`;
 if(q.includes("name")||q.includes("who is"))return "I can't reveal the character's name—that's what you're guessing!";
 const matched=tags.find(t=>q.includes(t));
 if(matched){
   if(/\b(is|are|does|has|can|have|wear|live|from|in)\b/.test(q))return `Based on the character data, yes: “${matched}” is listed.`;
 }
 if(q.startsWith("is ")||q.startsWith("does ")||q.startsWith("has ")||q.startsWith("can ")||q.startsWith("are ")||q.startsWith("do "))
   return "I don't have reliable information to answer that from this character's database. Try asking about the category, title, or listed tags.";
 return "I can answer using the character's stored category, title, difficulty, and tags. Try a yes/no question or ask about those details.";
}
function askQuestion(){
 const q=$("questionInput").value.trim();if(!q)return toast("Write a question first.");
 const el=document.createElement("div");el.className="question-item";
 if(mode==="solo"){el.textContent=`You: ${q} — AI: ${answerSoloQuestion(q)}`;}
 else{el.textContent=q+" — waiting for answers";}
 $("questionList").prepend(el);$("questionInput").value="";
 if(mode==="room")toast("Question sent to the room.");
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
    app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
    onAuthStateChanged(auth,u=>{
      user=u;
      if(u){status.innerHTML="<i></i> Multiplayer connected";status.classList.add("online");}
      else{status.innerHTML="<i></i> Solo ready · Multiplayer offline";status.classList.remove("online");}
    });
    await signInAnonymously(auth);
  }catch(e){
    user=null;status.innerHTML="<i></i> Solo ready · Multiplayer offline";status.classList.remove("online");
    console.warn("Firebase connection unavailable; solo mode remains usable:",e);
  }
}
function makeCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join("");}
async function createRoom(){if(!db||!user)return toast("Enable Anonymous Authentication and Firestore first (see README).");const code=makeCode();const ref=doc(db,"rooms",code);const settings={host:user.uid,code,players:[{uid:user.uid,name:"Host",score:0}],category:$("categorySelect").value,subcategory:$("subSelect").value,maxPlayers:Number($("playerLimit").value),roundLength:Number($("roundLength").value),status:"lobby",createdAt:serverTimestamp()};try{await setDoc(ref,settings);roomId=code;roomData=settings;$("roomInfo").classList.remove("hidden");$("roomCodeDisplay").textContent=code;$("gameHeading").textContent="Waiting for friends";$("gameMode").textContent="MULTIPLAYER ROOM";$("mysteryArt").textContent="⌛";$("mysteryName").textContent="Room lobby";$("mysteryHint").textContent="Share the code with your friends. Lobby syncing is active."; $("gameDialog").showModal();listenRoom();}catch(e){toast("Could not create room. Check Firebase rules.");console.error(e);}}
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
async function startSetup(e){e.preventDefault();const cat=$("categorySelect").value,sub=$("subSelect").value;$("setupDialog").close();if(mode==="room"){await createRoom();}else{ $("roomInfo").classList.add("hidden");openRound(chooseCharacter(cat,sub));}}
$("createBtn").onclick=()=>showSetup("room");$("multiplayerBtn").onclick=()=>showSetup("room");$("soloBtn").onclick=()=>showSetup("solo");$("joinToggle").onclick=()=>$("joinPanel").classList.toggle("hidden");$("joinBtn").onclick=()=>joinRoom($("joinCode").value);$("startSetup").onclick=startSetup;$("categorySelect").onchange=updateSubcategories;
$("guessCharacter").onclick=()=>guess("character");$("giveUpBtn").onclick=giveUp;$("guessInput").onkeydown=e=>{if(e.key==="Enter")guess("character");};$("titleInput").onkeydown=e=>{if(e.key==="Enter")guess("title");};$("questionInput").onkeydown=e=>{if(e.key==="Enter")askQuestion();};$("chatInput").onkeydown=e=>{if(e.key==="Enter")sendChat();};$("guessTitle").onclick=()=>guess("title");$("askBtn").onclick=askQuestion;$("sendChat").onclick=sendChat;$("closeGame").onclick=()=>{$("gameDialog").close();if(roomUnsub)roomUnsub();if(chatUnsub)chatUnsub();};$("howBtn").onclick=()=>$("howDialog").showModal();$("closeHow").onclick=()=>$("howDialog").close();$("newRound").onclick=()=>{if(mode==="solo"){ $("guessInput").disabled=false;$("titleInput").disabled=false;$("giveUpBtn").disabled=false;openRound(chooseCharacter($("categorySelect").value,$("subSelect").value));}else toast("Host-controlled round start is part of the next build step.");};$("copyCode").onclick=()=>navigator.clipboard.writeText(roomId).then(()=>toast("Room code copied!")).catch(()=>toast("Copy the code: "+roomId));
renderCategories();updateSubcategories();await loadCatalog();await initFirebase();
