const siteUrl = '//marianstreet.tokyo/';
const styleUrl = siteUrl + 'static/css/articleclipper.css';

// load CSS
var head = document.getElementsByTagName('head')[0];  // Get HTML head element
var link = document.createElement('link'); // Create new link Element
link.rel = 'stylesheet'; // set the attributes for link element
link.type = 'text/css';
link.href = styleUrl + '?r=' + Math.floor(Math.random()*9999999999999999);
head.appendChild(link);  // Append link element to HTML head

// load HTML
var body = document.getElementsByTagName('body')[0];
boxHtml = `
  <div id="nikkei-container-element">
    <a href="#" id="close">&times;</a>
    <button id="save-article">Save this article</button>
    <div class="article"></div>
  </div>`;
body.innerHTML += boxHtml;

//
// get the article and submit it
//
async function articleclipperLaunch2() {
  // title selectors
  const titleSelectors = 'article[class^="container_"] h1[class^="title_"], div.cmn-section h1.cmn-article_title';
  const dateSelectors = 'article[class^="container_"] div[class^="timeStampOverride_"] time, dl.cmn-article_status dd.cmnc-publish';
  const paragraphSelectors = 'article[class^="container_"] p[class^="paragraph_"], article[class^="container_"] h2[class^="text_"], div.cmn-article_text p, div.cmn-article_text h2';
    const containerElement = document.getElementById('nikkei-container-element');
    const articleElement = containerElement.querySelector('.article');
    articleElement.innerHTML = '';
    containerElement.style.display = 'block';

    // close event
    containerElement.querySelector('#close')
        .addEventListener('click', function(){
            containerElement.style.display = 'none'
        });

    // find images in the DOM with the minimum dimensions
    const article_title = document.querySelector(titleSelectors);
    const title = document.createElement('h2');
    title.textContent = article_title?.textContent || 'No title';
    articleElement.append(title);

    const article_date = document.querySelector(dateSelectors);
    const dateElem = document.createElement('p');
    dateElem.textContent = article_date?.textContent || '';
    articleElement.append(dateElem);
    
    // make sure all links are absolute
    document.querySelectorAll('a[href^="/nkd/company/"]').forEach(a => {
      a.href = 'https://www.nikkei.com' + a.getAttribute('href');
    });
    const paragraphs = document.querySelectorAll(paragraphSelectors);
    paragraphs.forEach(parag => {
        const tag = parag.tagName.toLowerCase(); // a p or h2
        const elem = document.createElement(tag);
        elem.textContent = parag.textContent;
        articleElement.append(elem);
    });

    let text = '';
    paragraphs.forEach(parag => {
        text += parag.outerHTML + '\n';
    });

    const payload = {
        title: title.textContent,
        text: text,
        url: window.location.href,
        publish: article_date?.textContent || '',
        tag: getMostMentionedCompany(title.textContent, text) || 'unknown',
        secret_token: 'TmeGoqJUSLcHelEpMdOeGKjw9hmBlgHMCF'
    };

    const saveBtn = containerElement.querySelector('#save-article');
    saveBtn.addEventListener('click', async function (e) {
        e.preventDefault();

        try {
            const response = await fetch(siteUrl + "article/receive/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const result = await response.text();
            const status = await response.status;
            alert("✅ Article submitted successfully:\n" + result + status);
        } catch (err) {
            console.error("❌ Submission failed:", err);
            alert("❌ Failed to send article.");
        }
    });
    // containerElement.style.display = 'none'
}

function getMostMentionedCompany(title, text) {
  const companies = [
    "TBS",
    "ドコモ",
    "三菱商事",
    "富士フイルム",
    "花王",
    "セブン&amp;アイ",
    "セブンイレブン",
    "ファミリーマート",
    "三菱電機",
    "日本ハム",
    "トヨタ",
    "ローソン",
    "伊藤忠",
    "明治",
    "魚力"
  ];

  for (const company of companies) {
    if (title.includes(company)) {
      return company.replace('amp;', '');
    }
  }

  let topCompany = '';
  let maxCount = 0;

  companies.forEach(company => {
    const regex = new RegExp(company, 'g');
    const count = (text.match(regex) || []).length;
    if (count > maxCount) {
      maxCount = count;
      topCompany = company;
    }
  });

  return topCompany.replace('amp;', '');
}

// launch the bookmkarklet
articleclipperLaunch2();