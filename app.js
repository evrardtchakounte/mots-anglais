/* Mots anglais : répétition espacée (type SM-2), 100 % hors ligne, données sur le téléphone. */
(function () {
  'use strict';

  const KEY = 'mots-anglais-v1';
  const $ = (id) => document.getElementById(id);
  const DAY_MS = 86400000;

  // ---------- État ----------
  function today() {
    const d = new Date();
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / DAY_MS);
  }
  function defaultState() {
    return {
      v: 1,
      cards: {},                       // mot -> {ef, reps, iv, due, lapses}
      daily: { day: today(), newCount: 0 },
      streak: { last: null, count: 0 },
      settings: { daily: 10, rate: 0.9, accent: 'en-US', autoplay: true }
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const d = defaultState();
        return Object.assign(d, s, { settings: Object.assign(d.settings, s.settings || {}) });
      }
    } catch (e) { /* stockage indisponible */ }
    return defaultState();
  }
  let state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Impossible d\'enregistrer la progression'); }
  }
  function rollDay() {
    const t = today();
    if (state.daily.day !== t) { state.daily = { day: t, newCount: 0 }; save(); }
  }

  const INDEX = new Map(WORDS.map((w, i) => [w[0], i]));

  // ---------- Calculs ----------
  function dueList() {
    const t = today();
    return Object.keys(state.cards)
      .filter((w) => INDEX.has(w) && state.cards[w].due <= t)
      .sort((a, b) => state.cards[a].due - state.cards[b].due || INDEX.get(a) - INDEX.get(b));
  }
  function nextNew(n) {
    const out = [];
    for (let i = 0; i < WORDS.length && out.length < n; i++) {
      if (!state.cards[WORDS[i][0]]) out.push(WORDS[i][0]);
    }
    return out;
  }
  function learnedCount() {
    return Object.values(state.cards).filter((c) => c.reps > 0).length;
  }
  function newLeftToday() {
    return Math.max(0, state.settings.daily - state.daily.newCount);
  }

  // SM-2 simplifié. g : 0 = à revoir, 3 = difficile, 4 = bien, 5 = facile
  function schedule(c, g) {
    const n = Object.assign({}, c);
    if (g < 3) {
      if (n.reps > 0) n.ef = Math.max(1.3, n.ef - 0.2);
      n.reps = 0; n.iv = 0; n.lapses = (n.lapses || 0) + 1; n.due = today();
      return n;
    }
    if (n.reps === 0) n.iv = { 3: 1, 4: 1, 5: 3 }[g];
    else if (n.reps === 1) n.iv = { 3: 2, 4: 4, 5: 7 }[g];
    else n.iv = Math.max(n.iv + 1, Math.round(n.iv * n.ef * { 3: 0.6, 4: 1, 5: 1.3 }[g]));
    n.iv = Math.min(n.iv, 365);
    n.ef = Math.max(1.3, n.ef + (0.1 - (5 - g) * (0.08 + (5 - g) * 0.02)));
    n.reps += 1;
    n.due = today() + n.iv;
    return n;
  }
  function ivLabel(d) {
    if (d < 1) return '< 1 min';
    if (d === 1) return '1 jour';
    if (d < 30) return d + ' jours';
    if (d < 365) return Math.round(d / 30) + ' mois';
    return '1 an';
  }
  function touchStreak() {
    const t = today();
    if (state.streak.last === t) return;
    state.streak.count = state.streak.last === t - 1 ? state.streak.count + 1 : 1;
    state.streak.last = t;
  }

  // ---------- Voix ----------
  let voices = [];
  function loadVoices() { if ('speechSynthesis' in window) voices = speechSynthesis.getVoices(); }
  if ('speechSynthesis' in window) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }
  function pickVoice() {
    const acc = state.settings.accent.toLowerCase();
    const norm = (v) => v.lang.replace('_', '-').toLowerCase();
    return voices.find((v) => norm(v) === acc && v.localService) ||
      voices.find((v) => norm(v) === acc) ||
      voices.find((v) => norm(v).startsWith('en'));
  }
  function speak(text) {
    if (!('speechSynthesis' in window)) { toast('La synthèse vocale n\'est pas disponible'); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = state.settings.accent;
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = Number(state.settings.rate) || 0.9;
    speechSynthesis.speak(u);
  }

  // ---------- Navigation ----------
  const VIEWS = ['home', 'card', 'done', 'list', 'settings'];
  let current = 'home';
  function show(view, push = true) {
    VIEWS.forEach((v) => { $('view-' + v).hidden = v !== view; });
    current = view;
    $('btn-back').hidden = view === 'home';
    $('btn-settings').hidden = view !== 'home';
    $('title').textContent = { home: 'Mots anglais', card: 'Session', done: 'Session terminée', list: 'Tous les mots', settings: 'Réglages' }[view];
    if (view === 'home') renderHome();
    if (push && view !== 'home') history.pushState({ v: view }, '');
    window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', () => {
    if (current === 'card' && browseReturn) { browseReturn = false; show('list', false); return; }
    show('home', false);
  });
  $('btn-back').onclick = () => history.back();
  $('btn-settings').onclick = () => { renderSettings(); show('settings'); };

  // ---------- Accueil ----------
  function renderHome() {
    rollDay();
    const due = dueList().length;
    const left = newLeftToday();
    const avail = nextNew(left).length;
    const learned = learnedCount();
    $('st-due').textContent = due;
    $('st-new').textContent = state.daily.newCount + '/' + state.settings.daily;
    $('st-known').textContent = learned;
    const pct = (learned / WORDS.length) * 100;
    $('progress-bar').style.width = pct.toFixed(1) + '%';
    $('progress-text').textContent = learned + ' / ' + WORDS.length + ' mots appris (' + pct.toFixed(1) + ' %)';
    const s = state.streak;
    const active = s.last === today() || s.last === today() - 1;
    $('streak').textContent = active && s.count > 0 ? '🔥 ' + s.count + ' jour' + (s.count > 1 ? 's' : '') + ' d\'affilée' : '';
    const btn = $('btn-start');
    if (due + avail > 0) {
      const parts = [];
      if (due) parts.push(due + ' révision' + (due > 1 ? 's' : ''));
      if (avail) parts.push(avail + ' nouveau' + (avail > 1 ? 'x' : ''));
      btn.textContent = 'Commencer · ' + parts.join(' + ');
      btn.disabled = false;
      $('btn-more').hidden = true;
    } else {
      btn.textContent = 'Objectif du jour atteint ✓';
      btn.disabled = true;
      $('btn-more').hidden = nextNew(1).length === 0;
    }
  }

  // ---------- Session ----------
  let queue = [];      // {w, type: 'review' | 'new' | 'quiz'}
  let pos = 0;
  let total = 0;
  let sessionStats = { reviewed: 0, learned: 0 };
  let browseReturn = false;

  function startSession(extra) {
    rollDay();
    const reviews = dueList().map((w) => ({ w, type: 'review' }));
    const news = nextNew(extra ? 10 : newLeftToday());
    const presents = news.map((w) => ({ w, type: 'new' }));
    const quizzes = shuffle(news.map((w) => ({ w, type: 'quiz' })));
    queue = reviews.concat(presents, quizzes);
    pos = 0; total = queue.length;
    sessionStats = { reviewed: 0, learned: 0 };
    if (!queue.length) { renderHome(); return; }
    browseReturn = false;
    show('card');
    renderCard();
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function fillCard(w) {
    const d = WORDS[INDEX.get(w)];
    $('card-emoji').textContent = d[2];
    $('card-word').textContent = d[0];
    $('card-fr').textContent = d[1];
    $('ex1').textContent = d[3]; $('ex1fr').textContent = d[4];
    $('ex2').textContent = d[5]; $('ex2fr').textContent = d[6];
    return d;
  }

  function renderCard() {
    if (pos >= queue.length) return finish();
    const item = queue[pos];
    const d = fillCard(item.w);
    const badge = $('card-badge');
    badge.className = 'badge' + (item.type === 'new' ? ' new' : '');
    badge.textContent = item.type === 'new' ? 'Nouveau mot' : item.type === 'quiz' ? 'Vérification' : 'Révision';
    $('session-bar').style.width = ((pos / total) * 100).toFixed(1) + '%';
    $('session-info').textContent = (queue.length - pos) + ' carte' + (queue.length - pos > 1 ? 's' : '') + ' restante' + (queue.length - pos > 1 ? 's' : '');
    const isNew = item.type === 'new';
    $('card-back').hidden = !isNew;
    $('act-reveal').hidden = isNew;
    $('act-new').hidden = !isNew;
    $('btn-got').textContent = 'J\'ai compris ✓';
    $('act-grade').hidden = true;
    if (state.settings.autoplay) setTimeout(() => speak(d[0]), 150);
  }

  function reveal() {
    $('card-back').hidden = false;
    $('act-reveal').hidden = true;
    $('act-grade').hidden = false;
    const c = state.cards[queue[pos].w];
    [3, 4, 5].forEach((g) => { $('iv-' + g).textContent = ivLabel(schedule(c, g).iv); });
  }

  function gotNew() {
    if (browseReturn) { history.back(); return; }
    const w = queue[pos].w;
    if (!state.cards[w]) {
      state.cards[w] = { ef: 2.5, reps: 0, iv: 0, due: today(), lapses: 0 };
      state.daily.newCount += 1;
      sessionStats.learned += 1;
      touchStreak();
      save();
    }
    pos += 1;
    renderCard();
  }

  function grade(g) {
    const item = queue[pos];
    const c = state.cards[item.w];
    if (!c) { pos += 1; return renderCard(); }
    state.cards[item.w] = schedule(c, g);
    if (item.type === 'review') sessionStats.reviewed += 1;
    touchStreak();
    save();
    if (g < 3) {
      // la carte revient un peu plus loin dans la session
      const at = Math.min(queue.length, pos + 4);
      queue.splice(at, 0, { w: item.w, type: 'review-again' });
      total += 1;
    }
    pos += 1;
    renderCard();
  }

  function finish() {
    $('session-bar').style.width = '100%';
    const parts = [];
    if (sessionStats.learned) parts.push(sessionStats.learned + ' nouveau' + (sessionStats.learned > 1 ? 'x mots' : ' mot'));
    if (sessionStats.reviewed) parts.push(sessionStats.reviewed + ' révision' + (sessionStats.reviewed > 1 ? 's' : ''));
    $('done-text').textContent = (parts.length ? 'Aujourd\'hui : ' + parts.join(' et ') + '. ' : '') +
      'Reviens demain pour tes révisions : c\'est la régularité qui fait retenir.';
    show('done', false);
    history.replaceState({ v: 'done' }, '');
  }

  $('btn-start').onclick = () => startSession(false);
  $('btn-more').onclick = () => startSession(true);
  $('btn-reveal').onclick = reveal;
  $('btn-got').onclick = gotNew;
  $('btn-home').onclick = () => history.back();
  document.querySelectorAll('#act-grade [data-g]').forEach((b) => { b.onclick = () => grade(Number(b.dataset.g)); });
  $('speak-word').onclick = () => speak($('card-word').textContent);
  document.querySelectorAll('[data-ex]').forEach((b) => {
    b.onclick = () => speak($(b.dataset.ex === '0' ? 'ex1' : 'ex2').textContent);
  });

  // ---------- Liste ----------
  let filter = 'all';
  let listLimit = 100;
  function strip(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function renderList() {
    const q = strip($('search').value.trim());
    const ul = $('word-list');
    ul.textContent = '';
    let count = 0, shown = 0;
    for (let i = 0; i < WORDS.length; i++) {
      const d = WORDS[i];
      const c = state.cards[d[0]];
      if (filter === 'learned' && !(c && c.reps > 0)) continue;
      if (filter === 'new' && c) continue;
      if (q && !strip(d[0]).includes(q) && !strip(d[1]).includes(q)) continue;
      count++;
      if (shown >= listLimit) continue;
      shown++;
      const li = document.createElement('li');
      const status = !c ? '' : c.reps > 0 ? '✓ révision ' + dueIn(c.due) : 'en cours';
      li.innerHTML = '<span class="e"></span><span class="w"><b></b><span></span></span><span class="s"></span>';
      li.querySelector('.e').textContent = d[2];
      li.querySelector('b').textContent = (i + 1) + '. ' + d[0];
      li.querySelector('.w span').textContent = d[1];
      const s = li.querySelector('.s');
      s.textContent = status;
      if (c && c.reps > 0) s.classList.add('ok');
      li.onclick = () => openBrowse(d[0]);
      ul.appendChild(li);
    }
    $('btn-list-more').hidden = count <= shown;
    if (!count) {
      const li = document.createElement('li');
      li.textContent = 'Aucun mot trouvé.';
      ul.appendChild(li);
    }
  }
  function dueIn(due) {
    const d = due - today();
    if (d <= 0) return 'aujourd\'hui';
    if (d === 1) return 'demain';
    return 'dans ' + ivLabel(d);
  }
  function openBrowse(w) {
    const d = fillCard(w);
    const badge = $('card-badge');
    badge.className = 'badge';
    badge.textContent = '#' + (INDEX.get(w) + 1);
    $('session-bar').style.width = '0';
    $('session-info').textContent = '';
    $('card-back').hidden = false;
    $('act-reveal').hidden = true;
    $('act-grade').hidden = true;
    $('act-new').hidden = false;
    $('btn-got').textContent = 'Retour à la liste';
    browseReturn = true;
    show('card');
    $('title').textContent = d[0];
    speak(d[0]);
  }
  $('btn-list').onclick = () => { listLimit = 100; renderList(); show('list'); };
  $('search').oninput = () => { listLimit = 100; renderList(); };
  $('btn-list-more').onclick = () => { listLimit += 200; renderList(); };
  document.querySelectorAll('.chip').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === b));
      filter = b.dataset.f; listLimit = 100; renderList();
    };
  });

  // ---------- Réglages ----------
  function renderSettings() {
    $('set-daily').value = String(state.settings.daily);
    $('set-rate').value = String(state.settings.rate);
    $('set-accent').value = state.settings.accent;
    $('set-autoplay').checked = !!state.settings.autoplay;
    loadVoices();
    const v = pickVoice();
    $('voice-info').textContent = v ? 'Voix utilisée : ' + v.name : 'Aucune voix anglaise trouvée. Sur Android : Paramètres → Synthèse vocale → installe l\'anglais dans « Services vocaux Google ».';
  }
  $('set-daily').onchange = (e) => { state.settings.daily = Number(e.target.value); save(); };
  $('set-rate').onchange = (e) => { state.settings.rate = Number(e.target.value); save(); };
  $('set-accent').onchange = (e) => { state.settings.accent = e.target.value; save(); renderSettings(); };
  $('set-autoplay').onchange = (e) => { state.settings.autoplay = e.target.checked; save(); };
  $('btn-test-voice').onclick = () => speak('Hello! How are you today?');

  $('btn-export').onclick = () => {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = 'mots-anglais-sauvegarde-' + d.toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Sauvegarde téléchargée');
  };
  $('file-import').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const s = JSON.parse(r.result);
        if (!s || typeof s.cards !== 'object') throw new Error('format');
        if (!confirm('Remplacer ta progression actuelle par cette sauvegarde ?')) return;
        const d = defaultState();
        state = Object.assign(d, s, { settings: Object.assign(d.settings, s.settings || {}) });
        save(); renderSettings(); toast('Sauvegarde importée ✓');
      } catch (err) { toast('Fichier de sauvegarde invalide'); }
      e.target.value = '';
    };
    r.readAsText(f);
  };
  $('btn-reset').onclick = () => {
    if (!confirm('Effacer toute ta progression ? Cette action est définitive.')) return;
    state = defaultState(); save(); toast('Progression effacée'); history.back();
  };

  // ---------- Divers ----------
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2500);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden && current === 'home') renderHome(); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  history.replaceState({ v: 'home' }, '');
  show('home', false);
})();
