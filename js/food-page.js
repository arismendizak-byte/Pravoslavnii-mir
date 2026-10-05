(function () {
    'use strict';
    const ui=window.PravmirUI;
    function byId(id){return document.getElementById(id);}
    function typeLabel(v){return({soup:'Суп',main:'Основное блюдо',salad:'Салат',breakfast:'Завтрак',dessert:'Десерт',baking:'Выпечка',drink:'Напиток',other:'Другое'})[v]||'Рецепт';}
    async function init(){
        const api=window.PravmirFood;if(!api)throw new Error('PravmirFood unavailable');await api.init();
        const q=new URLSearchParams(location.search);
        const row=q.get('slug')?await api.getBySlug(q.get('slug')):await api.getById(q.get('id'));
        if(!row){byId('foodError').textContent='Рецепт не найден. Откройте общую подборку и выберите другое блюдо.';return;}
        document.title=row.title+' — Православный Мир';byId('crumb').textContent=row.title;byId('title').textContent=row.title;
        byId('meta').textContent=typeLabel(row.recipe_type)+' · '+row.servings+' порц. · подготовка '+row.prep_minutes+' мин · приготовление '+row.cook_minutes+' мин';
        byId('summary').textContent=row.summary;
        byId('canonicalLink').href=new URL('../'+row.canonical_path,location.href).href;
        const ing=byId('ingredients'),steps=byId('steps');ing.replaceChildren();steps.replaceChildren();
        (row.ingredients||[]).forEach(function(x){const li=document.createElement('li');li.textContent=x.name+' — '+x.amount+(x.note?' · '+x.note:'');ing.appendChild(li);});
        (row.steps||[]).forEach(function(x){const li=document.createElement('li');li.textContent=x;steps.appendChild(li);});
        byId('fasting').textContent=row.fasting_compatibility.note+' '+row.fasting_compatibility.disclaimer;
        const box=byId('relations');box.replaceChildren();
        for(const rel of await api.getRelations(row.id)){
            if(!['fasting_rule','feast'].includes(rel.to.kind))continue;
            const target=window.PravmirLiturgical?await window.PravmirLiturgical.getById(rel.to.kind,rel.to.id):null;
            if(!target)continue;
            const a=document.createElement('a');a.className='food-related-link';
            a.href='../calendar/item.html?kind='+encodeURIComponent(rel.to.kind)+'&id='+encodeURIComponent(rel.to.id);
            a.textContent=(target.title||target.display_name||target.name)+' · редакционная подборка';box.appendChild(a);
        }
        if(!box.children.length){const d=document.createElement('div');d.className='food-note';d.textContent='Связанных календарных подборок пока нет.';box.appendChild(d);}
        const source=byId('source');source.replaceChildren();
        const status=document.createElement('p');status.textContent=ui.statusLabel(row.verification_status)+'. Рецепт не является церковным предписанием.';
        const details=document.createElement('details');details.className='source-details';
        const summary=document.createElement('summary');summary.textContent='Происхождение рецепта';
        const raw=document.createElement('div');raw.className='source-details-content';
        raw.textContent=(row.source_records||[]).map(function(s){return s.provider+' · '+s.source_file+' · строка '+s.source_row;}).join(' | ');
        details.append(summary,raw);source.append(status,details);
        byId('foodError').hidden=true;byId('foodView').hidden=false;
    }
    document.addEventListener('DOMContentLoaded',function(){init().catch(function(error){
        console.warn('Recipe unavailable',error);byId('foodError').textContent='Не удалось загрузить рецепт. Обновите страницу или откройте общую подборку.';
    });});
})();
