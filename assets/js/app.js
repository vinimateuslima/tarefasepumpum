'use strict';
/* =====================================================================
   TAREFAS E PUMPUNS — HTML + CSS + JS puro
   As listas vêm de data/tarefas.json e data/pumpuns.json.
   Marcações, tarefas extras e a foto ficam só neste aparelho (localStorage).
   ===================================================================== */

/* ---------- Utilitários ---------- */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad = n => String(n).padStart(2, '0');
const str = v => (typeof v === 'string' ? v : '');
const arr = v => (Array.isArray(v) ? v : []);
const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDate = iso => iso.split('-').reverse().join('/');
const fmtDateShort = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y.slice(2)}`; };
const slug = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- Configuração das abas ---------- */
const LISTS = {
  tarefas: { url: 'data/tarefas.json', emoji: '🏠', title: 'Tarefas da casa', reportTitle: '🏠 TAREFAS DA CASA', defaultIcon: '🧹', listTitle: 'Lista de tarefas', empty: 'Nenhuma tarefa cadastrada. Edite data/tarefas.json.' },
  pumpuns: { url: 'data/pumpuns.json', emoji: '🐱', title: 'Pumpuns', reportTitle: '🐱 CUIDADOS DOS PUMPUNS', defaultIcon: '🐾', listTitle: 'Cuidados dos gatinhos', empty: 'Nenhum cuidado cadastrado. Edite data/pumpuns.json.' }
};
const PHOTO_PLACEHOLDER = 'assets/img/pumpuns-placeholder.svg';
const NAME_MAX = 20;

/* ---------- Dados ---------- */
const KEY = 'tarefas-pumpuns.v1', CACHE_KEY = 'tarefas-pumpuns.cache.v1';
/* db.days["AAAA-MM-DD|aba"] = { done: [ids], extra: [{id,name,icon}] }   (extras só daquele dia)
   db.custom[aba] = [{id,name,icon}]                                      (extras fixas, ficam todo dia) */
let db = { name: '', days: {}, custom: { tarefas: [], pumpuns: [] } };
let base = { tarefas: [], pumpuns: [] };
let loadErrors = {};
let storageOk = true;

function loadDb() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d === 'object') {
      db.name = str(d.name).slice(0, NAME_MAX);
      db.days = d.days && typeof d.days === 'object' ? d.days : {};
      Object.keys(LISTS).forEach(k => { db.custom[k] = arr(d.custom && d.custom[k]).filter(x => x && str(x.name)); });
    }
  } catch (e) { /* começa vazio */ }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); storageOk = true; }
  catch (e) { storageOk = false; toast('⚠️ Não foi possível salvar neste navegador'); }
}

function parseList(j, kind) {
  const used = new Set();
  return arr(j && j.tarefas).filter(t => t && str(t.nome).trim()).map(t => {
    let id = `${kind}-${slug(t.nome)}`, n = 2; const b = id;
    while (used.has(id)) id = `${b}-${n++}`; used.add(id);
    return { id, name: t.nome.trim(), icon: str(t.icone) || LISTS[kind].defaultIcon, group: str(t.grupo).trim(), src: 'json' };
  });
}

async function loadList(kind) {
  const cfg = LISTS[kind];
  let cache = {}; try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { /* sem cache */ }
  try {
    const r = await fetch(cfg.url, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const json = await r.json();
    base[kind] = parseList(json, kind); delete loadErrors[kind];
    cache[kind] = json; try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* ok */ }
  } catch (e) {
    console.warn('Falha ao ler ' + cfg.url, e);
    base[kind] = cache[kind] ? parseList(cache[kind], kind) : [];
    loadErrors[kind] = location.protocol === 'file:'
      ? `Não foi possível ler ${cfg.url} abrindo o arquivo direto. Abra por um servidor (ex.: Vercel ou "python -m http.server").`
      : `Não foi possível carregar ${cfg.url}.`;
    if (base[kind].length) loadErrors[kind] += ' Usando a última lista salva neste aparelho.';
  }
}

/* ---------- Regras ---------- */
let tab = 'tarefas';
let date = todayISO();
const dayKey = (k = tab) => `${date}|${k}`;
const getDay = (k = tab) => db.days[dayKey(k)] || { done: [], extra: [] };
function editDay(fn, k = tab) {
  const d = db.days[dayKey(k)] || (db.days[dayKey(k)] = { done: [], extra: [] });
  fn(d); save();
}
/* Lista do dia = JSON + extras fixas + extras só do dia. */
function itemsOf(k = tab) {
  const d = getDay(k);
  return [
    ...base[k],
    ...db.custom[k].map(x => ({ ...x, group: 'Extras', src: 'fixa' })),
    ...arr(d.extra).map(x => ({ ...x, group: 'Extras', src: 'dia' }))
  ];
}
const isDone = (id, k = tab) => getDay(k).done.includes(id);

/* ---------- Relatório ---------- */
function buildReport(k) {
  const items = itemsOf(k), done = items.filter(i => isDone(i.id, k)).length;
  const L = [`*${LISTS[k].reportTitle} (${fmtDateShort(date)})*`];
  if (db.name.trim()) L.push(`Por: ${db.name.trim()}`);
  L.push('');
  items.forEach(i => L.push(`${isDone(i.id, k) ? '✅' : '⬜'} ${i.icon} ${i.name}`));
  if (!items.length) L.push('Nenhum item na lista.');
  else L.push('', `*${done} de ${items.length} feitas*`);
  return L.join('\n');
}


/* ---------- Telas ----------
   A estrutura (cabeçalho, cards, abas, diálogos) está no index.html.
   Aqui o JS só preenche textos, a lista de tarefas e o estado dos botões. */
const el = {
  name: $('#f-name'), date: $('#f-date'), bar: $('#bar-fill'), progress: $('#progress-text'), cheer: $('#cheer'),
  list: $('#list'), listTitle: $('#list-title'), listEmpty: $('#list-empty'), reset: $('#btn-reset'),
  warnLoad: $('#warn-load'), warnStorage: $('#warn-storage')
};
const tplGroup = $('#tpl-group'), tplTask = $('#tpl-task');

function taskNode(i) {
  const done = isDone(i.id), n = tplTask.content.firstElementChild.cloneNode(true);
  n.classList.toggle('done', done);
  const main = $('.task-main', n);
  main.dataset.id = i.id; main.setAttribute('aria-pressed', done);
  $('.em', n).textContent = i.icon;
  $('.nm-text', n).textContent = i.name;
  $('.tag', n).hidden = i.src !== 'dia';
  const del = $('.del', n);
  del.hidden = i.src === 'json';
  del.dataset.id = i.id; del.dataset.src = i.src; del.setAttribute('aria-label', `Remover ${i.name}`);
  return n;
}

function groupItems(items) {
  const groups = [];
  items.forEach(i => {
    const g = i.group || 'Tarefas';
    let e = groups.find(x => x.name === g);
    if (!e) groups.push(e = { name: g, items: [] });
    e.items.push(i);
  });
  const extras = groups.find(g => g.name === 'Extras');
  if (extras) { groups.splice(groups.indexOf(extras), 1); groups.push(extras); }
  return groups;
}

function render() {
  const y = window.scrollY, cfg = LISTS[tab], items = itemsOf(), done = items.filter(i => isDone(i.id)).length;

  // cabeçalho e abas
  $('#hdr-emoji').textContent = cfg.emoji; $('#hdr-title').textContent = cfg.title; $('#hdr-sub').textContent = fmtDate(date);
  document.title = cfg.title;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === tab));

  // avisos
  el.warnLoad.hidden = !loadErrors[tab]; el.warnLoad.textContent = loadErrors[tab] ? '⚠️ ' + loadErrors[tab] : '';
  el.warnStorage.hidden = storageOk;

  // nome, data e progresso (não mexe no campo que está sendo digitado)
  if (document.activeElement !== el.name) el.name.value = db.name;
  el.date.value = date;
  el.bar.style.width = (items.length ? Math.round(done / items.length * 100) : 0) + '%';
  el.progress.textContent = `${done} de ${items.length}`;
  el.cheer.hidden = !(items.length && done === items.length);
  el.cheer.textContent = tab === 'pumpuns' ? '🎉 Pumpuns bem cuidados!' : '🎉 Casa em ordem!';

  // lista
  el.listTitle.textContent = `${cfg.emoji} ${cfg.listTitle}`;
  el.list.replaceChildren();
  groupItems(items).forEach(g => {
    const h = tplGroup.content.firstElementChild.cloneNode(true);
    h.textContent = g.name;
    el.list.append(h, ...g.items.map(taskNode));
  });
  el.listEmpty.hidden = items.length > 0; el.listEmpty.textContent = cfg.empty;
  el.reset.hidden = !done;

  window.scrollTo(0, y);
}

/* ---------- Diálogos ---------- */
const dlgAdd = $('#dlg-add'), dlgConfirm = $('#dlg-confirm'), dlgReport = $('#dlg-report');
[dlgAdd, dlgConfirm, dlgReport].forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

function confirmBox(msg, ok = 'Remover') {
  return new Promise(resolve => {
    $('#confirm-msg').textContent = msg;
    const btn = $('#confirm-ok'); btn.textContent = ok;
    let answer = false;
    const onOk = () => { answer = true; dlgConfirm.close(); };
    btn.addEventListener('click', onOk, { once: true });
    dlgConfirm.addEventListener('close', () => { btn.removeEventListener('click', onOk); resolve(answer); }, { once: true });
    dlgConfirm.showModal();
  });
}

const addForm = $('form', dlgAdd);
function openAdd() {
  $('#add-title').textContent = tab === 'tarefas' ? 'Nova tarefa' : 'Nova tarefa dos Pumpuns';
  $('#add-hint').textContent = `Sem marcar, a tarefa aparece só em ${fmtDate(date)}. A lista do arquivo JSON não é modificada.`;
  addForm.reset(); addForm.icon.placeholder = LISTS[tab].defaultIcon;
  dlgAdd.showModal(); addForm.name.focus();
}
addForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = addForm.name.value.trim();
  if (!name) { addForm.name.focus(); toast('Digite o nome da tarefa'); return; }
  const item = { id: `x-${uid()}`, name, icon: addForm.icon.value.trim() || LISTS[tab].defaultIcon };
  if (addForm.always.checked) db.custom[tab].push(item); else editDay(d => d.extra.push(item));
  save(); dlgAdd.close(); render(); toast('Tarefa adicionada');
});

/* Foto dos Pumpuns: se assets/img/pumpuns.jpg não existir, mostra o desenho genérico. */
const photoImg = $('#photo-img');
const usePlaceholder = () => { if (!photoImg.src.endsWith('placeholder.svg')) photoImg.src = PHOTO_PLACEHOLDER; };
photoImg.addEventListener('error', usePlaceholder);
if (photoImg.complete && !photoImg.naturalWidth) usePlaceholder(); // o erro pode ter ocorrido antes deste script

/* Toca o agradecimento ao gerar o relatório dos Pumpuns (o toque no botão libera o som). */
const thanksAudio = $('#thanks-audio');
function playThanks() {
  try { thanksAudio.currentTime = 0; const p = thanksAudio.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* sem som */ }
}

function showReport() {
  const isCat = tab === 'pumpuns';
  $('#report-title').textContent = isCat ? 'Relatório dos Pumpuns' : 'Relatório das tarefas';
  $('#report-photo').hidden = !isCat;
  $('#report-text').value = buildReport(tab);
  dlgReport.showModal();
  dlgReport.querySelector('.dlg-body').scrollTop = 0;
  if (isCat) playThanks();
}

async function copyText(text, ta) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* alternativa */ }
  try { ta.focus(); ta.select(); return document.execCommand('copy'); } catch (e) { return false; }
}

/* ---------- Ações ---------- */
const actions = {
  tab: b => { tab = b.dataset.v; window.scrollTo(0, 0); render(); },
  close: b => b.closest('dialog').close(),
  toggle: b => {
    const id = b.dataset.id;
    editDay(d => { d.done = d.done.includes(id) ? d.done.filter(x => x !== id) : [...d.done, id]; });
    render();
  },
  add: openAdd,
  'del-extra': async b => {
    const k = tab, id = b.dataset.id, src = b.dataset.src;
    const it = itemsOf(k).find(x => x.id === id); if (!it) return;
    if (!(await confirmBox(`Remover "${it.name}"${src === 'fixa' ? ' de todos os dias' : ''}?`))) return;
    if (src === 'fixa') db.custom[k] = db.custom[k].filter(x => x.id !== id);
    else editDay(d => { d.extra = d.extra.filter(x => x.id !== id); d.done = d.done.filter(x => x !== id); }, k);
    save(); render(); toast('Tarefa removida');
  },
  'reset-day': async () => {
    if (await confirmBox('Desmarcar todas as tarefas deste dia?', 'Limpar')) { editDay(d => { d.done = []; }); render(); }
  },
  report: showReport,
  'copy-report': async b => {
    const ta = $('#report-text'), label = $('span', b);
    const ok = await copyText(ta.value, ta);
    toast(ok ? '✅ Relatório copiado!' : 'Não foi possível copiar. Selecione o texto e copie manualmente.');
    if (ok) { label.textContent = 'Copiado ✓'; setTimeout(() => { label.textContent = 'Copiar'; }, 2000); }
  },
  'share-report': () => window.open(`https://wa.me/?text=${encodeURIComponent($('#report-text').value)}`, '_blank', 'noopener')
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (b && actions[b.dataset.action]) actions[b.dataset.action](b);
});
el.name.addEventListener('input', () => { db.name = el.name.value.slice(0, NAME_MAX); save(); });
el.date.addEventListener('change', () => { if (el.date.value) { date = el.date.value; render(); } });

/* ---------- Início ---------- */
loadDb();
render();
Promise.all(Object.keys(LISTS).map(loadList)).then(render);
