// articleclipper_ctbbj.js (one-click flow)

const siteUrl  = '//ctbbj.marianstreet.tokyo/';
const styleUrl = siteUrl + 'static/css/articleclipper.css';
const SECRET   = 'TmeGoqJUSLcHelEpMdOeGKjw9hmBlgHMCF';

// Inject CSS
(function injectCss(){
  const head = document.getElementsByTagName('head')[0];
  const link = document.createElement('link');
  link.rel  = 'stylesheet';
  link.type = 'text/css';
  link.href = styleUrl + '?r=' + Math.floor(Math.random() * 1e16);
  head.appendChild(link);
})();

// Inject floating box
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
  const titleSelectors =
    'article[class^="container_"] h1[class^="title_"], div.cmn-section h1.cmn-article_title';
  const dateSelectors =
    'article[class^="container_"] div[class^="timeStampOverride_"] time, dl.cmn-article_status dd.cmnc-publish';
  const paragraphSelectors =
    'article[class^="container_"] p[class^="paragraph_"], article[class^="container_"] h2[class^="text_"], div.cmn-article_text p, div.cmn-article_text h2';

  const container = document.getElementById('nikkei-container-element');
  const articleEl = container.querySelector('.article');
  const statusEl  = container.querySelector('#clipper-status');
  container.style.display = 'block';
  articleEl.innerHTML = '';
  statusEl.textContent = '';

  container.querySelector('#close').addEventListener('click', function (e){
    e.preventDefault();
    container.style.display = 'none';
  });

  // Extract core info from the current Nikkei page
  const titleNode = document.querySelector(titleSelectors);
  const dateNode  = document.querySelector(dateSelectors);

  const titleText = titleNode?.textContent?.trim() || 'No title';
  const dateText  = dateNode?.textContent?.trim() || '';

  // Show quick preview
  const h2 = document.createElement('h2');
  h2.textContent = titleText;
  const pDate = document.createElement('p');
  pDate.textContent = dateText;
  articleEl.append(h2, pDate);

  // Fix company profile links to absolute URLs
  document.querySelectorAll('a[href^="/nkd/company/"]').forEach(a => {
    a.href = 'https://www.nikkei.com' + a.getAttribute('href');
  });

  // Gather paragraphs (keep outerHTML for server-side storage)
  const paragraphs = document.querySelectorAll(paragraphSelectors);
  let textHtml = '';
  paragraphs.forEach(parag => {
    const clone = document.createElement(parag.tagName.toLowerCase());
    clone.textContent = parag.textContent;
    articleEl.append(clone);
    textHtml += parag.outerHTML + '\n';
  });

  // Build payload for base article
  const payload = {
    title:   titleText,
    text:    textHtml,
    url:     window.location.href,
    publish: dateText,
    tag:     getMostMentionedCompany(titleText, textHtml) || 'unknown',
    secret_token: SECRET
  };

  // One-click handler (saves JA, then EN/ZH automatically)
  container.querySelector('#save-article').addEventListener('click', async (e) => {
    e.preventDefault();
    disableButton(e.currentTarget, true);
    setStatus(statusEl, 'Saving base article…');

    try {
      // 1) Save original article → get article_id
      const baseRes = await postJSON(siteUrl + 'article/receive/', payload);
      if (!baseRes.ok) {
        const msg = await safeText(baseRes);
        throw new Error(`Base article save failed (${baseRes.status}): ${msg}`);
      }
      const baseJson = await baseRes.json().catch(() => ({}));
      const articleId = baseJson.article_id;
      if (!articleId) throw new Error('Missing article_id in response');

      setStatus(statusEl, `Base article saved (id=${articleId}). Fetching translations…`);

      // 2) Build translation URLs
      const ngId = extractNikkeiId(window.location.href) || '';
      if (!ngId) console.warn('Could not extract Nikkei article ID from URL—translation fetch may fail.');
      const enUrl = `https://www.nikkei.com/news/article-translation/?ng=${ngId}`;
      const zhUrl = `https://www.nikkei.com/news/article-translation/?bf=0&ng=${ngId}&mta=c`;

      // 3) Fetch and send EN
      const enHtml = await fetchOuterHTML(enUrl, '#engDiffBox');
      if (enHtml) {
        setStatus(statusEl, 'Saving English translation…');
        const enPayload = {
          article_id: articleId,
          language: 'en',
          html: enHtml,
          secret_token: SECRET
        };
        const enRes = await postJSON(siteUrl + 'receive-translation/', enPayload);
        if (!enRes.ok) console.warn('EN save failed', await safeText(enRes));
      } else {
        console.warn('EN translation box not found:', enUrl);
      }

      // 4) Fetch and send ZH
      const zhHtml = await fetchOuterHTML(zhUrl, '#engDiffBox');
      if (zhHtml) {
        setStatus(statusEl, 'Saving Chinese translation…');
        const zhPayload = {
          article_id: articleId,
          language: 'zh',
          html: zhHtml,
          secret_token: SECRET
        };
        const zhRes = await postJSON(siteUrl + 'receive-translation/', zhPayload);
        if (!zhRes.ok) console.warn('ZH save failed', await safeText(zhRes));
      } else {
        console.warn('ZH translation box not found:', zhUrl);
      }

      setStatus(statusEl, '✅ All done. Check admin/translations.');
      alert('✅ Article and translations submitted.');

    } catch (err) {
      console.error(err);
      setStatus(statusEl, '❌ Error: ' + err.message);
      alert('❌ ' + err.message);
    } finally {
      disableButton(e.currentTarget, false);
    }
  });
}

// --- helpers ---

function setStatus(el, msg) {
  if (el) el.textContent = msg;
}

function disableButton(btn, disabled) {
  if (!btn) return;
  btn.disabled = !!disabled;
  btn.style.opacity = disabled ? '0.6' : '1';
  btn.style.pointerEvents = disabled ? 'none' : 'auto';
}

async function postJSON(url, bodyObj) {
  return fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(bodyObj)
  });
}

async function safeText(res) {
  try { return await res.text(); } catch { return ''; }
}

async function fetchOuterHTML(url, selector) {
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) return '';
    const html = await res.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const node = doc.querySelector(selector);
    return node ? node.outerHTML : '';
  } catch (e) {
    console.warn('fetchOuterHTML failed for', url, e);
    return '';
  }
}

// Extract Nikkei article ID like DGXZQOUC022Q00S5A900C2000000
function extractNikkeiId(url) {
  const m = String(url).match(/([A-Z0-9]{16,})/);
  return m ? m[1] : '';
}

function getMostMentionedCompany(title, text) {
  const companies = [
    "TBS","ドコモ","三菱商事","富士フイルム","花王","セブン&amp;アイ","セブンイレブン",
    "ファミリーマート","三菱電機","日本ハム","トヨタ","ローソン","伊藤忠","明治","魚力"
  ];

  for (const company of companies) {
    if (title.includes(company)) return company.replace('amp;', '');
  }

  let topCompany = '', maxCount = 0;
  companies.forEach(company => {
    const count = (text.match(new RegExp(company, 'g')) || []).length;
    if (count > maxCount) { maxCount = count; topCompany = company; }
  });
  return topCompany.replace('amp;', '');
}

// launch
articleclipperLaunch_ctbbj();
