/* game.js — محدث:
 - يحمّل مؤثرات MP3 (assets/sounds/*.mp3) ويستخدمها إن وجدت
 - يحتفظ بإعداد الصوت في localStorage gt_sound_pref
 - في حالة فشل التحميل أو حظر التشغيل يستخدم WebAudio tones كما كان سابقاً
 - أضفنا زر تبديل الصوت + تحكم مستوى الصوت
 - بقيت كل الميزات القديمة (Firebase, ads, gamelogic) كما هي
*/

'use strict';

const stagesContainer = document.getElementById('stages-container');
const gameScreen = document.getElementById('game-screen');
const stageTitleEl = document.getElementById('stage-title');
const actorImage = document.getElementById('actor-image');
const optionsGrid = document.getElementById('options');
const progressEl = document.getElementById('progress');
const coinsEl = document.getElementById('coins');
const backBtn = document.getElementById('back-to-stages');
const nextBtn = document.getElementById('next-btn');
const roundResult = document.getElementById('round-result');
const stageScoreEl = document.getElementById('stage-score');
const watchAdBtn = document.getElementById('watch-ad-btn');
const adModal = document.getElementById('rewarded-ad');
const adTimer = document.getElementById('ad-timer');
const adImage = document.getElementById('ad-image');
const adMessage = document.getElementById('ad-message');
const closeAdBtn = document.getElementById('close-ad-btn');

const soundToggleBtn = document.getElementById('sound-toggle');
const soundVolumeSlider = document.getElementById('sound-volume');

let stagesData = {};
let currentStageId = null;
let currentActors = [];
let currentIndex = 0;
let score = 0;

/* --- persistent state keys (موحد) --- */
const STORAGE_KEYS = {
  COINS: 'gt_coins',
  COMPLETED: 'gt_completed',
  UNLOCKED: 'gt_unlocked',
  AD_DATA: 'adData',
  SOUND_PREF: 'gt_sound_pref'
};

let coins = parseInt(localStorage.getItem(STORAGE_KEYS.COINS) || '0', 10);
let completedStages = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPLETED) || '[]');
let unlockedStages = JSON.parse(localStorage.getItem(STORAGE_KEYS.UNLOCKED) || '["stage1"]');

updateCoinsDisplay();

/* ================= Sounds (WebAudio fallback + MP3 preloads) ================= */
const AudioEngine = (function(){
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  function playTone(type='sine', freq=440, duration=0.12, gain=0.12, decay=0.02){
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration + decay);
      o.connect(g); g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + duration + decay);
    } catch(e) { /* ignore */ }
  }
  function click(){ playTone('square', 900, 0.06, 0.06); }
  function success(){ playTone('sine', 660, 0.18, 0.14); playTone('sine', 880, 0.08, 0.08); }
  function fail(){ playTone('sawtooth', 240, 0.18, 0.12); }
  function coin(){ playTone('triangle', 1000, 0.06, 0.08); setTimeout(()=>playTone('sine', 760, 0.06, 0.06), 70); }
  return { click, success, fail, coin, ctx };
})();

