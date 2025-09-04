// articleclipper_ctbbj.js — one click with background tabs for translations

const siteUrl = '//ctbbj.marianstreet.tokyo/';
const styleUrl = siteUrl + 'static/css/articleclipper.css';
const SECRET = 'TmeGoqJUSLcHelEpMdOeGKjw9hmBlgHMCF';
const TRANSLATE_ENDPOINT = siteUrl + 'article/receive_translation';

// ---------- Inject CSS ----------
(function injectCss() {
  const head = document.getElementsByTagName('head')[0];
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = styleUrl + '?r=' + Math.floor(Math.random() * 1e16);
  head.appendChild(link);
})();

// ---------- Inject minimal UI ----------
(function injectUi() {
  const body = document.getElementsByTagName('body')[0];
  const boxHtml = `
    <div id="nikkei-container-element" style="display:none; position:fixed; z-index:2147483647; right:16px; bottom:16px; background:#fff; border:1px solid #ddd; border-radius:8px; padding:12px; box-shadow:0 6px 20px rgba(0,0,0,.15); max-width:420px; font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <strong>CTBBJ Clipper</strong>
        <a href="#" id="close" title="close" style="text-decoration:none;font-size:18px;">&times;</a>
      </div>
      <button id="save-article" style="margin-top:8px; padding:8px 12px; border-radius:6px; border:1px solid #1d4ed8; background:#2563eb; color:#fff;">Save this article</button>
      <div id="clipper-status" style="margin-top:8px; color:#374151;"></div>
      <div class="article" style="margin-top:10px; max-height:220px; overflow:auto;"></div>
    </div>`;
  body.insertAdjacentHTML('beforeend', boxHtml);
})();

