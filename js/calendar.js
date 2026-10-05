(function () {
    'use strict';
    const weekDays = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const monthGen = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    const dayNames = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
    let currentYear, currentMonth, coverage;
    const today = new Date();
    const todayStr = localDateString(today);

    function byId(id) { return document.getElementById(id); }
    function localDateString(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
    function dateLabel(value) { const d = new Date(value + 'T12:00:00'); return d.getDate() + ' ' + monthGen[d.getMonth()] + ' ' + d.getFullYear(); }
    function inCoverage(value) { return coverage && value >= coverage.valid_from && value <= coverage.valid_to; }
    function kindLabel(kind) { return ({feast:'Праздник',commemoration:'Память / день',saint:'Святой',fasting_rule:'Пост',reading:'Чтение'})[kind] || kind; }

    function recordLink(row) {
        const a = document.createElement('a'); a.className = 'cal-record'; a.href = row.item.canonical_path;
        const kind = document.createElement('span'); kind.className = 'cal-record-kind'; kind.textContent = kindLabel(row.kind);
        const title = document.createElement('span'); title.className = 'cal-record-title'; title.textContent = row.item.title || row.item.display_name || row.item.name;
        a.append(kind, title); return a;
    }

    function eventLink(row) {
        const a = document.createElement('a'); a.className = 'cal-record cal-event-record'; a.href = row.canonical_path;
        const kind = document.createElement('span'); kind.className = 'cal-record-kind'; kind.textContent = 'Событие';
        const title = document.createElement('span'); title.className = 'cal-record-title'; title.textContent = row.title;
        a.append(kind, title); return a;
    }

    async function eventsForDate(dateStr) {
        if (!window.PravmirEvents || !window.PravmirEvents.getForDate) return [];
        return window.PravmirEvents.getForDate(dateStr, { limit: 100 });
    }

    async function showDayDetails(dateStr) {
        const d = new Date(dateStr + 'T12:00:00');
        byId('selectedDayTitle').textContent = d.getDate() + ' ' + monthGen[d.getMonth()] + ' ' + d.getFullYear();
        const records = byId('selectedDayRecords'); records.replaceChildren();
        const link = byId('canonicalDayLink'); link.href = 'calendar/day.html?date=' + encodeURIComponent(dateStr); link.hidden = false;
        if (!inCoverage(dateStr)) {
            byId('selectedDaySub').textContent = dayNames[d.getDay()] + ' · данные для этой даты ещё не добавлены';
            const p = document.createElement('div'); p.textContent = 'Литургические данные для этой даты не заявлены текущим источником.'; records.appendChild(p); return;
        }
        const bundle = await window.PravmirLiturgical.getDayBundle(dateStr);
        const readingCount = bundle.items.filter(function(row){return row.kind==='reading';}).length;
        byId('selectedDaySub').textContent = dayNames[d.getDay()] + ' · календарная основа из legacy-источника' + (readingCount ? ' · чтения с редакционным источником: '+readingCount : '');
        if (!bundle.items.length) {
            const p = document.createElement('div'); p.textContent = 'Отдельных календарных записей на этот день пока нет.'; records.appendChild(p);
        } else bundle.items.forEach(function (row) { records.appendChild(recordLink(row)); });
        const events = await eventsForDate(dateStr);
        events.forEach(function (row) { records.appendChild(eventLink(row)); });
        if (window.PravmirFood && window.PravmirFood.getForDate) {
            const food = await window.PravmirFood.getForDate(dateStr);
            if (food.recipes.length) {
                const a = document.createElement('a');
                a.className = 'cal-record';
                a.href = 'food.html?date=' + encodeURIComponent(dateStr);
                const kind = document.createElement('span'); kind.className = 'cal-record-kind'; kind.textContent = 'Трапеза';
                const title = document.createElement('span'); title.className = 'cal-record-title'; title.textContent = (food.feasts.length ? 'Праздничные/календарные рецепты · ' : 'Постные рецепты · ') + food.recipes.length;
                a.append(kind, title); records.appendChild(a);
            }
        }
    }

    async function renderCalendar() {
        const grid = byId('calendarGrid'); grid.replaceChildren();
        weekDays.forEach(function (label) { const div=document.createElement('div'); div.className='cal-grid-header'; div.textContent=label; grid.appendChild(div); });
        const firstDay = new Date(currentYear,currentMonth,1).getDay();
        const daysInMonth = new Date(currentYear,currentMonth+1,0).getDate();
        const startOffset = firstDay === 0 ? 6 : firstDay - 1;
        for (let i=0;i<startOffset;i++) { const div=document.createElement('div'); div.className='cal-cell empty'; grid.appendChild(div); }
        const tasks=[];
        for (let day=1;day<=daysInMonth;day++) {
            const dateStr=currentYear+'-'+String(currentMonth+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
            const button=document.createElement('button'); button.type='button'; button.className='cal-cell'; button.textContent=day; button.dataset.date=dateStr;
            button.setAttribute('aria-label', dateLabel(dateStr));
            if (dateStr === todayStr) button.setAttribute('aria-current', 'date');
            if (dateStr === todayStr) button.classList.add('today');
            if (!inCoverage(dateStr)) button.classList.add('outside-coverage');
            button.addEventListener('click',function(){ document.querySelectorAll('.cal-cell.selected').forEach(function(c){c.classList.remove('selected');}); button.classList.add('selected'); showDayDetails(dateStr); });
            grid.appendChild(button);
            if (inCoverage(dateStr)) tasks.push(Promise.all([window.PravmirLiturgical.getDayBundle(dateStr), eventsForDate(dateStr)]).then(function(parts){
                const bundle=parts[0], events=parts[1]; if (!bundle) return;
                if (bundle.items.some(function(x){return x.kind==='feast';})) button.classList.add('feast');
                if (bundle.items.some(function(x){return x.kind==='fasting_rule';})) button.classList.add('fast');
                if (bundle.items.some(function(x){return x.kind==='commemoration';})) button.classList.add('commemoration');
                if (events.length) button.classList.add('event');
                const dayReadings=bundle.items.filter(function(x){return x.kind==='reading';});
                button.title=bundle.items.filter(function(x){return x.kind!=='reading';}).map(function(x){return x.item.title || x.item.display_name || x.item.name;}).concat(dayReadings.length?['Чтения: '+dayReadings.length]:[],events.map(function(x){return 'Событие: '+x.title;})).join(' · ');
                button.setAttribute('aria-label', dateLabel(dateStr) + (button.title ? ' · ' + button.title : ''));
            }));
        }
        byId('currentMonthLabel').textContent=monthNames[currentMonth]+' '+currentYear;
        updateNavState();
        await Promise.all(tasks);
    }

    function monthKey(y,m){return y*12+m;}
    function coverageMonthBounds(){ const a=new Date(coverage.valid_from+'T12:00:00'), b=new Date(coverage.valid_to+'T12:00:00'); return [monthKey(a.getFullYear(),a.getMonth()),monthKey(b.getFullYear(),b.getMonth())]; }
    function updateNavState(){ const b=coverageMonthBounds(), k=monthKey(currentYear,currentMonth); byId('prevMonth').disabled=k<=b[0]; byId('nextMonth').disabled=k>=b[1]; }
    async function changeMonth(delta){ const b=coverageMonthBounds(); let k=monthKey(currentYear,currentMonth)+delta; k=Math.max(b[0],Math.min(b[1],k)); currentYear=Math.floor(k/12); currentMonth=k%12; await renderCalendar(); }

    function parseSearch(input){
        const text=input.trim().toLowerCase(); if(!text)return null;
        const names={'янв':0,'января':0,'январь':0,'фев':1,'февраля':1,'февраль':1,'мар':2,'марта':2,'март':2,'апр':3,'апреля':3,'апрель':3,'май':4,'мая':4,'июн':5,'июня':5,'июнь':5,'июл':6,'июля':6,'июль':6,'авг':7,'августа':7,'август':7,'сен':8,'сентября':8,'сентябрь':8,'окт':9,'октября':9,'октябрь':9,'ноя':10,'ноября':10,'ноябрь':10,'дек':11,'декабря':11,'декабрь':11};
        let m=text.match(/^(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?$/i); let day,month,year;
        if(m){day=Number(m[1]);month=names[m[2]];year=m[3]?Number(m[3]):currentYear;}
        else {m=text.match(/^(\d{1,2})[.\/]([0-9]{1,2})(?:[.\/](\d{4}))?$/); if(!m)return null; day=Number(m[1]);month=Number(m[2])-1;year=m[3]?Number(m[3]):currentYear;}
        if(month===undefined||month<0||month>11||day<1||day>31)return null;
        const d=new Date(year,month,day); if(d.getFullYear()!==year||d.getMonth()!==month||d.getDate()!==day)return null; return localDateString(d);
    }

    async function searchDate(){ const dateStr=parseSearch(byId('dateSearch').value); if(!dateStr){byId('selectedDayTitle').textContent='Дата не распознана';byId('selectedDaySub').textContent='Используйте формат 25.06, 25/06 или 25 июня 2026.';return;} const d=new Date(dateStr+'T12:00:00'); if(inCoverage(dateStr)){currentYear=d.getFullYear();currentMonth=d.getMonth();await renderCalendar(); const cell=document.querySelector('.cal-cell[data-date="'+dateStr+'"]');if(cell){cell.classList.add('selected');cell.scrollIntoView({block:'nearest'});}} await showDayDetails(dateStr); }

    function bind(){ byId('prevMonth').addEventListener('click',function(){changeMonth(-1);}); byId('nextMonth').addEventListener('click',function(){changeMonth(1);}); byId('dateSearchBtn').addEventListener('click',searchDate); byId('dateSearch').addEventListener('keydown',function(e){if(e.key==='Enter')searchDate();}); }

    async function init(){
        const api=window.PravmirLiturgical; if(!api)throw new Error('PravmirLiturgical unavailable'); const stats=await api.init(); coverage=stats.coverage;
        byId('coverageText').textContent='Доступные даты: '+coverage.valid_from+' — '+coverage.valid_to+'. Основной календарный слой перенесён из legacy-источника; отдельные чтения показываются со своим редакционным статусом и provenance.';
        const nowKey=todayStr; const initial=inCoverage(nowKey)?todayStr:coverage.valid_from; const initDate=new Date(initial+'T12:00:00'); currentYear=initDate.getFullYear();currentMonth=initDate.getMonth();
        byId('todayDateText').textContent=dateLabel(todayStr);
        if(inCoverage(todayStr)){const bundle=await api.getDayBundle(todayStr); const eventRows=await eventsForDate(todayStr); const readingCount=bundle.items.filter(function(x){return x.kind==='reading';}).length; const titles=bundle.items.filter(function(x){return x.kind!=='reading';}).map(function(x){return x.item.title||x.item.display_name||x.item.name;}).concat(readingCount?['Чтения: '+readingCount]:[],eventRows.map(function(x){return 'Событие: '+x.title;}));byId('todayEventText').textContent=titles.length?titles.join(' · '):'Отдельных календарных записей на сегодня пока нет';byId('todayEventText').classList.toggle('empty',!titles.length);} else {byId('todayEventText').textContent='Данные на сегодня ещё не добавлены';byId('todayEventText').classList.add('empty');}
        bind(); await renderCalendar(); if(inCoverage(initial)){const cell=document.querySelector('.cal-cell[data-date="'+initial+'"]');if(cell)cell.classList.add('selected'); await showDayDetails(initial);}
    }
    document.addEventListener('DOMContentLoaded',function(){init().catch(function(error){byId('calendarError').hidden=false;byId('calendarError').textContent=error.message||String(error);});});
})();
