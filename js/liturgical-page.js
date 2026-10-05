(function () {
    'use strict';
    const ui = window.PravmirUI;
    function byId(id) { return document.getElementById(id); }
    function label(kind) { return ({calendar_day:'День календаря',feast:'Праздник',saint:'Святой',commemoration:'Память',fasting_rule:'Период поста',reading:'Чтение'})[kind] || 'Календарная запись'; }
    function titleFor(item) { return item.title || item.display_name || item.name || ui.dateLabel(item.date); }
    function urlFor(kind,item) { return kind === 'calendar_day' ? 'day.html?date='+encodeURIComponent(item.date) : 'item.html?kind='+encodeURIComponent(kind)+'&id='+encodeURIComponent(item.id); }
    function note(box,text) { const d=document.createElement('div'); d.className='lit-note'; d.textContent=text; box.appendChild(d); }
    function link(box,href,text) { const a=document.createElement('a');a.className='lit-link';a.href=href;a.textContent=text;box.appendChild(a);return a; }
    function formatMeta(item) {
        const parts=[];
        if(item.date)parts.push(ui.dateLabel(item.date));
        const range=item.observance || (item.date_start ? {date_start:item.date_start,date_end:item.date_end} : null);
        if(range)parts.push(ui.dateLabel(range.date_start)+(range.date_end && range.date_end!==range.date_start?' — '+ui.dateLabel(range.date_end):''));
        parts.push(ui.statusLabel(item.verification_status));return parts.join(' · ');
    }
    function scopeValue(value) { return !value || value==='unspecified' ? 'не указана в исходных данных' : String(value); }
    function showSource(item,kind) {
        const box=byId('sourceNote'),scope=item.scope||{};box.replaceChildren();
        const p=document.createElement('p');
        p.textContent=(kind==='calendar_day'?'Дата создана системой; это не подтверждает церковные сведения о дне. ':'')+
            'Принадлежность: '+scopeValue(scope.jurisdiction)+'. Традиция: '+scopeValue(scope.tradition)+'. '+
            'Период данных: '+ui.dateLabel(scope.valid_from)+' — '+ui.dateLabel(scope.valid_to)+'.';
        box.appendChild(p);
        const details=document.createElement('details');details.className='source-details';
        const summary=document.createElement('summary');summary.textContent='Происхождение и технические сведения';
        const raw=document.createElement('div');raw.className='source-details-content';
        const sourceRecords=item.source_records||[];
        raw.textContent='Статус: '+item.verification_status+'. Стиль календаря: '+(scope.calendar_style||'—')+'. '+
            sourceRecords.map(function(s){return s.provider+' · '+s.source_file+(s.source_row?' · строка '+s.source_row:'');}).join(' | ');
        details.append(summary,raw);
        const urls=Array.from(new Set(sourceRecords.map(function(s){return s.source_url;}).filter(function(url){return /^https:\/\//i.test(url||'');})));
        urls.forEach(function(url){const a=document.createElement('a');a.className='lit-source-link';a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Открыть страницу источника ↗';details.appendChild(a);});
        box.appendChild(details);
    }
    async function init() {
        const api=window.PravmirLiturgical;
        if(!api)throw new Error('PravmirLiturgical unavailable');
        await api.init();
        const q=new URLSearchParams(location.search);
        const kind=location.pathname.endsWith('/day.html')?'calendar_day':q.get('kind');
        const item=kind==='calendar_day'?await api.getCalendarDay(q.get('date')):await api.getById(kind,q.get('id'));
        if(!item){byId('litError').textContent='Календарная запись не найдена. Вернитесь к календарю и выберите другую дату.';return;}
        const title=titleFor(item);document.title=title+' — Православный Мир';
        byId('crumb').textContent=title;if(byId('kind'))byId('kind').textContent=label(kind);
        byId('title').textContent=title;byId('meta').textContent=formatMeta(item);
        byId('canonicalLink').href=new URL('../'+item.canonical_path,location.href).href;
        const records=byId('records');records.replaceChildren();
        const readings=byId('readings');if(readings)readings.replaceChildren();
        if(kind==='calendar_day'){
            const bundle=await api.getDayBundle(item.date);
            for(const row of bundle.items){
                const target=row.kind==='reading'&&readings?readings:records;
                link(target,urlFor(row.kind,row.item),label(row.kind)+' · '+titleFor(row.item));
            }
            if(readings&&!readings.children.length)note(readings,'Чтения с подтверждённым редакционным источником для этого дня пока не добавлены.');
        }else{
            const rels=await api.getRelations({kind:kind,id:item.id});
            for(const rel of rels){
                const ref=rel.from.kind===kind&&rel.from.id===item.id?rel.to:rel.from;
                const target=await api.resolveReference(ref);if(!target)continue;
                const a=link(records,urlFor(ref.kind,target),label(ref.kind)+' · '+titleFor(target));
                a.dataset.relationType=rel.relation_type;
            }
        }
        if(!records.children.length)note(records,'Отдельных связанных записей пока нет.');
        if(kind==='calendar_day'&&byId('events')){
            const box=byId('events');box.replaceChildren();
            const rows=window.PravmirEvents?await window.PravmirEvents.getForDate(item.date,{limit:100}):[];
            rows.forEach(function(event){link(box,'../'+event.canonical_path,event.title);});
            if(!rows.length)note(box,'Подтверждённых событий на этот день пока нет.');
        }
        if(kind==='calendar_day'&&byId('food')){
            const box=byId('food');box.replaceChildren();
            const result=window.PravmirFood?await window.PravmirFood.getForDate(item.date):{recipes:[],feasts:[],disclaimer:''};
            if(result.recipes.length){
                link(box,'../food.html?date='+encodeURIComponent(item.date),'Православная кухня · редакционных рецептов: '+result.recipes.length);
                note(box,result.disclaimer);
            }else note(box,'Отдельной кулинарной подборки для этого дня пока нет.');
        }
        if(kind==='calendar_day'&&byId('libraryLinks')){
            const box=byId('libraryLinks');box.replaceChildren();
            if(window.PravmirLibrary){
                await window.PravmirLibrary.init();
                const bundle=await api.getDayBundle(item.date);
                for(const row of bundle.items.filter(function(x){return x.kind==='reading';})){
                    const ref=await window.PravmirLibrary.getScriptureForReading(row.item.id);
                    const work=ref?await window.PravmirLibrary.getWorkById(ref.work_ref):null;
                    if(work)link(box,'../'+work.canonical_path,'Книга Писания · '+work.title);
                }
                for(const row of bundle.items.filter(function(x){return x.kind==='saint';})){
                    const lives=await window.PravmirLibrary.getLivesForSaint(row.item.id,{limit:20});
                    lives.forEach(function(work){link(box,'../'+work.canonical_path,'Житие · '+work.title);});
                }
                const media=await window.PravmirLibrary.getMediaAssets({limit:200}),mediaById=new Map(media.map(function(x){return[x.id,x];}));
                for(const row of bundle.items.filter(function(x){return x.kind==='feast';})){
                    const rels=await window.PravmirLibrary.getRelatedForTarget('feast',row.item.id,{limit:50});
                    rels.forEach(function(rel){const ref=rel.from&&rel.from.kind==='media_asset'?rel.from:rel.to,asset=ref&&ref.kind==='media_asset'?mediaById.get(ref.id):null;if(asset){const a=link(box,asset.external_url,'Медиа · '+asset.title+' · '+asset.rights_status);a.target='_blank';a.rel='noopener noreferrer';}});
                }
            }
            if(!box.children.length)note(box,'Для записей этого дня пока нет explicit Library-связей с подтверждённым provenance.');
        }
        showSource(item,kind);byId('litError').hidden=true;byId('litView').hidden=false;
    }
    document.addEventListener('DOMContentLoaded',function(){init().catch(function(error){
        console.warn('Calendar record unavailable',error);
        byId('litError').textContent='Не удалось загрузить календарную запись. Обновите страницу или вернитесь к календарю.';
    });});
})();