/* SoundManager: يحاول استخدام ملفات MP3 ثم fallback */
const SoundManager = (function(){
  const basePath = 'assets/sounds/';
  const files = {
    click: basePath + 'click.mp3',
    success: basePath + 'success.mp3',
    fail: basePath + 'fail.mp3',
    coin: basePath + 'coin.mp3',
    // optional: bg: basePath + 'bg.mp3'
  };
  const audios = {};
  let enabled = true;
  let volume = 0.8;
  let loaded = false;

  function load() {
    // تحميل الأصوات كـ Audio objects
    Object.keys(files).forEach(key => {
      try {
        const a = new Audio();
        a.src = files[key];
        a.preload = 'auto';
        a.crossOrigin = "anonymous";
        a.volume = volume;
        audios[key] = a;
        // read errors quietly
        a.addEventListener('error', () => {
          // remove on error to fallback to AudioEngine
          delete audios[key];
        });
      } catch(e) {
        // fallback: ignore
      }
    });
    loaded = true;
  }

  function play(name) {
    if(!enabled) return;
    // if audio file available, clone and play to allow overlap
    const a = audios[name];
    if(a && a.src) {
      try {
        const clone = a.cloneNode();
        clone.volume = volume;
        clone.play().catch(()=>{ /* autoplay blocked */ });
        return;
      } catch(e){
        // fallback below
      }
    }
    // fallback to oscillator tones
    switch(name){
      case 'click': AudioEngine.click(); break;
      case 'success': AudioEngine.success(); break;
      case 'fail': AudioEngine.fail(); break;
      case 'coin': AudioEngine.coin(); break;
      default: break;
    }
  }

  function setEnabled(v){
    enabled = Boolean(v);
    localStorage.setItem(STORAGE_KEYS.SOUND_PREF, JSON.stringify({enabled, volume}));
    updateSoundUI();
  }

  function setVolume(v){
    volume = Number(v);
    // update base audios
    Object.values(audios).forEach(x => { try{ x.volume = volume; }catch(e){} });
    localStorage.setItem(STORAGE_KEYS.SOUND_PREF, JSON.stringify({enabled, volume}));
  }

  function restoreFromStorage(){
    try{
      const raw = localStorage.getItem(STORAGE_KEYS.SOUND_PREF);
      if(raw){
        const p = JSON.parse(raw);
        enabled = p.enabled !== undefined ? p.enabled : enabled;
        volume = p.volume !== undefined ? Number(p.volume) : volume;
      }
    }catch(e){}
  }

  function updateSoundUI(){
    if(soundToggleBtn){
      soundToggleBtn.setAttribute('aria-pressed', String(enabled));
      if(enabled) soundToggleBtn.classList.remove('ghost'); else soundToggleBtn.classList.add('ghost');
    }
    if(soundVolumeSlider) soundVolumeSlider.value = volume;
  }

  // public api
  return {
    init: function(){
      restoreFromStorage();
      load();
      updateSoundUI();
    },
    play,
    setEnabled,
    setVolume,
    isEnabled: ()=>enabled,
    getVolume: ()=>volume,
    resumeAudioContext: function(){
      try{
        if(AudioEngine.ctx && AudioEngine.ctx.state === 'suspended') AudioEngine.ctx.resume();
      } catch(e){}
    }
  };
})();

/* allow audio on first interaction for mobile autoplay policies */
document.addEventListener('pointerdown', function once() {
  SoundManager.resumeAudioContext();
  document.removeEventListener('pointerdown', once);
});

SoundManager.init();

/* ================= Utilities ================= */
function saveState(){
  localStorage.setItem(STORAGE_KEYS.COINS, String(coins));
  localStorage.setItem(STORAGE_KEYS.COMPLETED, JSON.stringify(completedStages));
  localStorage.setItem(STORAGE_KEYS.UNLOCKED, JSON.stringify(unlockedStages));
}

/* safe text rendering to prevent HTML injection */
function safeText(node, text){
  node.textContent = text ?? '';
}

/* very basic image url validation */
function isValidImageUrl(url){
  try{
    if(!url) return false;
    const u = new URL(url, location.origin);
    // allow https and data images
    return (u.protocol === 'https:' || u.protocol === 'data:');
  }catch(e){
    return false;
  }
}

