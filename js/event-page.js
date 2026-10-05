(function () {
    'use strict';
    const ui=window.PravmirUI;
    function byId(id){return document.getElementById(id);}
    function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;}
    function typeLabel(v){return({service:'Богослужение',procession:'Крестный ход',lecture:'Лекция',pilgrimage_trip:'Паломническая поездка',parish_event:'Приходское событие',pilgrim_event:'Паломническое событие',meeting:'Встреча',other:'Событие'})[v]||'Событие';}
    function refLabel(v){return({place:'Место',entity:'Святыня',route:'Маршрут',content:'Материал',calendar_day:'День календаря',feast:'Праздник',saint:'Святой',commemoration:'Память',fasting_rule:'Пост',reading:'Чтение',organisation:'Организация'})[v]||'Связанная запись';}
    function targetHref(ref,target){
        if(ref.kind==='place'&&window.PravmirData)return window.PravmirData.getDetailUrl(target);
        if(ref.kind==='route')return '../routes/route.html?id='+encodeURIComponent(ref.id);
        if(ref.kind==='entity')return '../holiness.html?entity='+encodeURIComponent(ref.id);
        if(ref.kind==='content')return '../'+target.canonical_path;
        if(ref.kind==='calendar_day')return '../calendar/day.html?date='+encodeURIComponent(target.date);
        if(['feast','saint','commemoration','fasting_rule','reading'].includes(ref.kind))return '../calendar/item.html?kind='+encodeURIComponent(ref.kind)+'&id='+encodeURIComponent(ref.id);
        return '';
    }
    async function init(){
        const api=window.PravmirEvents;if(!api)throw new Error('PravmirEvents unavailable');await api.init();
        const q=new URLSearchParams(location.search),item=q.get('slug')?await api.getBySlug(q.get('slug')):await api.getById(q.get('id'));
        if(!item){byId('eventError').textContent='Событие не найдено или ещё не опубликовано. Вернитесь к афише.';return;}
        document.title=item.title+' — Православный Мир';byId('crumb').textContent=item.title;byId('title').textContent=item.title;
        byId('kind').textContent=typeLabel(item.event_type);byId('meta').textContent=ui.eventTime(item);
        const trust=({verified_organisation:'Подтверждённая организация',editorial:'Редакция ПМ',community:'Предложение сообщества'})[item.trust_layer]||'Источник уточняется';
        byId('status').textContent=ui.statusLabel(item.status)+' · '+trust+' · '+ui.statusLabel(item.verification_status);
        byId('canonicalLink').href=new URL('../'+item.canonical_path,location.href).href;
        const venue=item.venue||{};
        byId('whenWhere').textContent=ui.eventTime(item)+(venue.name?' · '+venue.name:'')+(venue.address?' · '+venue.address:'')+
            (item.temporal.recurrence&&item.temporal.recurrence.kind==='rrule'?' · Повторяющееся событие — уточняйте расписание у организатора.':'');
        const org=item.organizer||{},reg=item.registration||{},parts=[];
        if(org.name)parts.push(org.name);if(reg.required===true)parts.push('Требуется регистрация');
        if(reg.email)parts.push(reg.email);if(reg.phone)parts.push(reg.phone);
        const organizer=byId('organizer');organizer.replaceChildren(node('p','',parts.join(' · ')||'Информация об организаторе и регистрации пока не указана.'));
        if(reg.url&&/^https?:\/\//i.test(reg.url)){const a=node('a','event-related-link','Перейти к регистрации →');a.href=reg.url;a.target='_blank';a.rel='noopener noreferrer';organizer.appendChild(a);}
        const box=byId('relations');box.replaceChildren();
        for(const rel of await api.getRelations(item.id)){
            const target=await api.resolveReference(rel.to),href=target?targetHref(rel.to,target):'';
            const title=target&&(target.title||target.name||target.display_name||target.date);
            const el=node(href?'a':'div','event-related-link',refLabel(rel.to.kind)+' · '+(title||'Данные уточняются'));
            if(href)el.href=href;el.dataset.relationType=rel.relation_type;box.appendChild(el);
        }
        if(!box.children.length)box.appendChild(node('div','event-info','Связанные места и материалы пока не добавлены.'));
        const fresh=item.freshness||{},scope=item.scope||{},source=byId('provenance');source.replaceChildren();
        source.appendChild(node('p','','Проверено: '+ui.dateLabel(fresh.verified_at)+'. Наблюдение: '+ui.dateLabel(fresh.observed_at)+'. Актуальность до: '+ui.dateLabel(fresh.expires_at)+'.'));
        if(fresh.expires_at&&new Date(fresh.expires_at)<new Date())source.appendChild(node('p','','Сведения могли устареть. Перед поездкой уточните данные у организатора.'));
        const details=node('details','source-details'),summary=node('summary','','Происхождение и область данных');
        const raw=node('div','source-details-content','Принадлежность: '+(scope.jurisdiction||'—')+'. Традиция: '+(scope.tradition||'—')+'. Язык: '+(scope.locale||'—')+'. '+
            (item.source_records||[]).map(function(s){return s.provider+' · '+s.source_file+(s.source_row?' · строка '+s.source_row:'')+(s.source_url?' · '+s.source_url:'');}).join(' | '));
        details.append(summary,raw);source.appendChild(details);
        byId('eventError').hidden=true;byId('eventView').hidden=false;
    }
    document.addEventListener('DOMContentLoaded',function(){init().catch(function(error){
        console.warn('Event unavailable',error);byId('eventError').textContent='Не удалось загрузить событие. Обновите страницу или вернитесь к афише.';
    });});
})();
