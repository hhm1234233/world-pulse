// 世界脉搏 · 数据构建脚本
// 在 GitHub Actions 上每小时运行一次：抓取权威信源 → 聚类交叉证实 → 排序 → 翻译 → 写出 data.json
// 只用 Node 内置能力，无需 npm install。

import { writeFileSync } from 'node:fs';

/* ============================================================
   信源阵容：通讯社 / 记录报 / 财经 / 国际视角 / 科技
   没有公开 RSS 的（路透、美联社、彭博、FT）走 Google News 定向检索
   ============================================================ */
const GN = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const SOURCES = [
  // ——— 通讯社：最原始、最快、加工最少 ———
  {id:'reuters-w', name:'Reuters',   zh:'路透社',      tier:'wire',    cat:'world', w:1.00, pay:false, url:GN('site:reuters.com when:1d')},
  {id:'ap-w',      name:'AP',        zh:'美联社',      tier:'wire',    cat:'world', w:1.00, pay:false, url:GN('site:apnews.com when:1d')},
  {id:'afp-w',     name:'AFP',       zh:'法新社',      tier:'wire',    cat:'world', w:0.95, pay:false, url:GN('site:afp.com OR site:barrons.com/afp when:1d')},
  {id:'reuters-b', name:'Reuters',   zh:'路透社',      tier:'wire',    cat:'biz',   w:1.00, pay:false, url:GN('site:reuters.com (markets OR economy OR business) when:1d')},
  {id:'reuters-t', name:'Reuters',   zh:'路透社',      tier:'wire',    cat:'tech',  w:1.00, pay:false, url:GN('site:reuters.com (technology OR chips OR AI) when:1d')},

  // ——— 记录报 ———
  {id:'nyt-w',   name:'NYT',         zh:'纽约时报',    tier:'record',  cat:'world', w:0.98, pay:true,  url:'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'},
  {id:'wsj-w',   name:'WSJ',         zh:'华尔街日报',  tier:'record',  cat:'world', w:0.96, pay:true,  url:'https://feeds.a.dj.com/rss/RSSWorldNews.xml'},
  {id:'ft-w',    name:'FT',          zh:'金融时报',    tier:'record',  cat:'world', w:0.95, pay:true,  url:GN('site:ft.com when:1d')},
  {id:'wapo-w',  name:'WaPo',        zh:'华盛顿邮报',  tier:'record',  cat:'world', w:0.93, pay:true,  url:'https://feeds.washingtonpost.com/rss/world'},
  {id:'guard-w', name:'Guardian',    zh:'卫报',        tier:'record',  cat:'world', w:0.92, pay:false, url:'https://www.theguardian.com/world/rss'},
  {id:'nikkei',  name:'Nikkei Asia', zh:'日经亚洲',    tier:'record',  cat:'world', w:0.90, pay:true,  url:'https://asia.nikkei.com/rss/feed/nar'},
  {id:'nyt-t',   name:'NYT',         zh:'纽约时报',    tier:'record',  cat:'tech',  w:0.93, pay:true,  url:'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml'},

  // ——— 财经专业 ———
  {id:'bbg-m',   name:'Bloomberg',   zh:'彭博社',      tier:'finance', cat:'biz',   w:0.97, pay:true,  url:GN('site:bloomberg.com when:1d')},
  {id:'bbg-t',   name:'Bloomberg',   zh:'彭博社',      tier:'finance', cat:'tech',  w:0.97, pay:true,  url:GN('site:bloomberg.com (technology OR AI OR chips) when:1d')},
  {id:'wsj-m',   name:'WSJ',         zh:'华尔街日报',  tier:'finance', cat:'biz',   w:0.96, pay:true,  url:'https://feeds.a.dj.com/rss/RSSMarketsMain.xml'},
  {id:'nyt-b',   name:'NYT',         zh:'纽约时报',    tier:'finance', cat:'biz',   w:0.93, pay:true,  url:'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml'},
  {id:'econ',    name:'Economist',   zh:'经济学人',    tier:'finance', cat:'biz',   w:0.92, pay:true,  url:'https://www.economist.com/latest/rss.xml'},
  {id:'cnbc',    name:'CNBC',        zh:'CNBC',        tier:'finance', cat:'biz',   w:0.85, pay:false, url:'https://www.cnbc.com/id/100727362/device/rss/rss.html'},
  {id:'mw',      name:'MarketWatch', zh:'MarketWatch', tier:'finance', cat:'biz',   w:0.82, pay:false, url:'https://feeds.content.dowjones.io/public/rss/mw_topstories'},

  // ——— 非英美视角 ———
  {id:'aje',     name:'Al Jazeera',  zh:'半岛电视台',  tier:'intl',    cat:'world', w:0.88, pay:false, url:'https://www.aljazeera.com/xml/rss/all.xml'},
  {id:'bbc',     name:'BBC',         zh:'BBC',         tier:'intl',    cat:'world', w:0.90, pay:false, url:'https://feeds.bbci.co.uk/news/world/rss.xml'},
  {id:'dw',      name:'DW',          zh:'德国之声',    tier:'intl',    cat:'world', w:0.85, pay:false, url:'https://rss.dw.com/rdf/rss-en-world'},
  {id:'f24',     name:'France 24',   zh:'法国24台',    tier:'intl',    cat:'world', w:0.84, pay:false, url:'https://www.france24.com/en/rss'},

  // ——— 科技 ———
  {id:'ars',     name:'Ars Technica',zh:'Ars Technica',tier:'tech',    cat:'tech',  w:0.80, pay:false, url:'https://feeds.arstechnica.com/arstechnica/index'},
  {id:'verge',   name:'The Verge',   zh:'The Verge',   tier:'tech',    cat:'tech',  w:0.78, pay:false, url:'https://www.theverge.com/rss/index.xml'},
  {id:'tc',      name:'TechCrunch',  zh:'TechCrunch',  tier:'tech',    cat:'tech',  w:0.76, pay:false, url:'https://techcrunch.com/feed/'},
];