/* shuffle */
function shuffleArray(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* update coin UI */
function updateCoinsDisplay(){
  coinsEl.textContent = coins;
}

/* synchronize coins between tabs */
window.addEventListener('storage', (ev) => {
  if(ev.key === STORAGE_KEYS.COINS){
    coins = parseInt(ev.newValue || '0', 10);
    updateCoinsDisplay();
  }
});

/* Hover on touch devices: add 'hover' class on touchstart and remove on touchend */
function makeTouchHoverable(el){
  el.addEventListener('touchstart', () => el.classList.add('hover'), {passive:true});
  el.addEventListener('touchend', () => el.classList.remove('hover'), {passive:true});
  el.addEventListener('touchcancel', () => el.classList.remove('hover'), {passive:true});
}

/* ================= Firebase: realtime updates ================= */
/* fetch initial and listen for changes */
function fetchStagesRealtime(){
  const ref = db.ref('stages'); // assumes firebase-init.js prepared `db = firebase.database()`
  ref.on('value', snap => {
    stagesData = snap.val() || {};
    renderStages();
  }, err => {
    console.error('Firebase realtime error', err);
    stagesContainer.innerHTML = '<p class="smallnote">فشل جلب البيانات. اتأكد من اتصال Firebase.</p>';
  });
}

/* ================= Render UI ================= */
function renderStages(){
  stagesContainer.innerHTML = '';
  const ids = Object.keys(stagesData).sort();
  if(ids.length === 0){
    const p = document.createElement('p');
    p.className = 'smallnote';
    p.textContent = 'لا توجد مراحل. افتح الداشبورد وأضف مراحل.';
    stagesContainer.appendChild(p);
    return;
  }

  ids.forEach(id=>{
    const s = stagesData[id] || {};
    const card = document.createElement('div');
    card.className = 'stage-card hoverable';
    makeTouchHoverable(card);

    const title = document.createElement('h3');
    title.textContent = s.title || id;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `ممثلين: ${ (s.actors || []).length } • نوع: ${ s.free ? 'مجانية' : 'مدفوعة' }`;

    const actions = document.createElement('div');
    actions.className = 'actions';

    const startBtn = document.createElement('button');
    startBtn.className = 'btn small hoverable';
    startBtn.textContent = 'ابدأ';
    startBtn.dataset.id = id;
    makeTouchHoverable(startBtn);
    startBtn.addEventListener('click', ()=>{
      SoundManager.play('click');
      startStage(id);
    });

    const infoBtn = document.createElement('button');
    infoBtn.className = 'btn ghost small hoverable';
    infoBtn.textContent = 'عرض';
    infoBtn.addEventListener('click', ()=>{
      SoundManager.play('click');
      showStageInfo(id);
    });
    makeTouchHoverable(infoBtn);

    actions.appendChild(startBtn);
    actions.appendChild(infoBtn);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(actions);

    if(!unlockedStages.includes(id) && !s.free){
      const lock = document.createElement('div');
      lock.className = 'lock-overlay';
      lock.innerHTML = `<div style="text-align:center">
        مغلق — افتح بـ <strong>20</strong> كوينز<br/>
        <button class="btn" data-id="${id}" data-action="buy">فتح</button>
      </div>`;
      const buyBtn = lock.querySelector('button[data-action="buy"]');
      buyBtn.addEventListener('click', ()=>{
        SoundManager.play('click');
        handleBuyStage(id);
      });
      card.appendChild(lock);
    }

    if(completedStages.includes(id)){
      const done = document.createElement('div');
      done.className = 'meta';
      done.style.marginTop = '8px';
      done.textContent = 'مُنجز ✓';
      card.appendChild(done);
    }

    stagesContainer.appendChild(card);
  });
}

/* ================= Stage operations ================= */
function handleBuyStage(id){
  if(coins < 20){
    alert('مش كفاية كوينز. لازم 20 كوينز تفتح المرحلة.');
    return;
  }
  if(confirm('هل متأكد إنك عايز تفتح المرحلة بـ20 كوينز؟')){
    coins -= 20;
    unlockedStages.push(id);
    saveState();
    updateCoinsDisplay();
    SoundManager.play('coin');
    renderStages();
  }
}

function showStageInfo(id){
  const s = stagesData[id];
  if(!s) return alert('المرحلة مش موجودة');
  const cnt = (s.actors || []).length;
  alert(`عنوان: ${s.title || id}\nممثلين: ${cnt}\nنوع: ${s.free ? 'مجانية' : 'مدفوعة'}`);
}

function startStage(id){
  const stage = stagesData[id];
  if(!stage) return alert('المرحلة مش موجودة');
  if(!stage.free && !unlockedStages.includes(id)){
    return alert('المرحلة مقفولة — افتحها بالكوينز.');
  }
  currentStageId = id;
  currentActors = (stage.actors || []).slice();
  if(currentActors.length === 0){ alert('لا توجد ممثلين في هذه المرحلة'); return; }
  shuffleArray(currentActors);
  currentIndex = 0;
  score = 0;
  showActor();
  gameScreen.classList.remove('hidden');
  stagesContainer.classList.add('hidden');
  stageTitleEl.textContent = stage.title || id;
  updateStageScore();
  gameScreen.setAttribute('aria-hidden', 'false');
}

/* back */
backBtn.addEventListener('click', ()=>{
  SoundManager.play('click');
  gameScreen.classList.add('hidden');
  stagesContainer.classList.remove('hidden');
  gameScreen.setAttribute('aria-hidden', 'true');
});

/* show current actor */
function showActor(){
  const actor = currentActors[currentIndex];
  const name = actor && actor.name ? actor.name : 'غير معروف';
  const imageUrl = actor && actor.image ? actor.image : '';
  if(isValidImageUrl(imageUrl)){
    actorImage.src = imageUrl;
    actorImage.alt = name;
  } else {
    actorImage.src = '';
    actorImage.alt = 'لا توجد صورة';
  }

  optionsGrid.innerHTML = '';
  let opts = (actor.options || []).slice();
  if(!opts.includes(name)) opts.push(name);
  shuffleArray(opts);
  opts.forEach(opt=>{
    const b = document.createElement('div');
    b.className = 'option hoverable';
    makeTouchHoverable(b);
    b.setAttribute('role', 'listitem');
    b.textContent = opt;
    b.addEventListener('click', ()=>{
      SoundManager.play('click');
      selectOption(b, actor);
    });
    optionsGrid.appendChild(b);
  });

  progressEl.textContent = `${currentIndex+1} / ${currentActors.length}`;
  roundResult.textContent = '';
  nextBtn.classList.add('hidden');
  updateStageScore();
}

/* option selected */
function selectOption(btnEl, actor){
  if(btnEl.classList.contains('disabled')) return;
  Array.from(optionsGrid.children).forEach(c=>c.classList.add('disabled'));

  const chosen = btnEl.textContent.trim();
  const correctName = actor.name;

  if(chosen === correctName){
    btnEl.classList.add('correct');
    roundResult.textContent = 'إجابة صحيحة ✓';
    score++;
    // منح 2 كوينز فورًا
    coins += 2;
    updateCoinsDisplay();
    saveState();
    SoundManager.play('success');
  } else {
    btnEl.classList.add('wrong');
    roundResult.textContent = `غلط — الإجابة الصحيحة: ${correctName}`;
    Array.from(optionsGrid.children).forEach(c=>{
      if(c.textContent.trim() === correctName) c.classList.add('correct');
    });
    SoundManager.play('fail');
  }
  nextBtn.classList.remove('hidden');
  updateStageScore();
}

/* next */
nextBtn.addEventListener('click', ()=>{
  SoundManager.play('click');
  currentIndex++;
  if(currentIndex >= currentActors.length){
    finishStage();
  } else {
    showActor();
  }
});

/* finish stage */
function finishStage(){
  if(!completedStages.includes(currentStageId)){
    completedStages.push(currentStageId);
  }
  saveState();
  alert(`انتهت المرحلة! حصلت على ${score*2} كوينز من هذه المرحلة. التقييم: ${score} / ${currentActors.length}`);
  gameScreen.classList.add('hidden');
  stagesContainer.classList.remove('hidden');
  renderStages();
}

/* stage-score info */
function updateStageScore(){
  const total = currentActors.length || 0;
  stageScoreEl.textContent = `صحيح حالياً: ${score} — المتبقي: ${ Math.max(0, total - (currentIndex+1) ) }`;
}

/* ================= Ad reward logic (حد أقصى مرتين في اليوم) ================= */
const AD_IMAGES = [
  "https://i.postimg.cc/CKpXVD0R/6559874400354694617.png",
  "https://i.postimg.cc/V61xXtHQ/421515973872675488.jpg"
];

function getAdData() {
  const today = new Date().toLocaleDateString();
  let data = JSON.parse(localStorage.getItem(STORAGE_KEYS.AD_DATA) || 'null');
  if (!data || data.date !== today) data = { date: today, count: 0 };
  localStorage.setItem(STORAGE_KEYS.AD_DATA, JSON.stringify(data));
  return data;
}

watchAdBtn.addEventListener('click', () => {
  let adData = getAdData();
  if (adData.count >= 2) {
    alert("وصلت للحد الأقصى من الإعلانات اليوم ✅");
    return;
  }

  // show ad modal
  adImage.src = AD_IMAGES[adData.count % AD_IMAGES.length];
  adTimer.textContent = '5';
  closeAdBtn.classList.add('hidden');
  adModal.classList.remove('hidden');

  let timeLeft = 5;
  const countdown = setInterval(() => {
    timeLeft--;
    adTimer.textContent = String(timeLeft);
    if (timeLeft <= 0) {
      clearInterval(countdown);
      adTimer.textContent = "يمكنك الإغلاق";
      closeAdBtn.classList.remove('hidden');
    }
  }, 1000);

  closeAdBtn.onclick = () => {
    adModal.classList.add('hidden');

    // منح الكوينز
    coins += 20;
    saveState();
    updateCoinsDisplay();
    SoundManager.play('coin');

    // تحديث العداد
    adData.count += 1;
    localStorage.setItem(STORAGE_KEYS.AD_DATA, JSON.stringify(adData));

    // رسالة نجاح
    adMessage.classList.remove('hidden');
    setTimeout(()=> adMessage.classList.add('hidden'), 2500);
  };
});

/* ================= Mobile UX: make hoverable elements react on touch as 'hover' too ================= */
document.querySelectorAll('.hoverable').forEach(el=> makeTouchHoverable(el));

/* ================= Sound UI wiring ================= */
if(soundToggleBtn){
  soundToggleBtn.addEventListener('click', ()=>{
    const newVal = !SoundManager.isEnabled();
    SoundManager.setEnabled(newVal);
    SoundManager.play('click');
  });
}
if(soundVolumeSlider){
  soundVolumeSlider.addEventListener('input', (e)=>{
    const v = Number(e.target.value);
    SoundManager.setVolume(v);
  });
}
/* Initialize UI from stored prefs */
(function initSoundUIFromStorage(){
  try{
    const raw = localStorage.getItem(STORAGE_KEYS.SOUND_PREF);
    if(raw){
      const p = JSON.parse(raw);
      if(p.volume !== undefined) soundVolumeSlider.value = p.volume;
      if(p.enabled !== undefined) {
        if(!p.enabled) soundToggleBtn.classList.add('ghost');
      }
    }
  }catch(e){}
})();

/* ================= Initialize ================= */
fetchStagesRealtime();

/* ================= Safety notes (console hints) ================= */
console.info("Frontend initialized: Realtime stages listener active, SoundManager ready.");

/* ================= Optional: expose some debug helpers (اعرض فقط عند الحاجة) ================= */
window.__GTADATA = {
  getState: () => ({ coins, completedStages, unlockedStages, stagesData }),
  addCoins: (n=1) => { coins += n; saveState(); updateCoinsDisplay(); }
};
