/* game.js — محدث متعدد الميزات:
 - اقتصاد محسن: إجابة صح 2 عملة + مكافآت إنهاء المرحلة + perfect bonus
 - نظام نجوم (1-3) لكل مرحلة
 - streak/combo يمنح عملات إضافية
 - power-ups قابلة للشراء (remove2, reveal first letter, skip)
 - مكافأة يومية (claim once/day)
 - حد محاولات لكل مرحلة في اليوم (2 محاولات)
 - نقاط خبرة و مستوي (XP/Level) وبادجات
 - أصوات MP3 مع fallback إلى WebAudio
*/

'use strict';

/* ---------- DOM ---------- */
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
const starDisplay = document.getElementById('star-display');
const streakCountEl = document.getElementById('streak-count');
const playerLevelEl = document.getElementById('player-level');
const xpFillEl = document.getElementById('xp-fill');
const badgesContainer = document.getElementById('badges');
const playLimitsEl = document.getElementById('play-limits');

const puRemove2Btn = document.getElementById('pu-remove2');
const puFirstLetterBtn = document.getElementById('pu-firstletter');
const puSkipBtn = document.getElementById('pu-skip');

const soundToggleBtn = document.getElementById('sound-toggle');
const soundVolumeSlider = document.getElementById('sound-volume');
const dailyRewardBtn = document.getElementById('daily-reward-btn');

let stagesData = {};
let currentStageId = null;
let currentActors = [];
let currentIndex = 0;
let score = 0;
let mistakes = 0;

/* ---------- STORAGE KEYS ---------- */
const STORAGE_KEYS = {
  COINS: 'gt_coins',
  COMPLETED: 'gt_completed',
  UNLOCKED: 'gt_unlocked',
  AD_DATA: 'adData',
  SOUND_PREF: 'gt_sound_pref',
  STREAK: 'gt_streak',
  XP: 'gt_xp',
  LEVEL: 'gt_level',
  BADGES: 'gt_badges',
  STAGE_STARS: 'gt_stage_stars', // object {stageId: stars}
  PLAY_COUNT: 'gt_play_count', // {date: {stageId: count}}
  DAILY_REWARD: 'gt_daily_reward'
};

/* ---------- Game params (can be tuned) ---------- */
const COIN_PER_CORRECT = 2;
const BONUS_FINISH = 10;
const BONUS_PERFECT = 5;
const STREAK_THRESHOLDS = [3,5]; // 3->+1coin, 5->+3coins
const POWERUP_COSTS = { remove2: 8, firstLetter: 6, skip: 12 };
const PLAY_LIMIT_PER_STAGE_PER_DAY = 2;
const XP_PER_CORRECT = 5;
const XP_PER_LEVEL = 50;

/* ---------- persistent state ---------- */
let coins = parseInt(localStorage.getItem(STORAGE_KEYS.COINS) || '0', 10);
let completedStages = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPLETED) || '[]');
let unlockedStages = JSON.parse(localStorage.getItem(STORAGE_KEYS.UNLOCKED) || '["stage1"]');
let streak = JSON.parse(localStorage.getItem(STORAGE_KEYS.STREAK) || '0');
let xp = parseInt(localStorage.getItem(STORAGE_KEYS.XP) || '0', 10);
let level = parseInt(localStorage.getItem(STORAGE_KEYS.LEVEL) || '1', 10);
let badges = JSON.parse(localStorage.getItem(STORAGE_KEYS.BADGES) || '[]');
let stageStars = JSON.parse(localStorage.getItem(STORAGE_KEYS.STAGE_STARS) || '{}');
let playCount = JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAY_COUNT) || '{}');

/* update UI initially */
updateCoinsDisplay();
updateStreakUI();
updateXPUI();
renderBadges();

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