// ---------- Main ----------
async function articleclipperLaunch_ctbbj() {
  const titleSel =
    'article[class^="container_"] h1[class^="title_"], div.cmn-section h1.cmn-article_title';
  const dateSel =
    'article[class^="container_"] div[class^="timeStampOverride_"] time, dl.cmn-article_status dd.cmnc-publish';
  const paraSel =
    'article[class^="container_"] p[class^="paragraph_"], article[class^="container_"] h2[class^="text_"], div.cmn-article_text p, div.cmn-article_text h2';

  const container = document.getElementById('nikkei-container-element');
  const articleEl = container.querySelector('.article');
  const statusEl = container.querySelector('#clipper-status');
  container.style.display = 'block';
  articleEl.innerHTML = '';
  statusEl.textContent = '';

  container.querySelector('#close').addEventListener('click', (e) => {
    e.preventDefault();
    container.style.display = 'none';
  });

  // Extract content from current page
  const titleNode = document.querySelector(titleSel);
  const dateNode = document.querySelector(dateSel);
  const titleText = titleNode?.textContent?.trim() || 'No title';
  const dateText = dateNode?.textContent?.trim() || '';

  const h2 = document.createElement('h2');
  h2.textContent = titleText;
  h2.style.marginBottom = '6px';
  const pDate = document.createElement('p');
  pDate.textContent = dateText;
  pDate.style.color = '#6b7280';
  articleEl.append(h2, pDate);

  // fix company profile links to absolute
  document.querySelectorAll('a[href^="/nkd/company/"]').forEach(a => {
    a.href = 'https://www.nikkei.com' + a.getAttribute('href');
  });

  // gather paragraphs (outerHTML preserved in textHtml)
  const paragraphs = document.querySelectorAll(paraSel);
  let textHtml = '';
  paragraphs.forEach(parag => {
    const clone = document.createElement(parag.tagName.toLowerCase());
    clone.textContent = parag.textContent;
    articleEl.append(clone);
    textHtml += parag.outerHTML + '\n';
  });

  const payload = {
    title: titleText,
    text: textHtml,
    url: window.location.href,
    publish: dateText,
    tag: getMostMentionedCompany(titleText, textHtml) || 'unknown',
    secret_token: SECRET
  };

  // One-click: save base, then auto-translate saves
  container.querySelector('#save-article').addEventListener('click', async (e) => {
    e.preventDefault();
    disableButton(e.currentTarget, true);
    setStatus(statusEl, 'Saving base article…');

    try {
      // 1) Save base article
      const baseRes = await postJSON(siteUrl + 'article/receive/', payload);
      const baseTxt = await baseRes.text();
      if (!baseRes.ok) throw new Error(`Base article save failed (${baseRes.status}): ${baseTxt}`);
      let baseJson = {};
      try { baseJson = JSON.parse(baseTxt); } catch { }
      const articleId = baseJson.article_id;
      if (!articleId) throw new Error('Missing article_id in response');

      setStatus(statusEl, `Base article saved (id=${articleId}). Opening translations…`);

      // 2) Build translation URLs (from current page)
      const ngId = extractNikkeiId(window.location.href) || '';
      const enUrl = `https://www.nikkei.com/news/article-translation/?ng=${ngId}`;
      const zhUrl = `https://www.nikkei.com/news/article-translation/?bf=0&ng=${ngId}&mta=c`;

      // 3) Open both pages (no noopener/noreferrer so DOM is accessible)
      // 2) Build translation URLs (from current page)
      const ngId = extractNikkeiId(window.location.href) || '';
      const enUrl = `https://www.nikkei.com/news/article-translation/?ng=${ngId}`;
      const zhUrl = `https://www.nikkei.com/news/article-translation/?bf=0&ng=${ngId}&mta=c`;

      // 3) Open EN first, delay, then ZH (no noopener so DOM is accessible)
      const enWin = safeOpen(enUrl);
      await humanDelay(1100, 2300);          // small pause before next open
      const zhWin = safeOpen(zhUrl);

      if (!enWin && !zhWin) {
        alert('⚠️ Could not open any translation tabs. Please allow popups and try again.');
        setStatus(statusEl, 'No translation tabs could be opened.');
        return;
      }
      setStatus(statusEl, 'Waiting for translations to load…');

      // 4) Scrape EN first (with a tiny pre-scrape pause), then ZH
      let enHtml = '';
      if (enWin) {
        await humanDelay(900, 1800);
        enHtml = await waitForSelectorOuterHTML(enWin, '#engDiffBox', { timeoutMs: 22000, pollMs: 400 }).catch(() => '');
      }

      let zhHtml = '';
      if (zhWin) {
        await humanDelay(1000, 2000);
        zhHtml = await waitForSelectorOuterHTML(zhWin, '#engDiffBox', { timeoutMs: 22000, pollMs: 400 }).catch(() => '');
      }

      // 5) Post EN if found
      if (enHtml && enHtml.length > 0) {
        setStatus(statusEl, 'Saving English translation…');
        const enPayload = { article_id: articleId, language: 'en', html: enHtml, secret_token: SECRET };
        const enRes = await postJSON(TRANSLATE_ENDPOINT, enPayload);
        if (!enRes.ok) console.warn('EN save failed:', await enRes.text());
        await humanDelay(800, 1600);  // brief pause between saves
      } else {
        console.warn('EN engDiffBox not found/timed out.');
      }

      // 6) Post ZH if found
      if (zhHtml && zhHtml.length > 0) {
        setStatus(statusEl, 'Saving Chinese translation…');
        const zhPayload = { article_id: articleId, language: 'zh', html: zhHtml, secret_token: SECRET };
        const zhRes = await postJSON(TRANSLATE_ENDPOINT, zhPayload);
        if (!zhRes.ok) console.warn('ZH save failed:', await zhRes.text());
      } else {
        console.warn('ZH engDiffBox not found/timed out.');
      }



      // const enWin = safeOpen(enUrl);  // may be null if blocked
      // const zhWin = safeOpen(zhUrl);

      // if (!enWin && !zhWin) {
      //   alert('⚠️ Could not open any translation tabs. Please allow popups and try again.');
      //   setStatus(statusEl, 'No translation tabs could be opened.');
      //   return;
      // }
      // setStatus(statusEl, 'Waiting for translations to load…');

      // // 4) Wait for #engDiffBox in each tab, then grab outerHTML and close the tab
      // const [enHtml, zhHtml] = await Promise.all([
      //   waitForSelectorOuterHTML(enWin, '#engDiffBox', { timeoutMs: 20000, pollMs: 400 }).catch(() => ''),
      //   waitForSelectorOuterHTML(zhWin, '#engDiffBox', { timeoutMs: 20000, pollMs: 400 }).catch(() => '')
      // ]);

      // // 5) Post EN if found
      // if (enHtml && enHtml.length > 0) {
      //   setStatus(statusEl, 'Saving English translation…');
      //   const enPayload = { article_id: articleId, language: 'en', html: enHtml, secret_token: SECRET };
      //   const enRes = await postJSON(TRANSLATE_ENDPOINT, enPayload);
      //   if (!enRes.ok) console.warn('EN save failed:', await enRes.text());
      // } else {
      //   console.warn('EN engDiffBox not found/timed out.');
      // }

      // // 6) Post ZH if found
      // if (zhHtml && zhHtml.length > 0) {
      //   setStatus(statusEl, 'Saving Chinese translation…');
      //   const zhPayload = { article_id: articleId, language: 'zh', html: zhHtml, secret_token: SECRET };
      //   const zhRes = await postJSON(TRANSLATE_ENDPOINT, zhPayload);
      //   if (!zhRes.ok) console.warn('ZH save failed:', await zhRes.text());
      // } else {
      //   console.warn('ZH engDiffBox not found/timed out.');
      // }

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

// ---------- Helpers ----------
function setStatus(el, msg) { if (el) el.textContent = msg; }

function disableButton(btn, disabled) {
  if (!btn) return;
  btn.disabled = !!disabled;
  btn.style.opacity = disabled ? '0.6' : '1';
  btn.style.pointerEvents = disabled ? 'none' : 'auto';
}

async function postJSON(url, bodyObj) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj)
  });
}

