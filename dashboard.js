// dashboard.js (محدّث)
const adminLoginBtn = document.getElementById('admin-login');
const adminPassInput = document.getElementById('admin-pass');
const adminWelcome = document.getElementById('admin-welcome');
const stagesAdminSection = document.getElementById('stages-admin');

const stageIdInput = document.getElementById('stage-id');
const stageTitleInput = document.getElementById('stage-title-input');
const stageFreeInput = document.getElementById('stage-free');
const actorNameInput = document.getElementById('actor-name');
const actorImageInput = document.getElementById('actor-image-url');
const actorOptionsInput = document.getElementById('actor-options');
const addActorBtn = document.getElementById('add-actor');
const clearActorsBtn = document.getElementById('clear-actors');
const actorsList = document.getElementById('actors-list');
const saveStageBtn = document.getElementById('save-stage');
const deleteStageBtn = document.getElementById('delete-stage');
const existingStagesEl = document.getElementById('existing-stages');

let currentActorsTemp = [];
let isAdmin = false;
const ADMIN_PASSWORD = 'admin123';

adminLoginBtn.addEventListener('click', ()=>{
  const p = adminPassInput.value;
  if(p === ADMIN_PASSWORD){
    isAdmin = true;
    adminWelcome.textContent = 'مدير متصل';
    stagesAdminSection.classList.remove('hidden');
    loadExistingStages();
  } else {
    alert('كلمة المرور غير صحيحة');
  }
});

addActorBtn.addEventListener('click', ()=>{
  const name = actorNameInput.value.trim();
  const img = actorImageInput.value.trim();
  let opts = actorOptionsInput.value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!name || !img || opts.length < 2) return alert('ادخل اسم، رابط صورة، و على الأقل خيارين.');
  if(!opts.includes(name)) opts.push(name);
  const actorObj = { name, image: img, options: opts.slice(0,4) };
  currentActorsTemp.push(actorObj);
  renderActorsTemp();
  actorNameInput.value = actorImageInput.value = actorOptionsInput.value = '';
});

clearActorsBtn.addEventListener('click', ()=>{
  if(!confirm('هل تريد إفراغ قائمة الممثلين الحالية؟')) return;
  currentActorsTemp = [];
  renderActorsTemp();
});

function renderActorsTemp(){
  actorsList.innerHTML = '';
  currentActorsTemp.forEach((a, idx)=>{
    const li = document.createElement('li');
    li.innerHTML = `<div style="display:flex;gap:10px;align-items:center">
      <img src="${a.image}" width="48" height="48" style="object-fit:cover;border-radius:6px"/>
      <div style="min-width:120px"><strong>${a.name}</strong><div class="smallnote">${a.options.join(' ، ')}</div></div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn ghost" data-idx="${idx}" data-action="up">▲</button>
        <button class="btn ghost" data-idx="${idx}" data-action="down">▼</button>
        <button class="btn" data-idx="${idx}" data-action="edit">تعديل</button>
        <button class="btn danger" data-idx="${idx}" data-action="remove">حذف</button>
      </div>`;
    actorsList.appendChild(li);
  });

  actorsList.querySelectorAll('[data-action]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = Number(btn.dataset.idx);
      const action = btn.dataset.action;
      if(action === 'remove'){ currentActorsTemp.splice(i,1); renderActorsTemp(); }
      if(action === 'edit'){ loadActorToInputs(i); }
      if(action === 'up' && i > 0){ [currentActorsTemp[i-1], currentActorsTemp[i]] = [currentActorsTemp[i], currentActorsTemp[i-1]]; renderActorsTemp(); }
      if(action === 'down' && i < currentActorsTemp.length-1){ [currentActorsTemp[i+1], currentActorsTemp[i]] = [currentActorsTemp[i], currentActorsTemp[i+1]]; renderActorsTemp(); }
    });
  });
}

function loadActorToInputs(i){
  const a = currentActorsTemp[i];
  actorNameInput.value = a.name;
  actorImageInput.value = a.image;
  actorOptionsInput.value = a.options.join(', ');
  // remove original to avoid duplicates when saving
  currentActorsTemp.splice(i,1);
  renderActorsTemp();
}

saveStageBtn.addEventListener('click', ()=>{
  const id = stageIdInput.value.trim();
  const title = stageTitleInput.value.trim();
  const free = stageFreeInput.checked;
  if(!id || !title) return alert('ادخل معرف و عنوان المرحلة.');
  if(currentActorsTemp.length === 0) return alert('أضف ممثلين للمرحلة (مطلوب على الأقل ممثل واحد).');

  const stageObj = { title, free, actors: currentActorsTemp };

  db.ref('stages/' + id).set(stageObj)
    .then(()=> {
      alert('تم حفظ المرحلة في Firebase');
      currentActorsTemp = [];
      renderActorsTemp();
      stageIdInput.value = stageTitleInput.value = '';
      stageFreeInput.checked = false;
      loadExistingStages();
    })
    .catch(err=>{ console.error(err); alert('فشل الحفظ'); });
});

deleteStageBtn.addEventListener('click', ()=>{
  const id = stageIdInput.value.trim();
  if(!id) return alert('ادخل معرف المرحلة لحذفها');
  if(!confirm('هل تريد حذف المرحلة نهائياً؟')) return;
  db.ref('stages/' + id).remove()
    .then(()=> { alert('تم الحذف'); loadExistingStages(); })
    .catch(()=>alert('فشل الحذف'));
});

function loadExistingStages(){
  existingStagesEl.innerHTML = '<li>جاري التحميل...</li>';
  db.ref('stages').once('value').then(snap=>{
    const data = snap.val() || {};
    existingStagesEl.innerHTML = '';
    Object.keys(data).sort().forEach(id=>{
      const li = document.createElement('li');
      li.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>${id}</strong><div class="smallnote">${data[id].title}</div></div>
        <div style="display:flex;gap:8px">
          <button class="btn" data-id="${id}" data-action="edit">تعديل</button>
          <button class="btn danger" data-id="${id}" data-action="remove">حذف</button>
        </div>
      </div>`;
      existingStagesEl.appendChild(li);
    });

    existingStagesEl.querySelectorAll('[data-action="edit"]').forEach(b=>{
      b.addEventListener('click', ()=> loadStageToForm(b.dataset.id));
    });
    existingStagesEl.querySelectorAll('[data-action="remove"]').forEach(b=>{
      b.addEventListener('click', ()=> removeStage(b.dataset.id));
    });
  }).catch(err=>{
    console.error(err);
    existingStagesEl.innerHTML = '<li class="smallnote">خطأ فى التحميل</li>';
  });
}

function loadStageToForm(id){
  db.ref('stages/' + id).once('value').then(snap=>{
    const s = snap.val();
    stageIdInput.value = id;
    stageTitleInput.value = s.title || '';
    stageFreeInput.checked = !!s.free;
    currentActorsTemp = s.actors ? s.actors.slice() : [];
    renderActorsTemp();
    window.scrollTo({top:0,behavior:'smooth'});
  });
}

function removeStage(id){
  if(!confirm('حذف نهائي: هل متأكد؟')) return;
  db.ref('stages/' + id).remove().then(()=> loadExistingStages());
}
