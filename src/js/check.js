/* ===========================================
   check.js — логика страницы Check Rates
=========================================== */


/* ──────────────────────────────────────────
   CORS-прокси
   allorigins.win принимает URL через encodeURIComponent
   и возвращает HTML как JSON { contents: "..." }
────────────────────────────────────────── */
async function fetchHtml(url) {
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  const response = await fetch(proxyUrl);
  if (!response.ok) throw new Error('Ошибка прокси: ' + response.status);
  const data = await response.json();
  if (!data.contents) throw new Error('Прокси вернул пустой ответ');
  return data.contents;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


/* ──────────────────────────────────────────
   Достаём username из ссылки или строки
────────────────────────────────────────── */
function extractUsername(input) {
  const trimmed = input.trim().replace(/\/$/, '');
  const urlMatch = trimmed.match(/letterboxd\.com\/([A-Za-z0-9_-]+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  return null;
}


/* ──────────────────────────────────────────
   Состояние страницы watchlist
────────────────────────────────────────── */
function detectPageState(html, username) {
  const lower = html.toLowerCase();
  if (lower.includes('this page is private') || lower.includes('private watchlist')) return 'private';
  if (lower.includes("sorry, we can't find the page") || lower.includes("page you've requested")) return 'not_found';
  const hasFilms    = lower.includes('data-target-link') || lower.includes('film-poster');
  const usernameRe  = new RegExp('\\b' + username.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  if (!hasFilms && !usernameRe.test(lower)) return 'not_found';
  return 'ok';
}


/* ──────────────────────────────────────────
   Парсим фильмы из страницы watchlist
────────────────────────────────────────── */
function parseFilmsFromPage(html) {
  const doc  = new DOMParser().parseFromString(html, 'text/html');
  const seen = new Set();
  const films = [];

  doc.querySelectorAll('[data-target-link^="/film/"]').forEach(el => {
    const path = el.getAttribute('data-target-link').trim();
    if (!path || seen.has(path)) return;
    seen.add(path);

    let title = el.getAttribute('data-film-name') || '';
    if (!title) { const img = el.querySelector('img[alt]'); if (img) title = img.getAttribute('alt') || ''; }
    if (!title) title = path.replace('/film/', '').replace(/\//g, '').replace(/-/g, ' ');

    films.push({ title: title.trim(), film_url: 'https://letterboxd.com' + path });
  });

  return films;
}


function hasNextPage(html) {
  const doc  = new DOMParser().parseFromString(html, 'text/html');
  const next = doc.querySelector('.next');
  return !!(next && next.textContent.toLowerCase().includes('next'));
}


/* ──────────────────────────────────────────
   Достаём среднюю оценку из HTML страницы фильма.

   ВАЖНО: allorigins возвращает HTML с экранированными кавычками
   (&quot; вместо "), поэтому DOMParser и querySelector не могут
   найти атрибуты мета-тегов. Используем regex по сырой строке —
   он работает в любом случае.
────────────────────────────────────────── */
function extractRating(html) {
  let m;

  // Источник 1: twitter:data2 — "4.22 out of 5"
  // Ищем число рядом с twitter:data2, не зависим от кавычек
  m = html.match(/twitter:data2[^>]*?(?:content|value)[^>]*?[=\s"'&;]+([0-9]+\.[0-9]+)/i);
  if (m) return parseFloat(m[1]);

  // Источник 2: ratingValue в JSON-LD — "ratingValue":"4.22" или "ratingValue":4.22
  m = html.match(/"ratingValue"\s*:\s*"?([0-9]+\.[0-9]+)"?/);
  if (m) return parseFloat(m[1]);

  // Источник 3: паттерн "4.22 out of 5" в любом месте HTML
  m = html.match(/([0-9]+\.[0-9]+)\s+out\s+of\s+5/i);
  if (m) return parseFloat(m[1]);

  // Источник 4: og:description рядом с числом-рейтингом
  m = html.match(/og:description[^>]*?([0-9]+\.[0-9]+)/i);
  if (m) return parseFloat(m[1]);

  return null;
}


/* ──────────────────────────────────────────
   UI-хелперы
────────────────────────────────────────── */
const get = (id) => document.getElementById(id);

function setStatus(message, type) {
  const el = get('statusBox');
  el.textContent = message;
  el.className = 'status visible' + (type ? ' ' + type : '');
}

function setProgress(percent) {
  get('progressBar').style.width = percent + '%';
  get('progressWrap').className = 'progress-wrap' + (percent > 0 ? ' visible' : '');
}

function clearResults() {
  const el = get('resultsWrap');
  el.innerHTML = '';
  el.className = 'results-wrap';
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderResults(rows) {
  const el = get('resultsWrap');
  if (!rows.length) {
    el.innerHTML = '<div class="result-item" style="color:var(--faint);font-size:13px">Нет данных.</div>';
  } else {
    el.innerHTML = rows.map(row => {
      const rating     = row.average_rating;
      const ratingText = rating != null ? '\u2605 ' + rating.toFixed(2) : 'N/A';
      const ratingCls  = rating != null ? '' : ' na';
      return `
        <div class="result-item">
          <div>
            <div class="result-title">${escapeHtml(row.title)}</div>
            <a class="result-link" href="${escapeHtml(row.film_url)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(row.film_url)}
            </a>
          </div>
          <div class="result-rating${ratingCls}">${escapeHtml(ratingText)}</div>
        </div>`;
    }).join('');
  }
  el.className = 'results-wrap visible';
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


/* ──────────────────────────────────────────
   Главная функция
────────────────────────────────────────── */
let currentRows = [];
let isRunning   = false;

async function runCheck(inputValue) {
  if (isRunning) return;
  isRunning = true;

  get('checkBtn').disabled        = true;
  get('downloadCsvBtn').disabled  = true;
  get('downloadJsonBtn').disabled = true;
  clearResults();
  setProgress(2);
  currentRows = [];

  const username = extractUsername(inputValue);
  if (!username) {
    setStatus('Введи ссылку или username, например: https://letterboxd.com/username/', 'error');
    setProgress(0);
    get('checkBtn').disabled = false;
    isRunning = false;
    return;
  }

  setStatus(`Загружаю watchlist @${username}…`);
  let allFilms = [];

  try {
    let page = 1;
    while (page <= 50) {
      const watchlistUrl = `https://letterboxd.com/${username}/watchlist/page/${page}/`;
      setStatus(`Страница ${page} watchlist @${username}…`);

      let html;
      try {
        html = await fetchHtml(watchlistUrl);
      } catch (e) {
        setStatus(`Ошибка загрузки (стр. ${page}): ${e.message}`, 'error');
        setProgress(0);
        get('checkBtn').disabled = false;
        isRunning = false;
        return;
      }

      const state = detectPageState(html, username);
      if (page === 1 && state === 'private') {
        setStatus(`Watchlist @${username} закрыт — приватные watchlist недоступны.`, 'error');
        setProgress(0); get('checkBtn').disabled = false; isRunning = false; return;
      }
      if (page === 1 && state === 'not_found') {
        setStatus(`Пользователь @${username} не найден на Letterboxd.`, 'error');
        setProgress(0); get('checkBtn').disabled = false; isRunning = false; return;
      }

      const filmsOnPage = parseFilmsFromPage(html);
      if (!filmsOnPage.length) break;
      allFilms = allFilms.concat(filmsOnPage);
      if (!hasNextPage(html)) break;
      page++;
      await sleep(800);
    }
  } catch (e) {
    setStatus('Непредвиденная ошибка: ' + e.message, 'error');
    setProgress(0); get('checkBtn').disabled = false; isRunning = false; return;
  }

  // Дедупликация
  const seen = new Set();
  allFilms = allFilms.filter(film => {
    if (seen.has(film.film_url)) return false;
    seen.add(film.film_url);
    return true;
  });

  if (!allFilms.length) {
    setStatus(`Watchlist @${username} пуст.`, 'error');
    setProgress(0); get('checkBtn').disabled = false; isRunning = false; return;
  }

  setStatus(`Найдено: ${allFilms.length} фильмов. Загружаю рейтинги…`);
  const results = [];

  for (let i = 0; i < allFilms.length; i++) {
    const film = allFilms[i];
    setProgress(Math.round(((i + 1) / allFilms.length) * 100));
    setStatus(`[${i + 1}/${allFilms.length}] ${film.title}`);

    let rating = null;
    try {
      const filmHtml = await fetchHtml(film.film_url);
      rating = extractRating(filmHtml);
    } catch (e) { /* оставляем null */ }

    results.push({ title: film.title, film_url: film.film_url, average_rating: rating });
    await sleep(700);
  }

  results.sort((a, b) => {
    if (a.average_rating === null && b.average_rating === null) return 0;
    if (a.average_rating === null) return 1;
    if (b.average_rating === null) return -1;
    return b.average_rating - a.average_rating;
  });

  currentRows = results;
  renderResults(results);
  setProgress(100);
  setStatus(`Готово! ${results.length} фильмов, отсортировано по рейтингу.`, 'success');
  get('downloadCsvBtn').disabled  = false;
  get('downloadJsonBtn').disabled = false;
  get('checkBtn').disabled        = false;
  isRunning = false;
}


/* ── Обновляем лейбл в шапке при скролле ── */
const topLabel = get('topLabel');
const pageSections = [
  { el: document.getElementById('home'),        label: 'первый экран' },
  { el: document.getElementById('check-rates'), label: 'check rates'  },
];
const labelObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const found = pageSections.find(s => s.el === entry.target);
    if (found) topLabel.textContent = found.label;
  });
}, { threshold: 0.5 });
pageSections.forEach(s => labelObserver.observe(s.el));


/* ── Слушатели событий ── */
get('checkBtn').addEventListener('click', () => runCheck(get('profileUrl').value));
get('profileUrl').addEventListener('keydown', e => { if (e.key === 'Enter') runCheck(get('profileUrl').value); });

get('downloadCsvBtn').addEventListener('click', () => {
  if (!currentRows.length) return;
  const header = 'title,film_url,average_rating';
  const rows = currentRows.map(r =>
    `"${String(r.title).replaceAll('"','""')}","${String(r.film_url).replaceAll('"','""')}","${r.average_rating ?? ''}"`
  );
  downloadBlob([header, ...rows].join('\n'), 'watchlist_ratings.csv', 'text/csv;charset=utf-8');
});

get('downloadJsonBtn').addEventListener('click', () => {
  if (!currentRows.length) return;
  downloadBlob(JSON.stringify(currentRows, null, 2), 'watchlist_ratings.json', 'application/json');
});