const MAX_STORIES   = 60;
const TRANSLATE_TOP = 60;

/* ============================================================
   抓取与解析（Node 里没有 DOMParser，用正则解析 RSS/Atom）
   ============================================================ */
const UA = 'Mozilla/5.0 (compatible; WorldPulseBot/1.0; +https://github.com/)';

function decodeEntities(s){
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_,d)=>String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_,h)=>String.fromCharCode(parseInt(h,16)))
    .replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&nbsp;/g,' ')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
    .replace(/\s+/g,' ').trim();
}
const tagOf = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(m[1]) : '';
};
function linkOf(block){
  const href = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  if(href) return href[1];
  return tagOf(block, 'link');
}

export function parseFeed(xml, isGoogleNews = false){
  const out = [];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  for(const b of blocks){
    let title = tagOf(b,'title');
    if(!title) continue;
    // 仅 Google News 检索结果的标题末尾会带 " - 来源名"，去掉；其它源原样保留
    if(isGoogleNews) title = title.replace(/\s+-\s+[^-]{2,32}$/, '').trim();
    const dRaw = tagOf(b,'pubDate') || tagOf(b,'published') || tagOf(b,'updated') || tagOf(b,'date');
    const ts = Date.parse(dRaw);
    out.push({ title, link: linkOf(b), ts: Number.isFinite(ts) ? ts : Date.now() });
  }
  return out;
}

async function fetchSource(s){
  for(let attempt = 0; attempt < 2; attempt++){
    try{
      const ctl = new AbortController();
      const t = setTimeout(()=>ctl.abort(), 20000);
      const res = await fetch(s.url, {signal: ctl.signal, headers:{'User-Agent':UA, 'Accept':'application/rss+xml, application/xml, text/xml, */*'}});
      clearTimeout(t);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const xml = await res.text();
      let items = parseFeed(xml, s.url.includes('news.google.com'))
        .filter(i => i.title.length > 14)
        .filter(i => Date.now() - i.ts < 60*60*1000*36)   // 只要 36 小时内的
        .slice(0, 30);
      if(!items.length) throw new Error('no fresh items');
      console.log(`  ok   ${s.id.padEnd(11)} ${String(items.length).padStart(3)} 条  ${s.name}`);
      return {items: items.map(i => ({...i, sid:s.id})), stat:{id:s.id, name:s.name, zh:s.zh, tier:s.tier, ok:true, n:items.length}};
    }catch(e){
      if(attempt === 1){
        const err = (e && e.message) || String(e);
        console.log(`  FAIL ${s.id.padEnd(11)} ${err}   ${s.name}`);
        return {items: [], stat:{id:s.id, name:s.name, zh:s.zh, tier:s.tier, ok:false, err}};
      }
      await new Promise(r=>setTimeout(r, 1500));
    }
  }
}

/* ============================================================
   聚类：同一事件被 N 家独立媒体报道 = 交叉证实
   ============================================================ */
const STOP = new Set(('the a an and or but of in on at to for from with by as is are was were be been being this that these those '+
  'it its his her their our your my he she they we you i not no than then over under after before about into out up down new news '+
  'says say said will would can could may might more most other some such only own same so too very just report reports '+
  'first last year years day days week month latest live update updates video watch photos analysis opinion how why what when who '+
  'amid during against between across among here there will also more').split(/\s+/));

