// articleclipper_ctbbj.js — one click, with background tabs for translations

const siteUrl  = '//ctbbj.marianstreet.tokyo/';
const styleUrl = siteUrl + 'static/css/articleclipper.css';
const SECRET   = 'TmeGoqJUSLcHelEpMdOeGKjw9hmBlgHMCF';

// -- tiny UI (same as before)
(function injectCss(){
  const head = document.getElementsByTagName('head')[0];
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = styleUrl + '?r=' + Math.floor(Math.random() * 1e16);
  head.appendChild(link);
})();
(function injectUi(){
  const body = document.getElementsByTagName('body')[0];
  const boxHtml = `
    <div id="nikkei-container-element" style="display:none">
      <a href="#" id="close" title="close">&times;</a>
      <button id="save-article" class="button">Save this article</button>
      <div id="clipper-status" class="mt-2 text-sm"></div>
      <div class="article mt-3"></div>
    </div>`;
  body.insertAdjacentHTML('beforeend', boxHtml);
})();

async function articleclipperLaunch_ctbbj() {
  const titleSel =
    'article[class^="container_"] h1[class^="title_"], div.cmn-section h1.cmn-article_title';
  const dateSel =
    'article[class^="container_"] div[class^="timeStampOverride_"] time, dl.cmn-article_status dd.cmnc-publish';
  const paraSel =
    'article[class^="container_"] p[class^="paragraph_"], article[class^="container_"] h2[class^="text_"], div.cmn-article_text p, div.cmn-article_text h2';

  const container = document.getElementById('nikkei-container-element');
  const articleEl = container.querySelector('.article');
  const statusEl  = container.querySelector('#clipper-status');
  container.style.display = 'block';
  articleEl.innerHTML = '';
  statusEl.textContent = '';

  container.querySelector('#close').addEventListener('click', (e) => {
    e.preventDefault();
    container.style.display = 'none';
  });

  const titleNode = document.querySelector(titleSel);
  const dateNode  = document.querySelector(dateSel);

  const titleText = titleNode?.textContent?.trim() || 'No title';
  const dateText  = dateNode?.textContent?.trim() || '';

  const h2 = document.createElement('h2');
  h2.textContent = titleText;
  const pDate = document.createElement('p');
  pDate.textContent = dateText;
  articleEl.append(h2, pDate);

  document.querySelectorAll('a[href^="/nkd/company/"]').forEach(a => {
    a.href = 'https://www.nikkei.com' + a.getAttribute('href');
  });

  const paragraphs = document.querySelectorAll(paraSel);
  let textHtml = '';
  paragraphs.forEach(parag => {
    const clone = document.createElement(parag.tagName.toLowerCase());
    clone.textContent = parag.textContent;
    articleEl.append(clone);
    textHtml += parag.outerHTML + '\n';
  });

  const payload = {
    title:   titleText,
    text:    textHtml,
    url:     window.location.href,
    publish: dateText,
    tag:     getMostMentionedCompany(titleText, textHtml) || 'unknown',
    secret_token: SECRET
  };

  container.querySelector('#save-article').addEventListener('click', async (e) => {
    e.preventDefault();
    disableButton(e.currentTarget, true);
    setStatus(statusEl, 'Saving base article…');

    try {
      // 1) Save the base article
      const baseRes = await postJSON(siteUrl + 'article/receive/', payload);
      const baseTxt = await baseRes.text();
      if (!baseRes.ok) throw new Error(`Base article save failed (${baseRes.status}): ${baseTxt}`);
      let baseJson = {};
      try { baseJson = JSON.parse(baseTxt); } catch {}
      const articleId = baseJson.article_id;
      if (!articleId) throw new Error('Missing article_id in response');
      setStatus(statusEl, `Base article saved (id=${articleId}). Opening translations…`);

      // 2) Build translation URLs from current page
      const ngId = extractNikkeiId(window.location.href) || '';
      const enUrl = `https://www.nikkei.com/news/article-translation/?ng=${ngId}`;
      const zhUrl = `https://www.nikkei.com/news/article-translation/?bf=0&ng=${ngId}&mta=c`;

      // 3) Open both pages in background *from the user click* (bypasses popup blockers)
      const enWin = safeOpen(enUrl);
      const zhWin = safeOpen(zhUrl);

      if (!enWin || !zhWin) {
        alert('⚠️ Please allow popups for this site, then click again.\n(We open translation pages in background to extract their content.)');
        setStatus(statusEl, 'Popup blocked. Enable popups and retry.');
        return;
      }

      setStatus(statusEl, 'Waiting for translations to load…');

      // 4) Wait for #engDiffBox in each window, then grab outerHTML & close
      const [enHtml, zhHtml] = await Promise.all([
        waitForSelectorOuterHTML(enWin, '#engDiffBox', {timeoutMs: 20000, pollMs: 400}).catch(() => ''),
        waitForSelectorOuterHTML(zhWin, '#engDiffBox', {timeoutMs: 20000, pollMs: 400}).catch(() => '')
      ]);

      // 5) Post EN if found
      if (enHtml && enHtml.length > 0) {
        setStatus(statusEl, 'Saving English translation…');
        const enPayload = { article_id: articleId, language: 'en', html: enHtml, secret_token: SECRET };
        const enRes = await postJSON(siteUrl + 'receive-translation/', enPayload);
        if (!enRes.ok) console.warn('EN save failed:', await enRes.text());
      } else {
        console.warn('EN engDiffBox not found (or timed out).');
      }

      // 6) Post ZH if found
      if (zhHtml && zhHtml.length > 0) {
        setStatus(statusEl, 'Saving Chinese translation…');
        const zhPayload = { article_id: articleId, language: 'zh', html: zhHtml, secret_token: SECRET };
        const zhRes = await postJSON(siteUrl + 'receive-translation/', zhPayload);
        if (!zhRes.ok) console.warn('ZH save failed:', await zhRes.text());
      } else {
        console.warn('ZH engDiffBox not found (or timed out).');
      }

      setStatus(statusEl, '✅ All done. Check admin/translations.');
      alert('✅ Article and translations submitted.');

    } catch (err) {
      console.error(err);
      setStatus(statusEl, '❌ ' + err.message);
      alert('❌ ' + err.message);
    } finally {
      disableButton(e.currentTarget, false);
    }
  });
}