/* SoundManager: MP3s with fallback */
const SoundManager = (function(){
  const basePath = 'assets/sounds/';
  const files = {
    click: basePath + 'click.mp3',
    success: basePath + 'success.mp3',
    fail: basePath + 'fail.mp3',
    coin: basePath + 'coin.mp3'
  };
  const audios = {};
  let enabled = true;
  let volume = 0.8;

  function load() {
    Object.keys(files).forEach(key => {
      try {
        const a = new Audio();
        a.src = files[key];
        a.preload = 'auto';
        a.crossOrigin = "anonymous";
        a.volume = volume;
        audios[key] = a;
        a.addEventListener('error', () => { delete audios[key]; });
      } catch(e){}
    });
  }

  function play(name){
    if(!enabled) return;
    const a = audios[name];
    if(a && a.src){
      try {
        const clone = a.cloneNode();
        clone.volume = volume;
        clone.play().catch(()=>{});
        return;
      } catch(e){}
    }
    switch(name){
      case 'click': AudioEngine.click(); break;
      case 'success': AudioEngine.success(); break;
      case 'fail': AudioEngine.fail(); break;
      case 'coin': AudioEngine.coin(); break;
      default: break;
    }
  }

  function setEnabled(v){ enabled = Boolean(v); saveSoundPref(); updateSoundUI(); }
  function setVolume(v){ volume = Number(v); Object.values(audios).forEach(x=>{ try{x.volume=volume;}catch(e){} }); saveSoundPref(); }

  function restore(){
    try{
      const raw = localStorage.getItem(STORAGE_KEYS.SOUND_PREF);
      if(raw){
        const p = JSON.parse(raw);
        enabled = p.enabled !== undefined ? p.enabled : enabled;
        volume = p.volume !== undefined ? Number(p.volume) : volume;
      }
    }catch(e){}
  }
  function saveSoundPref(){ localStorage.setItem(STORAGE_KEYS.SOUND_PREF, JSON.stringify({enabled, volume})); }
  function updateSoundUI(){
    if(soundToggleBtn){
      soundToggleBtn.setAttribute('aria-pressed', String(enabled));
      if(enabled) soundToggleBtn.classList.remove('ghost'); else soundToggleBtn.classList.add('ghost');
    }
    if(soundVolumeSlider) soundVolumeSlider.value = volume;
  }

  return { init: ()=>{ restore(); load(); updateSoundUI(); }, play, setEnabled, setVolume, isEnabled: ()=>enabled, resumeAudioContext: ()=>{ try{ if(AudioEngine.ctx && AudioEngine.ctx.state === 'suspended') AudioEngine.ctx.resume(); }catch(e){} } };
})();

document.addEventListener('pointerdown', function once(){
  SoundManager.resumeAudioContext();
  document.removeEventListener('pointerdown', once);
});
SoundManager.init();

/* ================= Utilities & Persistence ================= */
function saveState(){
  localStorage.setItem(STORAGE_KEYS.COINS, String(coins));
  localStorage.setItem(STORAGE_KEYS.COMPLETED, JSON.stringify(completedStages));
  localStorage.setItem(STORAGE_KEYS.UNLOCKED, JSON.stringify(unlockedStages));
  localStorage.setItem(STORAGE_KEYS.STREAK, JSON.stringify(streak));
  localStorage.setItem(STORAGE_KEYS.XP, String(xp));
  localStorage.setItem(STORAGE_KEYS.LEVEL, String(level));
  localStorage.setItem(STORAGE_KEYS.BADGES, JSON.stringify(badges));
  localStorage.setItem(STORAGE_KEYS.STAGE_STARS, JSON.stringify(stageStars));
  localStorage.setItem(STORAGE_KEYS.PLAY_COUNT, JSON.stringify(playCount));
}

function safeText(node, text){ node.textContent = text ?? ''; }

function isValidImageUrl(url){
  try{
    if(!url) return false;
    const u = new URL(url, location.origin);
    return (u.protocol === 'https:' || u.protocol === 'data:');
  }catch(e){ return false; }
}

