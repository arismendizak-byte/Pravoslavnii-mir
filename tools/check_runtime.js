#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

function jsonFetch(baseDir) {
  return async function(input) {
    const url = new URL(String(input));
    const rel = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const target = path.resolve(ROOT, rel);
    if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return {ok:false,status:404,json:async()=>null};
    }
    return {ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(target,'utf8').replace(/^\uFEFF/,'')),arrayBuffer:async()=>{const b=fs.readFileSync(target);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}};
  };
}

function browserContext(page, layerUrl) {
  const fetch = jsonFetch(ROOT);
  const storageData = new Map();
  const localStorage = {
    getItem:key=>storageData.has(String(key))?storageData.get(String(key)):null,
    setItem:(key,value)=>{storageData.set(String(key),String(value));},
    removeItem:key=>{storageData.delete(String(key));},
    clear:()=>storageData.clear(),
    key:index=>Array.from(storageData.keys())[index]||null,
    get length(){return storageData.size;}
  };
  const window = {crypto:require('crypto').webcrypto,location:{href:`http://example.test/${page}`}, fetch, URL, localStorage};
  window.window = window;
  const context = {window, globalThis: window, fetch, URL, TextDecoder, console, setTimeout, clearTimeout, localStorage};
  vm.createContext(context);
  if (layerUrl) window[layerUrl.key] = `http://example.test/${layerUrl.value}`;
  return context;
}

function load(context, rel) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), context, {filename: rel});
}

async function checkData() {
  const c = browserContext('index.html');
  c.window.document = {currentScript:{src:'http://example.test/js/data-layer.js'}};
  c.document = c.window.document;
  load(c, 'js/data-layer.js');
  const api = c.window.PravmirData;
  if (!api) throw new Error('PravmirData missing');
  const stats = await api.init();
  if (stats.canonical_places !== 12957 || stats.regions !== 18) throw new Error('PravmirData stats mismatch');
  const rows = await api.search('Троице-Сергиева Лавра', {limit: 5});
  if (!rows.length) throw new Error('PravmirData search failed');
  const migrated = await api.getPlaceById('legacy-spb-1');
  if (!migrated || !migrated.id) throw new Error('PravmirData alias resolution failed');
}

async function checkContent() {
  const c = browserContext('journal.html', {key:'__PRAVMIR_CONTENT_LAYER_URL__', value:'js/content-layer.js'});
  load(c, 'js/content-layer.js');
  const api = c.window.PravmirContent;
  if (!api) throw new Error('PravmirContent missing');
  const stats = await api.init();
  if (stats.content !== 21 || stats.links !== 11) throw new Error('PravmirContent stats mismatch');
  const connected = await api.getLinksFor({kind:'content', id:'pm-content-9f5cac3be0e95d1aeb5c'});
  if (connected.length !== 2 || !connected.some(x => x.to && x.to.kind === 'place') || !connected.some(x => x.to && x.to.kind === 'entity')) throw new Error('PravmirContent typed links failed');
  const article = await api.getContentBySlug('article-1');
  if (!article || article.content_type !== 'article') throw new Error('PravmirContent lookup failed');
  const pilgrim = await api.getPilgrimServices({limit: 200});
  if (pilgrim.length !== 85 || pilgrim.some(x => x.verification_status !== 'legacy_unverified')) {
    throw new Error('PravmirContent pilgrim services boundary failed');
  }
}