// --- helpers ---

function setStatus(el, msg) { if (el) el.textContent = msg; }
function disableButton(btn, disabled) {
  if (!btn) return;
  btn.disabled = !!disabled;
  btn.style.opacity = disabled ? '0.6' : '1';
  btn.style.pointerEvents = disabled ? 'none' : 'auto';
}
async function postJSON(url, bodyObj) {
  return fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(bodyObj) });
}
function extractNikkeiId(url) {
  const m = String(url).match(/([A-Z0-9]{16,})/);
  return m ? m[1] : '';
}
function getMostMentionedCompany(title, text) {
  const companies = [
    "TBS","ドコモ","三菱商事","富士フイルム","花王","セブン&amp;アイ","セブンイレブン",
    "ファミリーマート","三菱電機","日本ハム","トヨタ","ローソン","伊藤忠","明治","魚力"
  ];
  for (const c of companies) if (title.includes(c)) return c.replace('amp;', '');
  let top = '', max = 0;
  for (const c of companies) {
    const cnt = (text.match(new RegExp(c, 'g')) || []).length;
    if (cnt > max) { max = cnt; top = c; }
  }
  return top.replace('amp;', '');
}

/**
 * Open a new background window (from a user click) to avoid popup blockers.
 * Returns the window object or null if blocked.
 */
function safeOpen(url) {
  // features minimal; position offscreen-ish
  const w = window.open(url, '_blank', 'noopener,noreferrer,width=800,height=600,left=50,top=50');
  try { if (w) w.blur(); } catch {}
  try { window.focus(); } catch {}
  return w || null;
}

/**
 * Polls a same-origin window for a selector and returns outerHTML once found.
 * Closes the window when done or on timeout.
 */
function waitForSelectorOuterHTML(win, selector, { timeoutMs = 15000, pollMs = 300 } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    let timer = null;

    function cleanupAndResolve(val) {
      try { if (win && !win.closed) win.close(); } catch {}
      if (timer) clearInterval(timer);
      resolve(val);
    }

    // If window never opens or is cross-origin, bail after timeout
    if (!win) return cleanupAndResolve('');

    timer = setInterval(() => {
      try {
        if (!win || win.closed) return cleanupAndResolve('');
        // same-origin check: accessing .document will throw if not same-origin
        const doc = win.document;
        const node = doc && doc.querySelector(selector);
        if (node) return cleanupAndResolve(node.outerHTML);
      } catch (e) {
        // likely not ready yet; ignore
      }
      if (Date.now() - start > timeoutMs) cleanupAndResolve('');
    }, pollMs);
  });
}

// Boot
articleclipperLaunch_ctbbj();