// Open a new tab you can access (no noopener/noreferrer)
function safeOpen(url) {
  // Use a standard new tab. If your browser blocks it, this returns null.
  const w = window.open(url, '_blank', 'width=900,height=700,left=80,top=60');
  return w || null;
}

// Poll a same-origin window for a selector; return its outerHTML; close tab
function waitForSelectorOuterHTML(win, selector, { timeoutMs = 20000, pollMs = 350 } = {}) {
  return new Promise((resolve) => {
    if (!win) return resolve('');
    const start = Date.now();
    let timer = null;

    function cleanup(val) {
      try { if (win && !win.closed) win.close(); } catch { }
      if (timer) clearInterval(timer);
      resolve(val);
    }

    timer = setInterval(() => {
      if (!win || win.closed) return cleanup('');
      try {
        const doc = win.document; // will throw if not accessible yet
        const node = doc && (doc.querySelector(selector) ||
          doc.querySelector('#engDiffBox') ||
          doc.querySelector('[id*="DiffBox"]'));
        if (node) return cleanup(node.outerHTML);
      } catch (e) {
        // likely not ready yet; ignore and keep polling
      }
      if (Date.now() - start > timeoutMs) cleanup('');
    }, pollMs);
  });
}

// Extract Nikkei article ID like DGXZQOUC022Q00S5A900C2000000
function extractNikkeiId(url) {
  const m = String(url).match(/([A-Z0-9]{16,})/);
  return m ? m[1] : '';
}

function getMostMentionedCompany(title, text) {
  const companies = [
    "TBS", "ドコモ", "三菱商事", "富士フイルム", "花王", "セブン&amp;アイ", "セブンイレブン",
    "ファミリーマート", "三菱電機", "日本ハム", "トヨタ", "ローソン", "伊藤忠", "明治", "魚力"
  ];
  for (const c of companies) if (title.includes(c)) return c.replace('amp;', '');
  let top = '', max = 0;
  for (const c of companies) {
    const cnt = (text.match(new RegExp(c, 'g')) || []).length;
    if (cnt > max) { max = cnt; top = c; }
  }
  return top.replace('amp;', '');
}
// --- add near other helpers ---
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function humanDelay(minMs = 900, maxMs = 2200) {
  const d = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return sleep(d);
}

// ---------- Launch ----------
articleclipperLaunch_ctbbj();