function shuffleArray(arr){
  for(let i=arr.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
}

/* update coin UI */
function updateCoinsDisplay(){ coinsEl.textContent = coins; }

/* update streak UI */
function updateStreakUI(){ streakCountEl.textContent = streak; }

/* update XP UI */
function updateXPUI(){
  playerLevelEl.textContent = `Lvl ${level}`;
  const pct = Math.min(100, Math.round((xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100));
  xpFillEl.style.width = `${pct}%`;
}

/* badges render */
function renderBadges(){
  badgesContainer.innerHTML = '';
  const knownBadges = [
    {id:'perfect', label:'Perfect Stage (بدون أخطاء)'},
    {id:'collector', label:'أكملت 5 مراحل'},
    {id:'streak5', label:'سلسلة 5 إجابات صحيحة'},
    {id:'daily', label:'مطالب يومية Claimed'}
  ];
  knownBadges.forEach(b=>{
    const el = document.createElement('div');
    el.className = 'badge';
    el.textContent = b.label;
    if(badges.includes(b.id)) el.style.borderColor = 'var(--gold-2)';
    badgesContainer.appendChild(el);
  });
}

/* manage play counts per day */
function todayKey(){ return new Date().toISOString().slice(0,10); } // YYYY-MM-DD
function getStagePlayCount(stageId){
  const t = todayKey();
  if(!playCount[t]) return 0;
  return playCount[t][stageId] || 0;
}
function incrementStagePlayCount(stageId){
  const t = todayKey();
  if(!playCount[t]) playCount = {[t]: {}};
  if(!playCount[t][stageId]) playCount[t][stageId] = 0;
  playCount[t][stageId] += 1;
  // optionally prune old dates
  saveState();
}

/* ================= Firebase: realtime updates ================= */
function fetchStagesRealtime(){
  const ref = db.ref('stages');
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
    startBtn.addEventListener('click', ()=>{ SoundManager.play('click'); startStage(id); });

    const infoBtn = document.createElement('button');
    infoBtn.className = 'btn ghost small hoverable';
    infoBtn.textContent = 'عرض';
    infoBtn.addEventListener('click', ()=>{ SoundManager.play('click'); showStageInfo(id); });
    makeTouchHoverable(infoBtn);

    actions.appendChild(startBtn);
    actions.appendChild(infoBtn);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(actions);

    // locked overlay - use stage's price if set (fix: dynamic price instead of hardcoded 20)
    if(!unlockedStages.includes(id) && !s.free){
      const unlockCost = Number(s.price !== undefined ? s.price : 20);
      const lock = document.createElement('div');
      lock.className = 'lock-overlay';
      lock.innerHTML = `<div style="text-align:center">
        مغلق — افتح بـ <strong>${unlockCost}</strong> كوينز<br/>
        <button class="btn" data-id="${id}" data-action="buy">فتح</button>
      </div>`;
      const buyBtn = lock.querySelector('button[data-action="buy"]');
      buyBtn.addEventListener('click', ()=>{ SoundManager.play('click'); handleBuyStage(id, unlockCost); });
      card.appendChild(lock);
    }

    if(completedStages.includes(id)){
      const done = document.createElement('div');
      done.className = 'meta';
      done.style.marginTop = '8px';
      done.textContent = `مُنجز ✓ — نجوم: ${stageStars[id] || 0}`;
      card.appendChild(done);
    }

    stagesContainer.appendChild(card);
  });
}

