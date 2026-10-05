(function () {
    'use strict';
    const rightsLabels={public_domain_verified:'общественное достояние',open_license:'открытая лицензия',external_link_only:'внешняя ссылка, права редакции требуют проверки',metadata_only:'библиографическая запись'};
    const typeLabels={scripture:'Священное Писание',theology:'Богословие',life:'Житие',prayer:'Молитва',liturgy:'Богослужебный текст',hymnography:'Гимнография',sermon:'Проповедь',catechesis:'Катехизация',church_history:'История Церкви'};
    function element(tag,value,className){const node=document.createElement(tag);if(value!=null)node.textContent=String(value);if(className)node.className=className;return node;}
    function link(label,url,external){const node=element('a',label);node.href=url;if(external){node.target='_blank';node.rel='noopener noreferrer';}return node;}
    function itemSection(title){const section=element('section',null,'library-item-section');section.append(element('h2',title));return section;}
    function reader(api,asset){
        const section=element('section',null,'library-reading');section.append(element('h2','Читать произведение'));
        const notice=element('p',asset.copyright_notice,'library-reader-notice');notice.append(document.createTextNode(' '),link('Версия источника',asset.external_url,true));if(asset.license_url)notice.append(document.createTextNode(' · '),link('Условия использования',asset.license_url,true));section.append(notice);
        const button=element('button','Читать здесь','library-read-button');button.type='button';const status=element('p','Текст откроется на этой странице.','library-reader-status');status.setAttribute('role','status');const body=element('div',null,'library-reader');body.hidden=true;body.tabIndex=-1;body.id='text-'+asset.id;button.setAttribute('aria-controls',body.id);button.setAttribute('aria-expanded','false');
        button.addEventListener('click',async()=>{button.disabled=true;status.textContent='Загрузка текста…';try{const result=await api.getLocalText(asset.id);if(!result)throw new Error('Local text unavailable');body.replaceChildren(document.createTextNode(result.text));body.hidden=false;button.hidden=true;button.setAttribute('aria-expanded','true');status.textContent='Полная выбранная электронная публикация. Транскрипция источника не проходила независимую выверку.';body.focus();}catch(error){console.error(error);status.textContent='Не удалось открыть локальный текст. Можно повторить загрузку или перейти к источнику.';button.textContent='Повторить загрузку';button.disabled=false;}});
        section.append(button,status,body);return section;
    }
    function collectSources(bundle){
        const rows=[],seen=new Set();
        function walk(value){if(!value)return;if(Array.isArray(value)){value.forEach(walk);return;}if(typeof value!=='object')return;if(Array.isArray(value.source_records)){value.source_records.forEach(rec=>{const key=[rec.provider||'',rec.source_id||'',rec.source_url||''].join('|');if(seen.has(key))return;seen.add(key);rows.push(rec);});}Object.keys(value).forEach(k=>{if(k!=='source_records'&&k!=='relation')walk(value[k]);});}
        walk(bundle);return rows;
    }
    async function init(){
        const root=document.getElementById('libraryItem'),api=window.PravmirLibrary;if(!root||!api)return;
        const slug=new URLSearchParams(window.location.search).get('slug')||'',bundle=slug?await api.getWorkBundle(slug):null;
        if(!bundle){root.replaceChildren(element('div','Произведение не найдено. Перейдите в каталог библиотеки.','library-state'));return;}
        const {work,authors,editions,scripture_references:refs,text_assets:textAssets,media_assets:mediaAssets,related_saints:relatedSaints,related_author_works:relatedAuthorWorks}=bundle;
        document.title=work.title+' — Православный Мир';
        const kicker=element('div',typeLabels[work.work_type]||work.work_type||'Произведение','section-label');
        root.replaceChildren(kicker,element('h1',work.title),element('p',work.summary||''),element('div','Права произведения: '+(rightsLabels[work.rights_status]||work.rights_status)+' · trust: '+(work.verification_status||'не указан'),'library-trust'));
        if(authors.length){const row=element('p');row.append(element('strong','Автор: '));authors.forEach((author,i)=>{if(i)row.append(document.createTextNode(', '));row.append(link(author.display_name,'../'+author.canonical_path));});root.append(row);}else{root.append(element('p','Авторство в canonical данных не указано: фиктивная атрибуция не создаётся.','library-reader-notice'));}

        const editionSection=itemSection('Издание и версия');
        if(editions.length){const list=element('div',null,'library-related-list');editions.forEach(ed=>{const row=element('div',null,'library-state');row.append(element('strong',ed.title||'Издание'));if(ed.publication_year)row.append(element('span','Год: '+ed.publication_year,'library-asset-notice'));list.append(row);});editionSection.append(list);}else editionSection.append(element('div','Издание не указано.','library-state'));root.append(editionSection);

        if(textAssets.length||mediaAssets.length){const section=itemSection('Тексты и материалы'),block=element('div',null,'library-related-list');[...textAssets,...mediaAssets].forEach(asset=>{const row=element('div',null,'library-state');const title=asset.storage_mode==='local_text'?'Локальный полный текст':(asset.media_kind?('Медиа · '+asset.media_kind):'Внешний текст');row.append(element('strong',title));row.append(document.createTextNode(' · '+(rightsLabels[asset.rights_status]||asset.rights_status)+' · '));row.append(link(asset.storage_mode==='local_text'?'Открыть источник публикации':'Открыть внешний источник',asset.external_url,true));if(asset.license_url)row.append(document.createTextNode(' · '),link('Лицензия',asset.license_url,true));if(asset.copyright_notice)row.append(element('span',asset.copyright_notice,'library-asset-notice'));block.append(row);});section.append(block);root.append(section);}

        if(refs.length){const section=itemSection('Богослужебные чтения'),list=element('div',null,'library-related-list');refs.forEach(ref=>{const wrap=element('div',null,'library-state');const title=[ref.date,ref.citation].filter(Boolean).join(' · ');wrap.append(link(title||'Чтение','../'+ref.canonical_path));if(ref.date)wrap.append(document.createTextNode(' · '),link('День календаря','../calendar/day.html?date='+encodeURIComponent(ref.date)));wrap.append(element('span','Explicit reading_ref → work_ref; связь по stable IDs.','library-asset-notice'));list.append(wrap);});section.append(list);root.append(section);}

        if(relatedSaints&&relatedSaints.length){const section=itemSection('Связанные святые'),list=element('div',null,'library-related-list');for(const row of relatedSaints){let label=row.id;if(window.PravmirLiturgical){try{const saint=await window.PravmirLiturgical.resolveReference({kind:'saint',id:row.id});if(saint)label=saint.name||saint.title||label;}catch(_){}}const a=link(label,'../calendar/item.html?kind=saint&id='+encodeURIComponent(row.id));const wrap=element('div',null,'library-state');wrap.append(a,element('span','Explicit life_of relation · '+(row.relation.verification_status||'verified'),'library-asset-notice'));list.append(wrap);}section.append(list);root.append(section);}

        if(relatedAuthorWorks&&relatedAuthorWorks.length){const section=itemSection('Другие произведения этого автора'),note=element('p','Подборка строится только через существующие explicit author_attribution; это навигация, а не новая canonical relation.','library-reader-notice'),list=element('div',null,'library-related-list');section.append(note);relatedAuthorWorks.slice(0,8).forEach(item=>{const a=link(item.title,'../'+item.canonical_path);const wrap=element('div',null,'library-state');wrap.append(a,element('span',typeLabels[item.work_type]||item.work_type,'library-asset-notice'));list.append(wrap);});section.append(list);root.append(section);}

        const sources=collectSources(bundle).filter(x=>x.source_url);
        if(sources.length){const section=itemSection('Источники и provenance'),list=element('div',null,'library-related-list');sources.slice(0,12).forEach(rec=>{const wrap=element('div',null,'library-state');wrap.append(link(rec.provider||rec.source_id||'Источник',rec.source_url,true));if(rec.source_id)wrap.append(element('span','source_id: '+rec.source_id,'library-asset-notice'));list.append(wrap);});section.append(list);root.append(section);}
        textAssets.filter(x=>x.storage_mode==='local_text').forEach(asset=>root.append(reader(api,asset)));
    }
    document.addEventListener('DOMContentLoaded',()=>init().catch(error=>{console.error(error);const root=document.getElementById('libraryItem');if(root)root.textContent='Не удалось загрузить произведение. Обновите страницу.';}));
})();