function checkComponents() {
  function contextFor(pathname, hash = '') {
    const window = {crypto:require('crypto').webcrypto,location:{pathname,hash}};
    const document = {addEventListener:()=>{}};
    const c = {window,document,console};
    window.window=window;
    vm.createContext(c);
    load(c,'js/config.js');
    load(c,'js/components.js');
    return c;
  }
  const route = contextFor('/routes/route.html');
  if (route.getPath('routes/routes.html') !== '../routes/routes.html') throw new Error('nested navigation path failed');
  if (!route.isCurrentItem('routes/routes.html')) throw new Error('nested bottom navigation active state failed');
  const food = contextFor('/food/recipe.html');
  if (food.getPath('food.html') !== '../food.html') throw new Error('food navigation path failed');
  if (!food.isCurrentItem('catalog/catalog.html')) throw new Error('food explore navigation group failed');
  const news = contextFor('/news.html');
  if (!news.isCurrentItem('catalog/catalog.html')) throw new Error('news Explore navigation group failed');
  const pilgrim = contextFor('/pilgrim/infrastructure.html');
  if (pilgrim.getPath('routes/routes.html') !== '../routes/routes.html') throw new Error('pilgrim navigation path failed');
  if (!pilgrim.isCurrentItem('routes/routes.html')) throw new Error('pilgrim navigation group failed');
  const today = contextFor('/preview/index.html');
  if (!today.isCurrentItem('index.html') || today.isCurrentItem('index.html#map')) throw new Error('Today navigation state failed');
  today.window.location.hash = '#map';
  if (today.isCurrentItem('index.html') || !today.isCurrentItem('index.html#map')) throw new Error('Nearby navigation state failed');
  const config = today.window.CONFIG;
  if (config.menuItems.top.length !== 5 || config.menuItems.bottom.length !== 5) throw new Error('five primary sections required');
  const bottom = today.buildBottomNav(), nav = today.buildNav();
  if ((bottom.match(/bottom-nav-icon/g)||[]).length !== 5 || (bottom.match(/<svg/g)||[]).length !== 5) throw new Error('bottom SVG navigation failed');
  if (!nav.includes('aria-expanded="false"') || !nav.includes('class="skip-link"') || !nav.includes('id="mobileMenu" hidden')) throw new Error('accessible menu markup failed');
  for (const item of config.menuItems.top.concat(config.menuItems.secondary)) {
    const target = path.join(ROOT, item.url.split(/[?#]/)[0]);
    if (!fs.existsSync(target)) throw new Error('shared navigation target missing: '+item.url);
  }

  // Small DOM stand-in: exercise the actual disclosure handler, not a second implementation.
  const handlers = {}, windowHandlers = {};
  const document = {
    activeElement:null,
    addEventListener:(name,fn)=>{(handlers[name] ||= []).push(fn);},
    querySelectorAll:()=>[],
  };
  function element(id) {
    const attrs = {}, classes = new Set(), events = {};
    return {id,hidden:false,
      classList:{contains:x=>classes.has(x),toggle:(x,on)=>{const value=on===undefined?!classes.has(x):on;if(value)classes.add(x);else classes.delete(x);},remove:x=>classes.delete(x)},
      setAttribute:(k,v)=>{attrs[k]=v;},getAttribute:k=>attrs[k],removeAttribute:k=>{delete attrs[k];},
      addEventListener:(name,fn)=>{events[name]=fn;},fire:name=>events[name](),
      focus(){document.activeElement=this;},contains(target){return target===this;},getClientRects:()=>[{}]
    };
  }
  const burger=element('burgerBtn'), menu=element('mobileMenu'), overlay=element('mobileOverlay');
  const first=element('first'), last=element('last'), main=element('domainMain'), skip=element('skip');
  menu.hidden=true;menu.querySelector=()=>first;menu.querySelectorAll=()=>[first,last];
  const nodes={burgerBtn:burger,mobileMenu:menu,mobileOverlay:overlay};
  document.body=element('body');document.getElementById=id=>nodes[id]||null;
  document.querySelector=selector=>selector==='main, .page-section, .hero'?main:selector==='.skip-link'?skip:null;
  const window={location:{pathname:'/index.html',hash:''},addEventListener:(name,fn)=>{windowHandlers[name]=fn;}};
  window.window=window;
  const c={window,document,console};vm.createContext(c);load(c,'js/config.js');load(c,'js/components.js');
  handlers.DOMContentLoaded.forEach(fn=>fn());
  if(main.id!=='domainMain'||skip.href!=='#domainMain')throw new Error('skip link must preserve existing domain main ID');
  burger.fire('click');
  if(menu.hidden||burger.getAttribute('aria-expanded')!=='true'||document.activeElement!==first||!document.body.classList.contains('menu-open'))throw new Error('menu open/focus failed');
  last.focus();handlers.keydown.forEach(fn=>fn({key:'Tab',shiftKey:false,preventDefault(){}}));
  if(document.activeElement!==burger)throw new Error('menu focus containment failed');
  handlers.keydown.forEach(fn=>fn({key:'Escape',preventDefault(){}}));
  if(!menu.hidden||burger.getAttribute('aria-expanded')!=='false'||document.activeElement!==burger||document.body.classList.contains('menu-open'))throw new Error('menu Escape/restore failed');
  burger.fire('click');overlay.fire('click');if(!menu.hidden)throw new Error('menu overlay close failed');
}

async function checkLiturgical() {
  const c = browserContext('calendar.html', {key:'__PRAVMIR_LITURGICAL_LAYER_URL__', value:'js/liturgical-layer.js'});
  load(c, 'js/liturgical-layer.js');
  const api = c.window.PravmirLiturgical;
  if (!api) throw new Error('PravmirLiturgical missing');
  const stats = await api.init();
  if (stats.calendar_day !== 365 || stats.fasting_rule !== 4 || stats.reading !== 48) throw new Error('PravmirLiturgical stats mismatch');
  const easter = await api.getDayBundle('2026-04-12');
  if (!easter || !easter.items.some(x => x.kind === 'feast')) throw new Error('PravmirLiturgical day lookup failed');
  const easterReadings = easter.items.filter(x => x.kind === 'reading');
  if (easterReadings.length !== 3 || easterReadings.some(x => x.item.verification_status !== 'editorial_verified' || x.item.text_ref)) throw new Error('v1.22 editorial reading contract failed');
  const theophany = await api.getDayBundle('2026-01-19');
  if (theophany.items.filter(x => x.kind === 'reading').length !== 5) throw new Error('v1.22 reading day coverage failed');
}

async function checkEvents() {
  const c = browserContext('events.html', {key:'__PRAVMIR_EVENT_LAYER_URL__', value:'js/event-layer.js'});
  load(c, 'js/event-layer.js');
  const api = c.window.PravmirEvents;
  if (!api) throw new Error('PravmirEvents missing');
  const stats = await api.init();
  if (typeof stats.events !== 'number' || typeof stats.review_queue !== 'number') throw new Error('PravmirEvents stats invalid');
  const rows = await api.getEvents({limit: 10});
  if (!Array.isArray(rows)) throw new Error('PravmirEvents list failed');
}



async function checkPilgrim() {
  const c = browserContext('pilgrim/infrastructure.html', {key:'__PRAVMIR_PILGRIM_LAYER_URL__', value:'js/pilgrim-layer.js'});
  load(c, 'js/pilgrim-layer.js');
  const api = c.window.PravmirPilgrim;
  if (!api || api.version !== '1.27.0') throw new Error('PravmirPilgrim missing/version mismatch');
  const stats = await api.init();
  if (stats.amenity_types !== 12 || stats.amenities !== 2 || stats.services !== 2 || stats.relations !== 4 || stats.review_queue !== 85 || stats.conflicts !== 1 || stats.rejected !== 0) {
    throw new Error('PravmirPilgrim M5.6.2 counts mismatch');
  }
  const types = await api.getAmenityTypes();
  if (types.length !== 12 || !types.some(x => x.key === 'accommodation') || types.some(x => x.verification_status !== 'system_defined')) {
    throw new Error('PravmirPilgrim amenity taxonomy failed');
  }
  const amenities = await api.getAmenities({limit:20});
  const services = await api.getServices({limit:20});
  if (amenities.length !== 2 || services.length !== 2 || amenities.concat(services).some(x => x.verification_status !== 'source_verified' || !x.freshness || x.freshness.verified_at !== '2026-10-04')) {
    throw new Error('PravmirPilgrim source-verified canonical records failed');
  }
  if ((await api.getAmenities({type:'accommodation',status:'available',limit:20})).length !== 2 || (await api.getAmenities({q:'Дом паломника',limit:20})).length !== 1 || (await api.getServices({type:'pilgrimage_trip',status:'available',limit:20})).length !== 1) {
    throw new Error('PravmirPilgrim discovery filters failed');
  }
  const review = await api.getReviewQueue({limit:200});
  const promoted = review.filter(x => x.review_status === 'promoted');
  const pending = review.filter(x => x.review_status === 'needs_evidence');
  if (review.length !== 85 || promoted.length !== 2 || pending.length !== 83 || promoted.some(x => (x.candidate_refs||[]).length !== 1 || !(x.evidence||[]).length) || pending.some(x => (x.candidate_refs||[]).length || (x.evidence||[]).length)) {
    throw new Error('PravmirPilgrim evidence-gated legacy promotion failed');
  }
  const conflicts = await api.getConflicts();
  if (conflicts.length !== 1 || conflicts[0].resolution_status !== 'unresolved' || (conflicts[0].values||[]).length !== 2) throw new Error('PravmirPilgrim conflict preservation failed');
  const lavra = await api.getForPlace('pm-9e8bc6fff182514f91cf1739e41d2839');
  const berluki = await api.getForPlace('pm-364155d04b9c5e14b86956cd81e950c0');
  if (lavra.length !== 3 || berluki.length !== 1) throw new Error('PravmirPilgrim explicit place binding failed');
  const hit = await api.getReviewQueue({q:'Сретенского',limit:20});
  if (!hit.length || !hit.some(x => String(x.name).includes('Сретенского'))) throw new Error('PravmirPilgrim review search failed');
  const regions = await api.getReviewRegions();
  if (!regions.includes('Москва')) throw new Error('PravmirPilgrim review region index failed');
  const noPlaceFacts = await api.getForPlace('pm-place-does-not-exist');
  if (noPlaceFacts.length !== 0) throw new Error('PravmirPilgrim must not infer place relations');
  const trust = await api.getTrustSummary();
  if (trust.canonical_records !== 4 || trust.promoted_review !== 2 || trust.pending_review !== 83 || trust.unresolved_conflicts !== 1 || trust.explicit_place_relations !== 4 || trust.direct_route_relations !== 0 || trust.organisation_relations !== 0) {
    throw new Error('PravmirPilgrim M5.6 domain trust summary failed');
  }
  const noDirectRouteFacts = await api.getForRoute('pm-route-b26a02228cbb5a023d02f37e');
  if (noDirectRouteFacts.length !== 0) throw new Error('PravmirPilgrim route discovery must not persist inferred route relations');
  const canonicalLegacyLeak = (await api.getAmenities({q:'Сретенского',limit:20})).length + (await api.getServices({q:'Сретенского',limit:20})).length;
  if (canonicalLegacyLeak !== 0) throw new Error('PravmirPilgrim canonical search leaked legacy review data');
  for (const item of amenities.concat(services)) {
    const url = api.getDetailUrl(item);
    if (!url || !url.includes('/pilgrim/item.html?slug=')) throw new Error('PravmirPilgrim canonical deep link failed');
  }
}


async function checkNews() {
  const c=browserContext('news.html',{key:'__PRAVMIR_NEWS_LAYER_URL__',value:'js/news-layer.js'}); load(c,'js/news-layer.js'); const api=c.window.PravmirNews;
  if(!api||api.version!=='1.31.0') throw new Error('PravmirNews missing/version mismatch');
  const stats=await api.init();
  if(stats.sources!==2||stats.news!==4||stats.relations!==1||stats.review_queue!==5||stats.rejected!==0) throw new Error('PravmirNews M5.7.4 counts mismatch');
  const sources=await api.getSources();
  if(sources.length!==2||!sources.some(x=>x.mode==='canonical_source'&&x.provider==='pravmir-editorial-patriarchia-verification-2026-10-05')||!sources.some(x=>x.mode==='review_only'&&x.provider==='pravmir-legacy-journalpp')) throw new Error('PravmirNews source trust topology failed');
  const news=await api.getNews({limit:20});
  if(news.length!==4||news.some(x=>x.verification_status!=='source_verified'||x.publisher!=='Патриархия.ru')) throw new Error('PravmirNews canonical ingestion failed');
  if(news[0].published_at!=='2026-10-04T16:43:00+03:00'||news[3].published_at!=='2026-09-24T18:17:00+03:00') throw new Error('PravmirNews temporal ordering failed');
  const bySlug=await api.getBySlug(news[0].slug);
  if(!bySlug||bySlug.id!==news[0].id||!api.getDetailUrl(news[0]).includes('/news/item.html?slug=')) throw new Error('PravmirNews canonical deep link failed');
  const review=await api.getReviewQueue({limit:20});
  if(review.length!==5||review.some(x=>x.verification_status!=='legacy_unverified'||x.review_status!=='needs_source_verification'||!x.legacy_content_ref)) throw new Error('PravmirNews legacy review preservation failed');
  const related=await api.getRelatedNews({kind:'place',id:'pm-9e8bc6fff182514f91cf1739e41d2839'});
  if(related.length!==1||related[0].id!=='pm-news-ef682c7d0480fa129507') throw new Error('PravmirNews explicit reverse relation failed');
  if((await api.getRelatedNews({kind:'place',id:'pm-not-a-place'})).length!==0) throw new Error('PravmirNews inferred relation leak');
  const sameDay=await api.getForDate('2026-10-04',{limit:5});
  if(sameDay.mode!=='same_day'||sameDay.news.length!==3||sameDay.news.some(x=>String(x.published_at).slice(0,10)!=='2026-10-04')) throw new Error('PravmirNews same-day Daily selection failed');
  const fallback=await api.getForDate('2026-10-05',{limit:3});
  if(fallback.mode!=='latest_before'||fallback.news.length!==3||fallback.news.some(x=>x.verification_status!=='source_verified')) throw new Error('PravmirNews latest-before Daily fallback failed');
  const beforeCoverage=await api.getForDate('2026-09-23',{limit:3});
  if(beforeCoverage.mode!=='none'||beforeCoverage.news.length!==0) throw new Error('PravmirNews pre-coverage Daily state failed');
  const trust=await api.getTrustSummary();
  if(trust.canonical_news!==4||trust.source_verified_news!==4||trust.legacy_review_items!==5||trust.explicit_relations!==1||trust.inferred_relations!==0||trust.organisation_entities!==0||trust.relation_topology['news→place:about_place']!==1) throw new Error('PravmirNews domain trust summary failed');
}


async function checkLibrary() {
  const c=browserContext('library.html',{key:'__PRAVMIR_LIBRARY_LAYER_URL__',value:'js/library-layer.js'}); load(c,'js/library-layer.js'); const api=c.window.PravmirLibrary;
  if(!api||api.version!=='1.43.0') throw new Error('PravmirLibrary missing/version mismatch');
  const stats=await api.init();
  if(stats.sources!==4||stats.rights_policies!==7||stats.authors!==11||stats.works!==39||stats.editions!==38||stats.scripture_references!==48||stats.text_assets!==24||stats.media_assets!==2||stats.relations!==107||stats.review_queue!==0||stats.rejected!==0) throw new Error('PravmirLibrary M5.10.5 counts mismatch');
  const matthew=await api.getAuthorBySlug('matthew'),matthewWorks=matthew?await api.getWorksForAuthor(matthew.id):[];
  if(!matthew||matthew.slug!=='matthew'||matthewWorks.length!==1||matthewWorks[0].id!=='pm-work-ead539b807952476ceab') throw new Error('Library author canonical traversal failed');
  const rights=await api.getRightsPolicies();
  if(rights.length!==7||!rights.some(x=>x.key==='public_domain_verified'&&x.local_text_allowed===true)||!rights.some(x=>x.key==='metadata_only'&&x.local_text_allowed===false)||rights.some(x=>x.trust_layer!=='canonical_system'||x.verification_status!=='system_defined')) throw new Error('PravmirLibrary rights policy failed');
  const works=await api.getWorks({limit:100}),authors=await api.getAuthors({limit:100}),editions=await api.getEditions({limit:100}),refs=await api.getScriptureReferences({limit:100});
  if(works.length!==39||authors.length!==11||editions.length!==38||refs.length!==48) throw new Error('PravmirLibrary bibliography load failed');
  const scriptureWorks=works.filter(x=>x.work_type==='scripture');
  if(scriptureWorks.length!==14||scriptureWorks.some(x=>x.rights_status!=='metadata_only'||x.verification_status!=='source_verified')) throw new Error('PravmirLibrary Scripture metadata-only boundary failed');
  const textAssets=await api.getTextAssets(),mediaAssets=await api.getMediaAssets();
  if(textAssets.length!==24||mediaAssets.length!==2) throw new Error('PravmirLibrary rights-cleared asset load failed');
  if(textAssets.some(x=>!String(x.external_url||'').startsWith('https://')||!(x.source_records||[]).some(r=>String(r.rights_evidence_url||'').startsWith('https://')))) throw new Error('PravmirLibrary text provenance boundary failed');
  const localTexts=textAssets.filter(x=>x.storage_mode==='local_text');
  if(localTexts.length!==9||textAssets.filter(x=>x.rights_status==='external_link_only').length!==3)throw new Error('PravmirLibrary local/unresolved rights coverage failed');
  for(const asset of localTexts){const result=await api.getLocalText(asset.id);if(!result||!result.checksum_verified||!result.text.trim()||Buffer.byteLength(result.text,'utf8')!==asset.content_size_bytes||asset.rights_status!=='open_license'||asset.license_url!=='https://creativecommons.org/licenses/by-sa/4.0/')throw new Error('PravmirLibrary local text checksum/license failed');} const legacyLongLocal=localTexts.filter(x=>x.content_size_bytes>5000);if(legacyLongLocal.length!==5)throw new Error('PravmirLibrary v1.40 long-text regression coverage failed');
  if(await api.getLocalText('unknown')!==null||await api.getLocalText(textAssets.find(x=>x.storage_mode==='external_url').id)!==null)throw new Error('PravmirLibrary nonlocal text isolation failed');
  const originalFetch=c.fetch;c.fetch=async url=>String(url).endsWith('.txt')?{ok:true,arrayBuffer:async()=>{const b=Buffer.alloc(localTexts[0].content_size_bytes);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}}:originalFetch(url);
  let corruptRejected=false;try{await api.getLocalText(localTexts[0].id);}catch(e){corruptRejected=/checksum mismatch/.test(e.message);}finally{c.fetch=originalFetch;}
  if(!corruptRejected)throw new Error('PravmirLibrary corrupted local bytes accepted');
  const audio=mediaAssets.find(x=>x.media_kind==='audio'),video=mediaAssets.find(x=>x.media_kind==='video');
  if(!audio||audio.storage_mode!=='external_url'||audio.asset_path!==null||audio.rights_status!=='public_domain_verified'||audio.license_url!=='https://creativecommons.org/publicdomain/zero/1.0/') throw new Error('PravmirLibrary CC0 audio contract failed');
  if(!video||video.storage_mode!=='external_url'||video.asset_path!==null||video.rights_status!=='open_license'||video.license_url!=='https://creativecommons.org/licenses/by-sa/4.0/') throw new Error('PravmirLibrary CC BY-SA video contract failed');
  const sample=refs[0],bridged=await api.getScriptureForReading(sample.reading_ref); if(!bridged||bridged.id!==sample.id||bridged.work_ref!==sample.work_ref) throw new Error('PravmirLibrary reading stable-ID bridge failed');
  const theophan=works.find(x=>x.slug==='work-theophan-thoughts-every-day'); const bundle=await api.getWorkBundle(theophan&&theophan.slug); if(!bundle||bundle.work.id!==theophan.id||bundle.editions.length!==1||bundle.text_assets.length!==1||bundle.media_assets.length!==0||bundle.authors.length!==1) throw new Error('PravmirLibrary rights-cleared work bundle failed');
  const philaret=await api.getAuthorBySlug('philaret-drozdov'),ignatius=await api.getAuthorBySlug('ignatius-brianchaninov'),theophanAuthor=await api.getAuthorBySlug('theophan-the-recluse');
  const philaretWorks=philaret?await api.getWorksForAuthor(philaret.id,{limit:20}):[],ignatiusWorks=ignatius?await api.getWorksForAuthor(ignatius.id,{limit:20}):[],theophanWorks=theophanAuthor?await api.getWorksForAuthor(theophanAuthor.id,{limit:20}):[];
  if(!philaret||!ignatius||!theophanAuthor||philaretWorks.length!==2||ignatiusWorks.length!==4||theophanWorks.length!==7) throw new Error('PravmirLibrary M5.10.1 author/work traversal failed');
  if((await api.getWorks({work_type:'catechesis',limit:20})).length!==3||(await api.getWorks({work_type:'sermon',limit:20})).length!==3||(await api.getWorks({q:'катихизис',limit:20})).length!==1) throw new Error('PravmirLibrary M5.10.1 textual discovery failed');
  if((await api.getWorks({work_type:'prayer',limit:20})).length!==1||(await api.getWorks({work_type:'liturgy',limit:20})).length!==1||(await api.getWorks({work_type:'hymnography',limit:20})).length!==3||(await api.getWorks({work_type:'sermon',limit:20})).length!==3||(await api.getWorks({work_type:'catechesis',limit:20})).length!==3||(await api.getWorks({work_type:'church_history',limit:20})).length!==1) throw new Error('PravmirLibrary M5.10.5 work-type discovery failed');
  const facets=await api.getDiscoveryFacets();
  const availability=Object.fromEntries(facets.availability.map(x=>[x.value,x.count]));
  if(facets.total!==39||availability.local_text!==9||availability.external_text!==15||availability.metadata_only!==15) throw new Error('PravmirLibrary M5.10.6 discovery facets failed');
  if((await api.getWorks({availability:'local_text',limit:100})).length!==9||(await api.getWorks({availability:'external_text',limit:100})).length!==15||(await api.getWorks({availability:'metadata_only',limit:100})).length!==15||(await api.getWorks({rights_status:'public_domain_verified',limit:100})).length!==22) throw new Error('PravmirLibrary M5.10.6 discovery filters failed');
  const theophanBundle=await api.getAuthorBundle('theophan-the-recluse');
  if(!theophanBundle||theophanBundle.works.length!==7||theophanBundle.author.id!==theophanAuthor.id) throw new Error('PravmirLibrary M5.10.6 author page bundle failed');
  const relatedByAuthor=await api.getRelatedWorksForWork(theophanWorks[0].id,{limit:20});
  if(relatedByAuthor.length!==6||relatedByAuthor.some(x=>x.id===theophanWorks[0].id)) throw new Error('PravmirLibrary M5.10.6 explicit-author related works failed');
  const matthewRefs=await api.getReadingsForWork('scripture-gospel-matthew',{limit:100});
  if(!matthewRefs.length||matthewRefs.some(x=>x.work_ref!=='pm-work-ead539b807952476ceab')) throw new Error('PravmirLibrary M5.10.6 work→calendar traversal failed');
  const authorFiltered=await api.getWorks({author_ref:theophanAuthor.id,q:'Феофан',limit:20});
  if(authorFiltered.length!==7) throw new Error('PravmirLibrary M5.10.6 author-aware search failed');
  const hist=(await api.getWorks({work_type:'church_history',limit:20}))[0]; const histBundle=await api.getWorkBundle(hist.slug);
  if(!histBundle||histBundle.work.title!=='История Православной Церкви до начала разделения Церквей'||histBundle.text_assets.length!==1||histBundle.text_assets[0].storage_mode!=='external_url'||histBundle.text_assets[0].rights_status!=='open_license') throw new Error('PravmirLibrary M5.10.5 church-history bundle failed');
  const catech=(await api.getWorks({work_type:'catechesis',limit:20})).find(x=>x.slug==='work-philaret-longer-catechism'); const catechBundle=await api.getWorkBundle(catech.slug);
  if(!catechBundle||catechBundle.work.rights_status!=='public_domain_verified'||catechBundle.text_assets[0].rights_status!=='external_link_only'||!['source_verified','rights_verified'].includes(catechBundle.text_assets[0].verification_status)) throw new Error('PravmirLibrary M5.10.5 catechism rights correction failed');
  const prayerBundle=await api.getWorkBundle('work-lord-prayer-19c'),creedBundle=await api.getWorkBundle('work-nicene-creed-tolstoy-1875');if(!prayerBundle||!creedBundle||prayerBundle.authors.length!==0||creedBundle.authors.length!==0||prayerBundle.text_assets.length!==1||creedBundle.text_assets.length!==1||prayerBundle.text_assets[0].storage_mode!=='local_text'||creedBundle.text_assets[0].storage_mode!=='local_text')throw new Error('PravmirLibrary anonymous/traditional work bundle failed');
  const hymn=works.find(x=>x.slug==='work-bogorodice-devo-znamenny'); const hymnBundle=await api.getWorkBundle(hymn&&hymn.slug); if(!hymnBundle||hymnBundle.media_assets.length!==1||hymnBundle.media_assets[0].media_kind!=='audio') throw new Error('PravmirLibrary media work bundle failed');
  const rels=await api.getRelations({limit:200}); const authored=new Set(rels.filter(x=>x.relation_type==='author_attribution').map(x=>x.from.id)); const acts=works.filter(x=>x.title==='Деяния святых Апостолов'),hebrews=works.filter(x=>x.title==='Послание к Евреям');
  const topology=Object.fromEntries(['author_attribution','scripture_citation_of','full_text_of','recording_of','depicts_feast','life_of'].map(k=>[k,rels.filter(x=>x.relation_type===k).length]));
  if(acts.length!==1||hebrews.length!==1||authored.has(acts[0].id)||authored.has(hebrews[0].id)||topology.author_attribution!==27||topology.scripture_citation_of!==48||topology.full_text_of!==24||topology.recording_of!==1||topology.depicts_feast!==1||topology.life_of!==6) throw new Error('PravmirLibrary explicit relation topology failed');
  const feastRel=rels.find(x=>x.relation_type==='depicts_feast'); if(!feastRel||!feastRel.to||feastRel.to.kind!=='feast'||feastRel.to.id!=='pm-feast-0d16d133b2183b48ebb6'||feastRel.verification_status!=='rights_verified') throw new Error('PravmirLibrary explicit feast relation failed');
  const trust=await api.getTrustSummary();
  if(trust.rights_policies!==7||trust.canonical_works!==39||trust.canonical_authors!==11||trust.editions!==38||trust.scripture_references!==48||trust.text_assets!==24||trust.media_assets!==2||trust.relations!==107||trust.rights_cleared_text_assets!==21||trust.rights_cleared_media_assets!==2||trust.local_text_assets!==9||trust.local_media_assets!==0||trust.full_protected_texts_copied!==0||trust.unlicensed_local_assets!==0||trust.inferred_relations!==0||trust.organisation_entities!==0) throw new Error('PravmirLibrary copyright/trust summary failed');
  if((await api.getMediaAssets({media_kind:'audio'})).length!==1||(await api.getTextAssets({work_ref:theophan.id})).length!==1||(await api.getRelations({relation_type:'depicts_feast'})).length!==1) throw new Error('PravmirLibrary filtered runtime API failed');
  const reverseFeast=await api.getRelatedForTarget('feast','pm-feast-0d16d133b2183b48ebb6'); if(reverseFeast.length!==1||reverseFeast[0].relation_type!=='depicts_feast'||reverseFeast[0].from.kind!=='media_asset'||reverseFeast[0].from.id!==video.id) throw new Error('PravmirLibrary reverse relation gate failed');
  const seraphimLives=await api.getLivesForSaint('pm-saint-4efbfd490a4731dd4707'),methodiusLives=await api.getLivesForSaint('pm-saint-d65fcc88a283729e7147'),annaLives=await api.getLivesForSaint('pm-saint-4db1cd8508af04e95c6d'); if(seraphimLives.length!==1||seraphimLives[0].work_type!=='life'||methodiusLives.length!==1||annaLives.length!==0) throw new Error('PravmirLibrary M5.10.2 saint→life traversal failed');
  const lifeBundle=await api.getWorkBundle(seraphimLives[0].slug); if(!lifeBundle||lifeBundle.text_assets.length!==1||lifeBundle.related_saints.length!==1||lifeBundle.related_saints[0].id!=='pm-saint-4efbfd490a4731dd4707') throw new Error('PravmirLibrary life work bundle failed');
  if((await api.getWorkBySlug('not-present'))!==null||!api.getDetailUrl(null).endsWith('/library.html')) throw new Error('PravmirLibrary lookup/deep-link fallback failed');
}

async function checkToday() {
  const c = browserContext('index.html', {key:'__PRAVMIR_LITURGICAL_LAYER_URL__', value:'js/liturgical-layer.js'});
  load(c, 'js/liturgical-layer.js');
  c.window.__PRAVMIR_CONTENT_LAYER_URL__ = 'http://example.test/js/content-layer.js';
  c.window.__PRAVMIR_EVENT_LAYER_URL__ = 'http://example.test/js/event-layer.js';
  c.window.__PRAVMIR_FOOD_LAYER_URL__ = 'http://example.test/js/food-layer.js';
  c.window.__PRAVMIR_NEWS_LAYER_URL__ = 'http://example.test/js/news-layer.js';
  c.window.__PRAVMIR_LIBRARY_LAYER_URL__ = 'http://example.test/js/library-layer.js';
  load(c, 'js/content-layer.js');
  load(c, 'js/event-layer.js');
  load(c, 'js/food-layer.js');
  load(c, 'js/news-layer.js');
  load(c, 'js/library-layer.js');
  load(c, 'js/today-layer.js');
  const api = c.window.PravmirToday;
  if (!api || api.version !== '1.43.0') throw new Error('PravmirToday missing/version mismatch');
  const easter = await api.getSnapshot('2026-04-12');
  if (easter.readings.length !== 3 || easter.reading_library.length !== 3 || easter.food.recipes.length < 2 || easter.events.length !== 0) throw new Error('PravmirToday Easter composition failed');
  if (!easter.trust.reading_library_uses_stable_ids || easter.reading_library.some(x=>!x.work||x.work.id!==x.scripture_reference.work_ref)) throw new Error('PravmirToday Library stable-ID bridge failed');
  const theophany = await api.getSnapshot('2026-01-19');
  if (theophany.related_media.length !== 1 || theophany.related_media[0].media.id !== 'pm-media-0c70a4f711b96258f8d7' || theophany.related_media[0].relation.relation_type !== 'depicts_feast') throw new Error('PravmirToday feast media relation failed');
  if (!theophany.trust.library_media_rights_verified) throw new Error('PravmirToday media rights trust flag missing');
  const seraphimDay=await api.getSnapshot('2026-08-01');
  if(!seraphimDay.saint_library||seraphimDay.saint_library.length!==1||seraphimDay.saint_library[0].saint_ref!=='pm-saint-4efbfd490a4731dd4707'||seraphimDay.saint_library[0].work.work_type!=='life'||seraphimDay.saint_library[0].relation.relation_type!=='life_of') throw new Error('PravmirToday saint→life integration failed');
  if(!seraphimDay.trust.saint_library_uses_explicit_life_of) throw new Error('PravmirToday saint→life trust flag missing');
  if (easter.content_mode !== 'related' || !easter.related_content.length) throw new Error('PravmirToday explicit content relation failed');
  if (easter.news_mode !== 'none' || easter.news.length !== 0) throw new Error('PravmirToday must not backfill News from the future');
  const ordinary = await api.getSnapshot('2026-10-04');
  if (ordinary.content_mode !== 'latest' || !ordinary.latest_content.length) throw new Error('PravmirToday honest journal fallback failed');
  if (!ordinary.next_reading || ordinary.next_reading.date !== '2026-10-14') throw new Error('PravmirToday reading coverage fallback failed');
  if (ordinary.events.length !== 0) throw new Error('PravmirToday review/demo event leak');
  if (ordinary.news_mode !== 'same_day' || ordinary.news.length !== 3 || ordinary.news.some(x=>x.verification_status!=='source_verified')) throw new Error('PravmirToday canonical same-day News integration failed');
  if (!ordinary.trust.news_are_canonical_only || !ordinary.trust.news_legacy_review_excluded) throw new Error('PravmirToday News trust flags failed');
  const fallback = await api.getSnapshot('2026-10-05');
  if (fallback.news_mode !== 'latest_before' || fallback.news.length !== 3 || fallback.news.some(x=>String(x.published_at).slice(0,10)>='2026-10-05')) throw new Error('PravmirToday canonical News fallback failed');
}

async function checkFood() {
  const c = browserContext('food.html', {key:'__PRAVMIR_LITURGICAL_LAYER_URL__', value:'js/liturgical-layer.js'});
  load(c, 'js/liturgical-layer.js');
  c.window.__PRAVMIR_FOOD_LAYER_URL__ = 'http://example.test/js/food-layer.js';
  load(c, 'js/food-layer.js');
  const api = c.window.PravmirFood;
  if (!api) throw new Error('PravmirFood missing');
  const stats = await api.init();
  if (stats.recipes !== 9 || stats.relations !== 27 || stats.feasts_linked !== 2) throw new Error('PravmirFood stats mismatch');
  const rows = await api.getForDate('2026-03-10');
  if (!rows.fasting_rules.length || rows.recipes.length !== 6) throw new Error('PravmirFood fasting calendar integration failed');
  const easter = await api.getForDate('2026-04-12');
  if (!easter.feasts.length || easter.recipes.length < 2) throw new Error('PravmirFood feast calendar integration failed');
  const noOil = await api.getRecipes({oil_mode:'none'});
  if (!noOil.length) throw new Error('PravmirFood filter failed');
}


async function checkKnowledge() {
  const c=browserContext('index.html');
  c.window.document={currentScript:{src:'http://example.test/js/data-layer.js'}}; c.document=c.window.document;
  function layer(rel){c.window.document.currentScript.src='http://example.test/'+rel;load(c,rel);}
  layer('js/data-layer.js'); layer('js/content-layer.js'); layer('js/liturgical-layer.js'); layer('js/event-layer.js'); layer('js/food-layer.js'); layer('js/pilgrim-layer.js'); layer('js/news-layer.js'); layer('js/library-layer.js'); layer('js/today-layer.js'); layer('js/knowledge-layer.js');
  const api=c.window.PravmirKnowledge; if(!api||api.version!=='1.39.0') throw new Error('PravmirKnowledge missing/version mismatch');
  const trust=await api.init(); if(trust.domains!==9||trust.inferred_relations!==0||trust.organisation_entities!==0||trust.organisation_relations!==0) throw new Error('PravmirKnowledge trust closure failed');
  const place=await api.getPlaceBundle('pm-9e8bc6fff182514f91cf1739e41d2839'); if(!place.place||place.news.length!==1||place.pilgrim.length<1||place.provenance.length<1) throw new Error('PravmirKnowledge place traversal failed');
  const feast=await api.getFeastBundle('pm-feast-0d16d133b2183b48ebb6'); if(!feast.feast||feast.library_relations.length!==1||feast.library_relations[0].relation_type!=='depicts_feast'||feast.provenance.length<1) throw new Error('PravmirKnowledge feast traversal failed');
  const refs=await c.window.PravmirLibrary.getScriptureReferences({limit:1}),reading=await api.getReadingBundle(refs[0].reading_ref); if(!reading.reading||!reading.scripture_reference||!reading.work||reading.work.id!==reading.scripture_reference.work_ref||!reading.work_url) throw new Error('PravmirKnowledge reading→Library traversal failed');
  const saint=await api.getSaintBundle('pm-saint-4efbfd490a4731dd4707'); if(!saint.saint||saint.lives.length!==1||saint.library_relations.length!==1||saint.library_relations[0].relation_type!=='life_of'||saint.provenance.length<1) throw new Error('PravmirKnowledge saint→life traversal failed');
  const day=await api.getDayBundle('2026-04-12'); if(!day.snapshot||day.snapshot.reading_library.length!==3||day.provenance.length<1) throw new Error('PravmirKnowledge Daily integration failed');
}



async function checkAccount() {
  const c=browserContext('profile.html');
  const calls=[];
  c.window.fetch=async function(input,opts){
    const url=String(input),method=String((opts&&opts.method)||'GET').toUpperCase();calls.push(method+' '+url);
    if(url.endsWith('/api/v1/health'))return {ok:true,status:200,json:async()=>({ok:true,api_version:'1.0'})};
    if(url.endsWith('/api/v1/account/session'))return {ok:false,status:401,json:async()=>({error:'authentication_required'})};
    return {ok:false,status:404,json:async()=>({error:'not_found'})};
  };
  load(c,'js/account-layer.js');
  const api=c.window.PravmirAccount;
  if(!api||api.version!=='1.45.0')throw new Error('PravmirAccount missing/version mismatch');
  const caps=api.getCapabilities();
  if(!caps.auth||!caps.explicit_my_pm_push||!caps.explicit_my_pm_pull||caps.automatic_upload!==false)throw new Error('PravmirAccount capability contract failed');
  const status=await api.init();
  if(!status.available||status.authenticated)throw new Error('PravmirAccount unauthenticated init failed');
  if(calls.some(x=>/\s.*\/account\/my-pm$/.test(x)||x.startsWith('PUT ')))throw new Error('PravmirAccount performed implicit My PM upload');
}

async function checkMyPm() {
  const c=browserContext('profile.html');
  c.window.localStorage.setItem('pravmirLocalProfile', JSON.stringify({name:'Тестовый паломник',email:'test@example.local'}));
  c.window.localStorage.setItem('favorites', JSON.stringify([{id:'pm-9e8bc6fff182514f91cf1739e41d2839',title:'Лавра'}]));
  c.window.localStorage.setItem('readLater', JSON.stringify([{id:'pm-content-9f5cac3be0e95d1aeb5c',title:'Canonical'}, {title:'Старая статья без stable ID',sub:'legacy'}]));
  c.window.localStorage.setItem('myRoutes', JSON.stringify([{id:'pm-route-b1a746ad676ea34a8ea92a76',title:'Дивеевский маршрут'}]));
  load(c,'js/my-pm-layer.js');
  const api=c.window.PravmirMyPm;
  if(!api||api.version!=='1.37.0'||api.schemaVersion!==1) throw new Error('PravmirMyPm missing/version mismatch');
  const summary=await api.init();
  if(summary.storage_mode!=='device_local'||summary.sync_status!=='local_only'||summary.favorites!==1||summary.read_later!==1||summary.saved_routes!==1||summary.legacy_unresolved!==1) throw new Error('PravmirMyPm migration summary failed');
  const profile=await api.getProfile(); if(profile.display_name!=='Тестовый паломник'||profile.email!=='test@example.local') throw new Error('PravmirMyPm legacy profile migration failed');
  const read=await api.list('read_later'); if(read.length!==1||read[0].ref.id!=='pm-content-9f5cac3be0e95d1aeb5c'||read[0].source!=='legacy_migration') throw new Error('PravmirMyPm stable legacy ref migration failed');
  const report=await api.getMigrationReport(); if(report.unresolved.length!==1||report.unresolved[0].title!=='Старая статья без stable ID') throw new Error('PravmirMyPm unresolved legacy isolation failed');
  const extra={kind:'place',id:'pm-test-place'}; if(!(await api.add('favorites',extra))||!(await api.has('favorites',extra))) throw new Error('PravmirMyPm add/has failed');
  if(await api.add('favorites',extra)) throw new Error('PravmirMyPm duplicate ref allowed');
  if(await api.toggle('favorites',extra)!==false||await api.has('favorites',extra)) throw new Error('PravmirMyPm toggle/remove failed');
  const updated=await api.updateProfile({display_name:'Новый профиль',email:''}); if(updated.display_name!=='Новый профиль') throw new Error('PravmirMyPm profile update failed');
  const exported=await api.exportState(); if(exported.schema_version!==1||exported.collections.favorites.length!==1||exported.migration.unresolved.length!==1) throw new Error('PravmirMyPm export contract failed');
}

(async()=>{
  checkComponents();
  await checkData();
  await checkContent();
  await checkLiturgical();
  await checkEvents();
  await checkFood();
  await checkPilgrim();
  await checkNews();
  await checkLibrary();
  await checkToday();
  await checkKnowledge();
  await checkAccount();
  await checkMyPm();
  console.log('RUNTIME CHECK: OK');
})().catch(err=>{ console.error(err && err.stack ? err.stack : err); process.exit(1); });