/* ================= Stage operations & limits ================= */
// modified to accept dynamic cost (from stage.price)
function handleBuyStage(id, cost = 20){
  const price = Number(cost || 20);
  if(coins < price){ alert(`مش كفاية كوينز. لازم ${price} كوينز تفتح المرحلة.`); return; }
  if(confirm(`هل متأكد إنك عايز تفتح المرحلة بـ${price} كوينز؟`)){
    coins -= price;
    if(!unlockedStages.includes(id)) unlockedStages.push(id);
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
  if(!stage.free && !unlockedStages.includes(id)) return alert('المرحلة مقفولة — افتحها بالكوينز.');

  const played = getStagePlayCount(id);
  if(played >= PLAY_LIMIT_PER_STAGE_PER_DAY){
    if(!confirm(`لعبت هذه المرحلة ${played} مرة اليوم — مازالت ممكن تشاهد إعلان لفتح محاولة إضافية. شاهد إعلان؟`)) return;
    // simulate ad reward flow to give 1 extra attempt (quick)
    // Here we simply reset today's count for stage to allow one more play
    const t = todayKey();
    if(!playCount[t]) playCount[t] = {};
    playCount[t][id] = Math.max(0, playCount[t][id] - 1);
    saveState();
  }

  currentStageId = id;
  currentActors = (stage.actors || []).slice();
  if(currentActors.length === 0){ alert('لا توجد ممثلين في هذه المرحلة'); return; }
  shuffleArray(currentActors);
  currentIndex = 0;
  score = 0;
  mistakes = 0;
  showActor();
  gameScreen.classList.remove('hidden');
  stagesContainer.classList.add('hidden');
  stageTitleEl.textContent = stage.title || id;
  updateStageScore();
  gameScreen.setAttribute('aria-hidden', 'false');

  // increment play count
  incrementStagePlayCount(id);
  updatePlayLimitsUI(id);
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
    b.addEventListener('click', ()=>{ SoundManager.play('click'); selectOption(b, actor); });
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
    // منح عملات
    let earned = COIN_PER_CORRECT;
    // streak logic
    streak++;
    if(streak >= STREAK_THRESHOLDS[1]){ earned += 3; } else if(streak >= STREAK_THRESHOLDS[0]){ earned += 1; }
    coins += earned;
    // XP
    xp += XP_PER_CORRECT;
    // level up check
    while(xp >= XP_PER_LEVEL){
      xp -= XP_PER_LEVEL;
      level++;
      // maybe award small coins on level up
      coins += 5;
    }
    updateCoinsDisplay();
    updateStreakUI();
    updateXPUI();
    SoundManager.play('success');

    // badge: streak5
    if(streak >= 5 && !badges.includes('streak5')){
      badges.push('streak5');
      saveState();
      renderBadges();
    }
  } else {
    btnEl.classList.add('wrong');
    roundResult.textContent = `غلط — الإجابة الصحيحة: ${correctName}`;
    Array.from(optionsGrid.children).forEach(c=>{
      if(c.textContent.trim() === correctName) c.classList.add('correct');
    });
    mistakes++;
    // reset streak
    streak = 0;
    updateStreakUI();
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
  // record completed
  if(!completedStages.includes(currentStageId)){
    completedStages.push(currentStageId);
  }

  // star calculation
  const total = currentActors.length || 0;
  const wrong = mistakes;
  let stars = 1;
  if(wrong === 0) stars = 3;
  else if(wrong <= 2) stars = 2;
  stageStars[currentStageId] = Math.max(stageStars[currentStageId] || 0, stars);

  // award bonuses
  let totalCoinsEarned = score * COIN_PER_CORRECT;
  totalCoinsEarned += BONUS_FINISH;
  if(stars === 3){ totalCoinsEarned += BONUS_PERFECT; badges.push('perfect'); }

  // apply coins (we already added per-correct during play, but we add finish bonus now)
  coins += BONUS_FINISH;
  if(stars === 3){ coins += BONUS_PERFECT; }

  // update XP/level maybe additional
  xp += Math.max(0, (total - wrong)); // small bonus xp for progress
  while(xp >= XP_PER_LEVEL){
    xp -= XP_PER_LEVEL;
    level++;
    coins += 5;
  }

  saveState();
  updateCoinsDisplay();
  updateXPUI();
  renderBadges();

  // show stars visually
  showStageEndModal(stars, score, total);

  gameScreen.classList.add('hidden');
  stagesContainer.classList.remove('hidden');
  renderStages();
}

/* stage-score info */
function updateStageScore(){
  const total = currentActors.length || 0;
  stageScoreEl.textContent = `صحيح حالياً: ${score} — المتبقي: ${ Math.max(0, total - (currentIndex+1) ) }`;
}

/* show stage end modal (simple star flash) */
function showStageEndModal(stars, scoreVal, total){
  starDisplay.innerHTML = '';
  for(let i=0;i<3;i++){
    const s = document.createElement('span');
    s.className = 'star' + (i < stars ? ' on' : '');
    s.innerHTML = `<svg class="icon" style="width:18px;height:18px"><use href="#icon-star"></use></svg>`;
    starDisplay.appendChild(s);
  }
  // temporary highlight
  setTimeout(()=> starDisplay.innerHTML = '', 3500);
  alert(`انتهت المرحلة! حصلت على ${scoreVal*COIN_PER_CORRECT + BONUS_FINISH + (stars===3?BONUS_PERFECT:0)} كوينز من هذه المرحلة.\nالتقييم: ${scoreVal} / ${total} — نجوم: ${stars}`);
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
  if (adData.count >= 2) { alert("وصلت للحد الأقصى من الإعلانات اليوم ✅"); return; }

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

    adMessage.classList.remove('hidden');
    setTimeout(()=> adMessage.classList.add('hidden'), 2500);
  };
});

