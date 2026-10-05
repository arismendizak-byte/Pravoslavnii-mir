(function(global){
'use strict';
const scriptUrl=(function(){
  if(global.__PRAVMIR_FOOD_LAYER_URL__) return new URL(global.__PRAVMIR_FOOD_LAYER_URL__, global.location&&global.location.href?global.location.href:undefined);
  if(global.document&&global.document.currentScript&&global.document.currentScript.src) return new URL(global.document.currentScript.src);
  const href=global.location&&global.location.href?global.location.href:'http://localhost/index.html';
  return new URL('js/food-layer.js',href);
})();
const baseUrl=new URL('../data/generated/',scriptUrl).href;
let corePromise=null;
function fetchJson(name){return fetch(new URL(name,baseUrl).href).then(function(r){if(!r.ok)throw new Error('PravmirFood: failed to load '+name+' ('+r.status+')');return r.json();});}
function assertPayload(payload,hash,key,name){if(!payload||payload.source_snapshot_sha256!==hash||!Array.isArray(payload[key]))throw new Error('PravmirFood: invalid '+name);if(payload.count!==payload[key].length)throw new Error('PravmirFood: count mismatch '+name);}
async function loadCore(){
  if(corePromise)return corePromise;
  corePromise=Promise.all([fetchJson('recipe_records.json'),fetchJson('food_relations.json'),fetchJson('food_index.json'),fetchJson('food_report.json')]).then(function(parts){
    const recipes=parts[0],relations=parts[1],index=parts[2],report=parts[3],hash=index&&index.source_snapshot_sha256;
    if(!hash||!report||report.source_snapshot_sha256!==hash)throw new Error('PravmirFood: snapshot mismatch');
    assertPayload(recipes,hash,'recipes','recipe_records.json'); assertPayload(relations,hash,'relations','food_relations.json');
    const byId=new Map(recipes.recipes.map(function(x){return[x.id,x]}));
    const bySlug=new Map(Object.keys(index.by_slug||{}).map(function(slug){return[slug,index.by_slug[slug]]}));
    const relByRecipe=new Map(),relByTarget=new Map();
    relations.relations.forEach(function(rel){
      if(!relByRecipe.has(rel.from.id))relByRecipe.set(rel.from.id,[]); relByRecipe.get(rel.from.id).push(rel);
      const key=rel.to.kind+':'+rel.to.id; if(!relByTarget.has(key))relByTarget.set(key,[]); relByTarget.get(key).push(rel);
    });
    return{recipes:recipes.recipes,relations:relations.relations,index,report,sourceHash:hash,byId,bySlug,relByRecipe,relByTarget};
  }).catch(function(e){corePromise=null;throw e});
  return corePromise;
}
function norm(v){return String(v||'').trim().toLocaleLowerCase('ru-RU');}
function limit(v){const n=Number(v);return Number.isFinite(n)?Math.max(1,Math.min(1000,Math.floor(n))):100;}
async function getStats(){const c=await loadCore();return{recipes:c.index.counts.recipes,relations:c.index.counts.relations,fasting_rules_linked:c.index.counts.fasting_rules_linked,feasts_linked:c.index.counts.feasts_linked||0,source_snapshot_sha256:c.sourceHash,disclaimer:c.report.disclaimer};}
async function getRecipes(options){const c=await loadCore(),o=options||{},q=norm(o.q),type=String(o.type||''),fasting=String(o.fasting||''),oil=String(o.oil_mode||'');return c.recipes.filter(function(x){if(type&&x.recipe_type!==type)return false;if(fasting&&x.fasting_compatibility.classification!==fasting)return false;if(oil&&x.fasting_compatibility.oil_mode!==oil)return false;if(q){const hay=norm([x.title,x.summary,(x.tags||[]).join(' '),(x.ingredients||[]).map(i=>i.name).join(' ')].join(' '));if(!hay.includes(q))return false;}return true;}).slice(0,limit(o.limit));}
async function getById(id){const c=await loadCore();return c.byId.get(String(id||''))||null;}
async function getBySlug(slug){const c=await loadCore(),id=c.bySlug.get(String(slug||''));return id?c.byId.get(id)||null:null;}
async function getRelations(recipeId){const c=await loadCore();return(c.relByRecipe.get(String(recipeId||''))||[]).slice();}
async function getForFastingRule(ruleId){const c=await loadCore(),rels=c.relByTarget.get('fasting_rule:'+String(ruleId||''))||[],seen=new Set(),out=[];rels.forEach(function(rel){const row=c.byId.get(rel.from.id);if(row&&!seen.has(row.id)){seen.add(row.id);out.push(row);}});return out;}
async function getForFeast(feastId){const c=await loadCore(),rels=c.relByTarget.get('feast:'+String(feastId||''))||[],seen=new Set(),out=[];rels.forEach(function(rel){const row=c.byId.get(rel.from.id);if(row&&!seen.has(row.id)){seen.add(row.id);out.push(row);}});return out;}
async function getForDate(date){
  const result={date:String(date||''),fasting_rules:[],feasts:[],recipes:[],disclaimer:''};
  const stats=await getStats(); result.disclaimer=stats.disclaimer;
  if(!global.PravmirLiturgical||!global.PravmirLiturgical.getDayBundle)return result;
  const bundle=await global.PravmirLiturgical.getDayBundle(result.date); if(!bundle)return result;
  result.fasting_rules=bundle.items.filter(function(x){return x.kind==='fasting_rule';}).map(function(x){return x.item;});
  result.feasts=bundle.items.filter(function(x){return x.kind==='feast';}).map(function(x){return x.item;});
  const seen=new Set();
  for(const rule of result.fasting_rules){const rows=await getForFastingRule(rule.id);for(const row of rows){if(!seen.has(row.id)){seen.add(row.id);result.recipes.push(row);}}}
  for(const feast of result.feasts){const rows=await getForFeast(feast.id);for(const row of rows){if(!seen.has(row.id)){seen.add(row.id);result.recipes.push(row);}}}
  return result;
}
global.PravmirFood={version:'1.17.0',compatibility:['1.17.0'],init:getStats,getStats,getRecipes,getById,getBySlug,getRelations,getForFastingRule,getForFeast,getForDate};
})(typeof window!=='undefined'?window:globalThis);
