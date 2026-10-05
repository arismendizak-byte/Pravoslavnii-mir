#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import hashlib,json,re
from datetime import date
from jsonschema import Draft202012Validator
ROOT=Path(__file__).resolve().parents[1]; GEN=ROOT/'data/generated'; SCHEMA=ROOT/'data/schema'; SNAPSHOT=SCHEMA/'news_source_snapshot.json'; MANIFEST=ROOT/'data/news_sources/source_manifest.json'
MONTHS={'января':1,'февраля':2,'марта':3,'апреля':4,'мая':5,'июня':6,'июля':7,'августа':8,'сентября':9,'октября':10,'ноября':11,'декабря':12}
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def stable(prefix,*parts):return prefix+hashlib.sha256('\x1f'.join(map(str,parts)).encode()).hexdigest()[:20]
def chash(x):return hashlib.sha256(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def slug(v):
 s=str(v or '').lower();s=re.sub(r'[^a-z0-9]+','-',s).strip('-');return s or 'news'
def verify_snapshot():
 snap=read(SNAPSHOT);errs=[]
 for it in snap.get('files',[]):
  p=ROOT/it['path']
  if not p.is_file():errs.append('missing '+it['path']);continue
  if p.stat().st_size!=it['size']:errs.append('size '+it['path'])
  if sha(p)!=it['sha256']:errs.append('sha '+it['path'])
 if errs:raise SystemExit('news source snapshot mismatch: '+', '.join(errs))
 return chash(snap)
def parse_ru_date(v):
 m=re.fullmatch(r'\s*(\d{1,2})\s+([а-яё]+)\s+(\d{4})\s*',str(v or '').lower())
 if not m or m.group(2) not in MONTHS:return None
 try:return date(int(m.group(3)),MONTHS[m.group(2)],int(m.group(1))).isoformat()
 except ValueError:return None
def validate(payload,name):
 issues=sorted(Draft202012Validator(read(SCHEMA/name)).iter_errors(payload),key=lambda e:list(e.path))
 if issues:raise SystemExit('news schema validation failed: '+name+'\n - '+'\n - '.join('.'.join(map(str,e.path))+': '+e.message for e in issues[:20]))
def content_bridge():
 out={}
 for row in read(GEN/'content_items.json').get('items',[]):
  if row.get('content_type')!='news':continue
  for src in row.get('source_records') or []:
   if src.get('provider')=='pravmir-legacy-journalpp' and isinstance(src.get('source_row'),int):out[src['source_row']]=row.get('id')
 return out
def source_rec(provider,file,sid,row,url):return {'provider':provider,'source_id':sid,'source_file':file,'source_row':row,'source_url':url,'migrated_from':None}
def build():
 h=verify_snapshot();manifest=read(MANIFEST);validate(manifest,'news_source_manifest.schema.json');bridge=content_bridge();review=[];rejected=[];canonical=[];relations=[];sources=[]; _places=read(GEN/'places_deduped.json'); place_rows=_places if isinstance(_places,list) else _places.get('places',[]); place_ids={str(x.get('id') or '') for x in place_rows}
 for prov in manifest['providers']:
  sources.append({k:prov.get(k) for k in ['provider','label','mode','trust_layer','verification_status','jurisdiction','origin_url','notes']})
  raw=read(ROOT/prov['source_file']);rows=raw.get(prov['source_section'],[])
  if prov['mode']=='review_only':
   for i,row in enumerate(rows,1):
    item={'id':stable('pm-news-review-',prov['provider'],i,row.get('link')),'title':str(row.get('title') or '').strip(),'summary':str(row.get('description') or '').strip(),'published_on':parse_ru_date(row.get('date')),'source_url':str(row.get('link') or '').strip(),'publisher_text':'Православный паломник','trust_layer':'legacy_unverified','verification_status':'legacy_unverified','review_status':'needs_source_verification','legacy_content_ref':bridge.get(i),'source_records':[{'provider':prov['provider'],'source_id':f'news:{i}','source_file':prov['source_file'],'source_row':i,'source_url':str(row.get('link') or '').strip(),'migrated_from':raw.get('migrated_from')}]}
    try:
     validate(item,'news_review_item.schema.json')
     if not item['source_url'].startswith('https://'):raise ValueError('source_url must use https')
     review.append(item)
    except Exception as exc:rejected.append({'source_row':i,'title':item['title'],'reason':str(exc)})
  elif prov['mode']=='canonical_source':
   observed=str(raw.get('observed_at') or '')
   for i,row in enumerate(rows,1):
    sid=str(row.get('source_id') or '').strip();nid=stable('pm-news-',prov['provider'],sid); sl='news-'+slug(sid)+'-'+nid[-8:]
    rec={'id':nid,'slug':sl,'title':str(row.get('title') or '').strip(),'summary':str(row.get('summary') or '').strip(),'status':str(row.get('status') or 'published'),'published_at':str(row.get('published_at') or ''),'updated_at':row.get('updated_at'),'canonical_path':f'news/item.html?slug={sl}','original_url':str(row.get('original_url') or ''),'publisher':str(row.get('publisher') or '').strip(),'trust_layer':'editorial','verification_status':'source_verified','freshness':{'observed_at':observed,'verified_at':observed,'valid_from':None,'valid_to':None,'expires_at':None},'source_records':[source_rec(prov['provider'],prov['source_file'],sid,i,str(row.get('original_url') or ''))]}
    validate(rec,'news_record.schema.json')
    if not rec['original_url'].startswith('https://'):raise SystemExit('canonical news source URL must use https')
    canonical.append(rec)
    place_ref=str(row.get('place_ref') or '').strip()
    if place_ref:
     if place_ref not in place_ids: raise SystemExit('news explicit place_ref missing: '+place_ref)
     rtype=str(row.get('relation_type') or 'about_place')
     rel={'id':stable('pm-news-rel-',prov['provider'],sid,rtype,place_ref),'relation_type':rtype,'from':{'kind':'news','id':nid},'to':{'kind':'place','id':place_ref},'trust_layer':'editorial','verification_status':'source_verified','source_records':rec['source_records']}
     validate(rel,'news_relation.schema.json'); relations.append(rel)
 review.sort(key=lambda x:(x.get('published_on') or '',x['id']),reverse=True);canonical.sort(key=lambda x:x['published_at'],reverse=True)
 by_year={}
 for x in review:
  y=(x.get('published_on') or '')[:4]
  if y:by_year.setdefault(y,[]).append(x['id'])
 by_slug={x['slug']:x['id'] for x in canonical};by_id={x['id']:i for i,x in enumerate(canonical)}
 payloads={
 'news_sources.json':{'schema_version':'1.0.0','source_snapshot_sha256':h,'count':len(sources),'sources':sources},
 'news_records.json':{'schema_version':'1.0.0','source_snapshot_sha256':h,'count':len(canonical),'news':canonical},
 'news_relations.json':{'schema_version':'1.0.0','source_snapshot_sha256':h,'count':len(relations),'relations':relations},
 'news_review_queue.json':{'schema_version':'1.0.0','source_snapshot_sha256':h,'count':len(review),'items':review},
 'news_rejected.json':{'schema_version':'1.0.0','source_snapshot_sha256':h,'count':len(rejected),'items':rejected},
 'news_index.json':{'schema_version':'1.0.0','source_snapshot_sha256':h,'counts':{'sources':len(sources),'news':len(canonical),'relations':len(relations),'review_queue':len(review),'rejected':len(rejected)},'review_by_year':by_year,'news_by_slug':by_slug,'news_by_id':by_id},
 'news_report.json':{'schema_version':'1.0.0','source_snapshot_sha256':h,'legacy_rows_seen':len(review)+len(rejected),'legacy_review_items':len(review),'canonical_news_created':len(canonical),'canonical_relations_created':len(relations),'source_verified_news':len(canonical),'inferred_relations_created':0,'organisation_entities_created':0,'rejected':len(rejected),'notes':['Canonical News is built only from manually verified official-source records.','Legacy Journal news remains review-only and is excluded from canonical consumers.','Relations are explicit source-evidence bindings only; no text matching or inferred organisation facts are used.']}}
 for n,p in payloads.items():write(GEN/n,p)
 print(f'news sources={len(sources)} canonical={len(canonical)} relations={len(relations)} review={len(review)} rejected={len(rejected)}')
if __name__=='__main__':build()