/* ================= Power-ups (remove 2, reveal first letter, skip) ================= */
function usePowerUp(name){
  if(!currentActors || !currentActors[currentIndex]) return alert('لا يوجد سؤال مفعل الآن');
  if(name === 'remove2'){
    if(coins < POWERUP_COSTS.remove2) return alert('مش كفاية كوينز لاستخدام هذه المساعدة.');
    // find incorrect options and remove two
    const actor = currentActors[currentIndex];
    const correct = actor.name;
    const opts = Array.from(optionsGrid.children).filter(n => n.textContent.trim() !== correct && !n.classList.contains('disabled'));
    shuffleArray(opts);
    const toRemove = opts.slice(0,2);
    toRemove.forEach(n => { n.classList.add('disabled'); n.style.opacity = 0.45; });
    coins -= POWERUP_COSTS.remove2;
    saveState(); updateCoinsDisplay();
    SoundManager.play('coin');
  } else if(name === 'firstLetter'){
    if(coins < POWERUP_COSTS.firstLetter) return alert('مش كفاية كوينز لاستخدام هذه المساعدة.');
    const actor = currentActors[currentIndex];
    const correct = actor.name;
    // highlight correct option with first char hint (not revealing full)
    Array.from(optionsGrid.children).forEach(n=>{
      if(n.textContent.trim() === correct){
        n.textContent = `${correct[0]} ··· ${correct.slice(-1)}`; // small hint visual
      }
    });
    coins -= POWERUP_COSTS.firstLetter; saveState(); updateCoinsDisplay();
    SoundManager.play('click');
  } else if(name === 'skip'){
    if(coins < POWERUP_COSTS.skip) return alert('مش كفاية كوينز لاستخدام هذه المساعدة.');
    // mark as correct but give smaller reward and increment index
    coins -= POWERUP_COSTS.skip; saveState(); updateCoinsDisplay();
    score++;
    xp += XP_PER_CORRECT;
    SoundManager.play('success');
    updateXPUI();
    // move to next
    nextBtn.classList.remove('hidden');
    // simulate clicking next
    setTimeout(()=> nextBtn.click(), 400);
  }
}

puRemove2Btn && puRemove2Btn.addEventListener('click', ()=>{ usePowerUp('remove2'); });
puFirstLetterBtn && puFirstLetterBtn.addEventListener('click', ()=>{ usePowerUp('firstLetter'); });
puSkipBtn && puSkipBtn.addEventListener('click', ()=>{ usePowerUp('skip'); });

/* ================= Daily Reward ================= */
function getDailyData(){
  const raw = localStorage.getItem(STORAGE_KEYS.DAILY_REWARD) || null;
  if(!raw) return null;
  try { return JSON.parse(raw); } catch(e){ return null; }
}
function claimDailyReward(){
  const t = new Date().toISOString().slice(0,10);
  const data = getDailyData();
  if(data && data.date === t) return alert('لقد استلمت المكافأة اليوم بالفعل');
  // simple reward: 5 coins, and progress towards a weekly reward could be tracked
  coins += 40;
  saveState();
  localStorage.setItem(STORAGE_KEYS.DAILY_REWARD, JSON.stringify({date: t, claimed: true}));
  SoundManager.play('coin');
  alert('تم منحك 40 عملة كمكافأة يومية 🎁');
  // badge
  if(!badges.includes('daily')){ badges.push('daily'); saveState(); renderBadges(); }
}
dailyRewardBtn && dailyRewardBtn.addEventListener('click', ()=>{ claimDailyReward(); updateCoinsDisplay(); });

/* ================= Play limits UI ================= */
function updatePlayLimitsUI(stageId){
  const played = getStagePlayCount(stageId);
  playLimitsEl.textContent = `المحاولات اليوم لهذه المرحلة: ${played} / ${PLAY_LIMIT_PER_STAGE_PER_DAY}`;
}

/* ================= Mobile UX hoverable helper ================= */
function makeTouchHoverable(el){
  el.addEventListener('touchstart', () => el.classList.add('hover'), {passive:true});
  el.addEventListener('touchend', () => el.classList.remove('hover'), {passive:true});
  el.addEventListener('touchcancel', () => el.classList.remove('hover'), {passive:true});
}

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

/* Init sound UI from storage (if any) */
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
updatePlayLimitsUI(''); // no stage, hides or empty

/* ================= Safety notes (console hints) ================= */
console.info("Frontend initialized: Realtime stages listener active, Game features loaded.");

/* ================= Debug helpers ================= */
window.__GTADATA = {
  getState: () => ({ coins, completedStages, unlockedStages, streak, xp, level, badges, stageStars, playCount }),
  addCoins: (n=1) => { coins += n; saveState(); updateCoinsDisplay(); }
};