function tokens(title){
  const words = title.replace(/[’'`]/g,'').replace(/[^A-Za-z0-9]+/g,' ').split(/\s+/).filter(Boolean);
  const set = new Set(), ents = new Set();
  words.forEach((w,i)=>{
    const lw = w.toLowerCase();
    if(lw.length < 4 || STOP.has(lw)) return;
    set.add(lw);
    if(i > 0 && /^[A-Z]/.test(w)) ents.add(lw);
  });
  return {set, ents};
}
const jaccard = (a,b) => {
  if(!a.size || !b.size) return 0;
  let n = 0; for(const v of a) if(b.has(v)) n++;
  return n / (a.size + b.size - n);
};
const shared = (a,b) => { let n=0; for(const v of a) if(b.has(v)) n++; return n; };

export function cluster(items){
  const clusters = [];
  for(const it of items){
    const tk = tokens(it.title);
    if(tk.set.size < 2) continue;
    let best = null, bestSim = 0;
    for(const c of clusters){
      const sim = jaccard(tk.set, c.tk.set);
      const se  = shared(tk.ents, c.tk.ents);
      if((sim >= 0.34 || (sim >= 0.22 && se >= 2) || se >= 3) && sim > bestSim){ best = c; bestSim = sim; }
    }
    if(best){
      best.items.push(it);
      if(it.title.length < best.rep.title.length) best.rep = it;
      for(const v of tk.set)  best.tk.set.add(v);
      for(const v of tk.ents) best.tk.ents.add(v);
    }else{
      clusters.push({rep:it, items:[it], tk:{set:new Set(tk.set), ents:new Set(tk.ents)}});
    }
  }
  return clusters;
}

const TIER_BONUS = {wire:1.35, record:1.15, finance:1.10, intl:1.0, tech:0.95};

export function scoreCluster(c, byId){
  const srcs = new Map();
  let bestTier = 'tech';
  const order = ['tech','intl','finance','record','wire'];
  for(const i of c.items){
    const s = byId[i.sid];
    if(!s) continue;
    if(!srcs.has(s.name) || srcs.get(s.name).w < s.w) srcs.set(s.name, s);
    if(order.indexOf(s.tier) > order.indexOf(bestTier)) bestTier = s.tier;
  }
  const list = [...srcs.values()];
  const n = list.length;
  const avgW = list.reduce((a,s)=>a+s.w, 0) / Math.max(1,n);
  const newest = Math.max(...c.items.map(i=>i.ts));
  const hrs = Math.max(0, (Date.now()-newest)/3600000);
  const breadth = 1 + 1.75*Math.log2(n);
  const catTally = {};
  for(const i of c.items){ const s = byId[i.sid]; if(s) catTally[s.cat] = (catTally[s.cat]||0) + s.w; }
  const cats = Object.entries(catTally).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
  return {
    n, newest, cats, cat: cats[0] || 'world', topTier: bestTier,
    srcs: list.map(s=>({name:s.name, zh:s.zh, tier:s.tier, pay:s.pay})),
    v: breadth * avgW * TIER_BONUS[bestTier] * (0.35 + 0.65*Math.exp(-hrs/10)),
  };
}

/* ============================================================
   翻译（在 GitHub 的服务器上跑，直连 Google，无需代理）
   ============================================================ */
async function translate(text){
  const routes = [
    async()=>{
      const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`, {headers:{'User-Agent':UA}});
      const j = await r.json();
      return j[0].map(x=>x[0]).join('');
    },
    async()=>{
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`);
      const j = await r.json();
      const t = j?.responseData?.translatedText;
      if(!t || /MYMEMORY WARNING|INVALID/i.test(t)) throw new Error('mm');
      return t;
    },
  ];
  for(const go of routes){
    try{
      const out = await go();
      if(out && /[一-龥]/.test(out)) return out.trim();
    }catch(e){}
  }
  return null;
}

async function translateAll(stories){
  const queue = stories.slice(0, TRANSLATE_TOP);
  let done = 0;
  const worker = async () => {
    while(queue.length){
      const s = queue.shift();
      s.zh = await translate(s.en);
      done++;
    }
  };
  await Promise.all(Array.from({length:4}, worker));
  console.log(`翻译完成 ${stories.filter(s=>s.zh).length}/${done}`);
}

/* ============================================================
   主流程
   ============================================================ */
async function main(){
  console.log(`抓取 ${SOURCES.length} 个信源…`);
  const results = await Promise.all(SOURCES.map(fetchSource));
  const items = results.flatMap(r => r.items);
  const stats = results.map(r => r.stat);
  const okN = stats.filter(s=>s.ok).length;
  console.log(`\n信源可用 ${okN}/${SOURCES.length}，条目 ${items.length}`);

  if(!okN) { console.error('所有信源都失败了，不覆盖 data.json'); process.exit(1); }

  const byId = Object.fromEntries(SOURCES.map(s=>[s.id, s]));
  const clusters = cluster(items);
  console.log(`聚类得到 ${clusters.length} 个事件`);

  const stories = clusters.map(c => {
    const s = scoreCluster(c, byId);
    return {en:c.rep.title, zh:null, link:c.rep.link, ...s};
  }).sort((a,b)=>b.v-a.v).slice(0, MAX_STORIES);

  const verified = stories.filter(s=>s.n>=2).length;
  console.log(`多源交叉证实 ${verified} 条；开始翻译…`);
  await translateAll(stories);

  const payload = {
    updatedAt: Date.now(),
    sourceTotal: SOURCES.length,
    sourceOk: okN,
    sources: stats,
    stories,
  };
  writeFileSync('data.json', JSON.stringify(payload));
  console.log(`\n已写出 data.json：${stories.length} 条事件，其中 ${verified} 条经多家媒体证实`);
}

if(import.meta.url === `file://${process.argv[1]}`) main();
