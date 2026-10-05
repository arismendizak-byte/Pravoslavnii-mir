(function (global) {
    'use strict';

    const scriptUrl = (function () {
        if (global.__PRAVMIR_LIBRARY_LAYER_URL__) return new URL(global.__PRAVMIR_LIBRARY_LAYER_URL__, global.location && global.location.href ? global.location.href : undefined);
        if (global.document && global.document.currentScript && global.document.currentScript.src) return new URL(global.document.currentScript.src);
        return new URL('js/library-layer.js', global.location && global.location.href ? global.location.href : 'http://localhost/index.html');
    })();
    const root = new URL('../data/generated/', scriptUrl);
    let corePromise = null;

    function fetchJson(name) {
        const url = new URL(name, root);
        return fetch(url).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
            return response.json();
        });
    }
    function limit(value, fallback) {
        const n = Number(value);
        return Math.max(1, Math.min(500, Number.isFinite(n) ? Math.floor(n) : fallback));
    }
    function normalize(value) {
        return String(value == null ? '' : value).normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^0-9a-zа-я]+/giu, ' ').trim().replace(/\s+/g, ' ');
    }
    function assertPayload(payload, hash, key, name) {
        if (!payload || payload.source_snapshot_sha256 !== hash || !Array.isArray(payload[key])) throw new Error('PravmirLibrary malformed payload: ' + name);
    }
    function pushMap(map, key, value) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(value);
    }

    function loadCore() {
        if (corePromise) return corePromise;
        const names = ['library_sources','library_rights','library_authors','library_works','library_editions','library_scripture_references','library_text_assets','library_media_assets','library_relations','library_review_queue','library_rejected','library_index','library_report'];
        corePromise = Promise.all(names.map(function (name) { return fetchJson(name + '.json'); })).then(function (parts) {
            const sources=parts[0], rights=parts[1], authors=parts[2], works=parts[3], editions=parts[4], scriptureRefs=parts[5], textAssets=parts[6], mediaAssets=parts[7], relations=parts[8], review=parts[9], rejected=parts[10], index=parts[11], report=parts[12];
            const hash = index.source_snapshot_sha256;
            if (!hash || report.source_snapshot_sha256 !== hash) throw new Error('PravmirLibrary snapshot mismatch');
            assertPayload(sources,hash,'sources','library_sources');
            assertPayload(rights,hash,'policies','library_rights');
            assertPayload(authors,hash,'authors','library_authors');
            assertPayload(works,hash,'works','library_works');
            assertPayload(editions,hash,'editions','library_editions');
            assertPayload(scriptureRefs,hash,'scripture_references','library_scripture_references');
            assertPayload(textAssets,hash,'text_assets','library_text_assets');
            assertPayload(mediaAssets,hash,'media_assets','library_media_assets');
            assertPayload(relations,hash,'relations','library_relations');
            assertPayload(review,hash,'items','library_review_queue');
            assertPayload(rejected,hash,'items','library_rejected');

            const workBySlug = new Map(works.works.filter(function (x) { return x.slug; }).map(function (x) { return [x.slug, x]; }));
            const workById = new Map(works.works.map(function (x) { return [x.id, x]; }));
            const authorById = new Map(authors.authors.map(function (x) { return [x.id, x]; }));
            const authorBySlug = new Map(authors.authors.filter(function (x) { return x.slug; }).map(function (x) { return [x.slug, x]; }));
            const scriptureByReading = new Map(scriptureRefs.scripture_references.map(function (x) { return [x.reading_ref, x]; }));
            const authorsByWork = new Map(), workIdsByAuthor = new Map(), textByWork = new Map(), mediaByWork = new Map(), refsByWork = new Map();
            relations.relations.forEach(function (relation) {
                if (relation.relation_type !== 'author_attribution' || !relation.from || relation.from.kind !== 'work' || !relation.to || relation.to.kind !== 'author') return;
                pushMap(authorsByWork, relation.from.id, relation.to.id);
                pushMap(workIdsByAuthor, relation.to.id, relation.from.id);
            });
            textAssets.text_assets.forEach(function (asset) { pushMap(textByWork, asset.work_ref, asset); });
            mediaAssets.media_assets.forEach(function (asset) { pushMap(mediaByWork, asset.work_ref, asset); });
            scriptureRefs.scripture_references.forEach(function (ref) { pushMap(refsByWork, ref.work_ref, ref); });

            return {
                hash:hash, sources:sources.sources, rights:rights.policies, authors:authors.authors, works:works.works,
                editions:editions.editions, scriptureRefs:scriptureRefs.scripture_references, textAssets:textAssets.text_assets,
                mediaAssets:mediaAssets.media_assets, relations:relations.relations, review:review.items, rejected:rejected.items,
                index:index, report:report, workBySlug:workBySlug, workById:workById, authorById:authorById,
                authorBySlug:authorBySlug, scriptureByReading:scriptureByReading, authorsByWork:authorsByWork,
                workIdsByAuthor:workIdsByAuthor, textByWork:textByWork, mediaByWork:mediaByWork, refsByWork:refsByWork
            };
        }).catch(function (error) { corePromise = null; throw error; });
        return corePromise;
    }

    function resolveAuthor(c, value) {
        const key = String(value || '');
        return c.authorById.get(key) || c.authorBySlug.get(key) || null;
    }
    function resolveWork(c, value) {
        const key = String(value || '');
        return c.workById.get(key) || c.workBySlug.get(key) || null;
    }
    function workAvailability(c, workId) {
        const texts = c.textByWork.get(workId) || [];
        if (texts.some(function (x) { return x.storage_mode === 'local_text'; })) return 'local_text';
        if (texts.some(function (x) { return x.storage_mode === 'external_url'; })) return 'external_text';
        return 'metadata_only';
    }
    function worksForAuthorSet(c, authorValue) {
        if (!authorValue) return null;
        const author = resolveAuthor(c, authorValue);
        return author ? new Set(c.workIdsByAuthor.get(author.id) || []) : new Set();
    }

    async function getStats() {
        const c = await loadCore();
        return Object.assign({}, c.index.counts, { source_snapshot_sha256:c.hash });
    }
    async function getRightsPolicies() { return (await loadCore()).rights.slice(); }
    async function getWorks(options) {
        const c=await loadCore(), o=options||{}, q=normalize(o.q||''), authored=worksForAuthorSet(c,o.author_ref||o.author);
        return c.works.filter(function (work) {
            if (o.work_type && work.work_type !== o.work_type) return false;
            if (o.rights_status && work.rights_status !== o.rights_status) return false;
            if (o.availability && workAvailability(c, work.id) !== o.availability) return false;
            if (authored && !authored.has(work.id)) return false;
            if (!q) return true;
            const authorNames = (c.authorsByWork.get(work.id) || []).map(function (id) { const author=c.authorById.get(id); return author ? author.display_name : ''; });
            return normalize([work.title,work.summary,(work.aliases||[]).join(' '),authorNames.join(' ')].join(' ')).includes(q);
        }).slice(0,limit(o.limit,100));
    }
    async function getAuthors(options) {
        const c=await loadCore(), o=options||{}, q=normalize(o.q||'');
        return c.authors.filter(function (author) {
            return !q || normalize([author.display_name,author.summary,(author.aliases||[]).join(' ')].join(' ')).includes(q);
        }).slice(0,limit(o.limit,100));
    }
    async function getEditions(options) { const c=await loadCore(),o=options||{}; return c.editions.filter(function(x){return !o.work_ref||x.work_ref===o.work_ref;}).slice(0,limit(o.limit,200)); }
    async function getScriptureReferences(options) { const c=await loadCore(),o=options||{}; return c.scriptureRefs.filter(function(x){return(!o.work_ref||x.work_ref===o.work_ref)&&(!o.reading_ref||x.reading_ref===o.reading_ref)&&(!o.date||x.date===o.date);}).slice(0,limit(o.limit,200)); }
    async function getReadingsForWork(workOrSlug, options) { const c=await loadCore(),work=resolveWork(c,workOrSlug); return work?(c.refsByWork.get(work.id)||[]).slice(0,limit((options||{}).limit,200)):[]; }
    async function getScriptureForReading(readingId) { return (await loadCore()).scriptureByReading.get(String(readingId||''))||null; }
    async function getTextAssets(options) { const c=await loadCore(),o=options||{}; return c.textAssets.filter(function(x){return(!o.work_ref||x.work_ref===o.work_ref)&&(!o.rights_status||x.rights_status===o.rights_status)&&(!o.storage_mode||x.storage_mode===o.storage_mode);}).slice(0,limit(o.limit,200)); }
    async function getLocalText(assetId) {
        const c=await loadCore(),asset=c.textAssets.find(function(x){return x.id===String(assetId||'');});
        if(!asset||asset.storage_mode!=='local_text')return null;
        const policy=c.rights.find(function(x){return x.key===asset.rights_status;});
        if(!policy||!policy.local_text_allowed||asset.verification_status!=='rights_verified'||!/^library\/texts\/[a-z0-9-]+\.txt$/.test(asset.content_path||'')||!/^[0-9a-f]{64}$/.test(asset.content_sha256||''))throw new Error('PravmirLibrary local text rights/path invalid');
        const url=new URL(asset.content_path,new URL('../',scriptUrl)),response=await fetch(url);
        if(!response.ok)throw new Error('HTTP '+response.status+' for local text');
        const body=await response.arrayBuffer();
        if(body.byteLength!==asset.content_size_bytes)throw new Error('PravmirLibrary local text size mismatch');
        let checksumVerified=false;
        if(global.crypto&&global.crypto.subtle){
            const digest=await global.crypto.subtle.digest('SHA-256',body),hash=Array.from(new Uint8Array(digest),function(b){return b.toString(16).padStart(2,'0');}).join('');
            if(hash!==asset.content_sha256)throw new Error('PravmirLibrary local text checksum mismatch');
            checksumVerified=true;
        }
        return{asset:asset,text:new TextDecoder('utf-8',{fatal:true}).decode(body),checksum_verified:checksumVerified};
    }
    async function getMediaAssets(options) { const c=await loadCore(),o=options||{}; return c.mediaAssets.filter(function(x){return(!o.work_ref||x.work_ref===o.work_ref)&&(!o.media_kind||x.media_kind===o.media_kind)&&(!o.rights_status||x.rights_status===o.rights_status);}).slice(0,limit(o.limit,200)); }
    async function getRelations(options) { const c=await loadCore(),o=options||{}; return c.relations.filter(function(x){return(!o.relation_type||x.relation_type===o.relation_type)&&(!o.from_id||(x.from&&x.from.id===o.from_id))&&(!o.to_id||(x.to&&x.to.id===o.to_id));}).slice(0,limit(o.limit,500)); }
    async function getRelatedForTarget(kind,id,options) { const c=await loadCore(),o=options||{},k=String(kind||''),rid=String(id||''); return c.relations.filter(function(x){return(!o.relation_type||x.relation_type===o.relation_type)&&(((x.from||{}).kind===k&&(x.from||{}).id===rid)||((x.to||{}).kind===k&&(x.to||{}).id===rid));}).slice(0,limit(o.limit,200)); }
    async function getLivesForSaint(saintId,options) { const c=await loadCore(),sid=String(saintId||''),ids=new Set(c.relations.filter(function(r){return r.relation_type==='life_of'&&r.to&&r.to.kind==='saint'&&r.to.id===sid&&r.from&&r.from.kind==='work';}).map(function(r){return r.from.id;})); return c.works.filter(function(w){return w.work_type==='life'&&ids.has(w.id);}).slice(0,limit((options||{}).limit,50)); }
    async function getReviewQueue(options) { return (await loadCore()).review.slice(0,limit((options||{}).limit,200)); }
    async function getWorkById(id) { return (await loadCore()).workById.get(String(id||''))||null; }
    async function getAuthorById(id) { return (await loadCore()).authorById.get(String(id||''))||null; }
    async function getWorkBySlug(slug) { return (await loadCore()).workBySlug.get(String(slug||''))||null; }
    async function getAuthorBySlug(slug) { return (await loadCore()).authorBySlug.get(String(slug||''))||null; }
    async function getWorksForAuthor(authorOrSlug,options) { const c=await loadCore(),author=resolveAuthor(c,authorOrSlug); if(!author)return[]; const ids=new Set(c.workIdsByAuthor.get(author.id)||[]); return c.works.filter(function(x){return ids.has(x.id);}).slice(0,limit((options||{}).limit,100)); }
    async function getAuthorBundle(authorOrSlug) {
        const c=await loadCore(),author=resolveAuthor(c,authorOrSlug); if(!author)return null;
        const ids=new Set(c.workIdsByAuthor.get(author.id)||[]),works=c.works.filter(function(x){return ids.has(x.id);});
        const textAssets=c.textAssets.filter(function(x){return ids.has(x.work_ref);}),mediaAssets=c.mediaAssets.filter(function(x){return ids.has(x.work_ref);});
        return{author:author,works:works,text_assets:textAssets,media_assets:mediaAssets,local_text_assets:textAssets.filter(function(x){return x.storage_mode==='local_text';}).length};
    }
    async function getDiscoveryFacets(options) {
        const c=await loadCore(),authored=worksForAuthorSet(c,(options||{}).author_ref||(options||{}).author),rows=authored?c.works.filter(function(x){return authored.has(x.id);}):c.works.slice();
        const counts=function(values){const map=new Map();values.forEach(function(value){map.set(value,(map.get(value)||0)+1);});return Array.from(map.entries()).map(function(entry){return{value:entry[0],count:entry[1]};}).sort(function(a,b){return b.count-a.count||String(a.value).localeCompare(String(b.value),'ru');});};
        return{total:rows.length,work_types:counts(rows.map(function(x){return x.work_type||'work';})),rights_statuses:counts(rows.map(function(x){return x.rights_status||'metadata_only';})),availability:counts(rows.map(function(x){return workAvailability(c,x.id);})),author_ref:(options||{}).author_ref||(options||{}).author||null};
    }
    async function getRelatedWorksForWork(workOrSlug,options) {
        const c=await loadCore(),work=resolveWork(c,workOrSlug); if(!work)return[];
        const authorIds=c.authorsByWork.get(work.id)||[],seen=new Set([work.id]),out=[];
        authorIds.forEach(function(authorId){(c.workIdsByAuthor.get(authorId)||[]).forEach(function(workId){if(seen.has(workId))return;seen.add(workId);const item=c.workById.get(workId);if(item)out.push(item);});});
        return out.slice(0,limit((options||{}).limit,20));
    }
    async function getWorkBundle(slug) {
        const c=await loadCore(),work=resolveWork(c,slug); if(!work)return null;
        const editions=c.editions.filter(function(x){return x.work_ref===work.id;}),refs=(c.refsByWork.get(work.id)||[]).slice(),authorIds=c.authorsByWork.get(work.id)||[];
        const relatedSaints=c.relations.filter(function(r){return r.relation_type==='life_of'&&r.from&&r.from.kind==='work'&&r.from.id===work.id&&r.to&&r.to.kind==='saint';}).map(function(r){return{id:r.to.id,relation:r};});
        const relatedAuthorWorks=await getRelatedWorksForWork(work.id,{limit:20});
        return{work:work,editions:editions,scripture_references:refs,authors:authorIds.map(function(id){return c.authorById.get(id);}).filter(Boolean),text_assets:(c.textByWork.get(work.id)||[]).slice(),media_assets:(c.mediaByWork.get(work.id)||[]).slice(),related_saints:relatedSaints,related_author_works:relatedAuthorWorks};
    }
    async function getTrustSummary() {
        const c=await loadCore();
        return{source_snapshot_sha256:c.hash,rights_policies:c.rights.length,canonical_works:c.works.length,canonical_authors:c.authors.length,editions:c.editions.length,scripture_references:c.scriptureRefs.length,text_assets:c.textAssets.length,media_assets:c.mediaAssets.length,relations:c.relations.length,review_queue:c.review.length,rejected:c.rejected.length,rights_cleared_text_assets:Number(c.report.rights_cleared_text_assets_created||0),rights_cleared_media_assets:Number(c.report.rights_cleared_media_assets_created||0),local_text_assets:Number(c.report.local_text_assets_created||0),local_media_assets:Number(c.report.local_media_assets_created||0),full_protected_texts_copied:Number(c.report.full_protected_texts_copied||0),unlicensed_local_assets:Number(c.report.unlicensed_local_assets_created||0),inferred_relations:Number(c.report.inferred_relations_created||0),organisation_entities:Number(c.report.organisation_entities_created||0)};
    }
    function getDetailUrl(work) { const siteRoot=new URL('../',scriptUrl); return work&&work.canonical_path?new URL(work.canonical_path,siteRoot).href:new URL('library.html',siteRoot).href; }

    global.PravmirLibrary=Object.freeze({
        version:'1.43.0',init:function(){return loadCore().then(getStats);},getStats:getStats,getRightsPolicies:getRightsPolicies,
        getWorks:getWorks,getAuthors:getAuthors,getEditions:getEditions,getScriptureReferences:getScriptureReferences,getReadingsForWork:getReadingsForWork,
        getScriptureForReading:getScriptureForReading,getTextAssets:getTextAssets,getLocalText:getLocalText,getMediaAssets:getMediaAssets,
        getRelations:getRelations,getRelatedForTarget:getRelatedForTarget,getLivesForSaint:getLivesForSaint,getReviewQueue:getReviewQueue,
        getWorkById:getWorkById,getAuthorById:getAuthorById,getAuthorBySlug:getAuthorBySlug,getWorksForAuthor:getWorksForAuthor,getAuthorBundle:getAuthorBundle,
        getWorkBySlug:getWorkBySlug,getWorkBundle:getWorkBundle,getRelatedWorksForWork:getRelatedWorksForWork,getDiscoveryFacets:getDiscoveryFacets,
        getTrustSummary:getTrustSummary,getDetailUrl:getDetailUrl
    });
})(window);
