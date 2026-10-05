#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import hashlib, json, re, unicodedata
from jsonschema import Draft202012Validator

ROOT=Path(__file__).resolve().parents[1]
GEN=ROOT/'data/generated'; SCHEMA=ROOT/'data/schema'
SNAPSHOT=SCHEMA/'library_source_snapshot.json'; MANIFEST=ROOT/'data/library_sources/source_manifest.json'
RIGHTS=ROOT/'data/library_sources/rights_taxonomy.json'; SCRIPTURE=ROOT/'data/library_sources/scripture_catalog_azbyka_2026-10-05.json'
CLEARED=ROOT/'data/library_sources/rights_cleared_assets_2026-10-05.json'; READINGS=GEN/'readings.json'; FEASTS=GEN/'feasts.json'; SAINTS=GEN/'saints.json'

def read(path:Path): return json.loads(path.read_text(encoding='utf-8-sig'))
def write(path:Path,payload): path.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(path:Path)->str: return hashlib.sha256(path.read_bytes()).hexdigest()
def canonical_hash(payload)->str: return hashlib.sha256(json.dumps(payload,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def stable(prefix:str,*parts:object)->str: return prefix+hashlib.sha256('\x1f'.join(map(str,parts)).encode()).hexdigest()[:20]

def normalize_alias(value:object)->str:
    text=unicodedata.normalize('NFKC',str(value or '')).casefold().replace('ё','е')
    return re.sub(r'[^0-9a-zа-я]+',' ',text,flags=re.IGNORECASE).strip()

def validate_aliases(values:list, label:str)->None:
    normalized=[normalize_alias(x) for x in values]
    if any(not x for x in normalized) or len(normalized)!=len(set(normalized)):
        raise SystemExit('library normalized alias duplicate/empty: '+label)

def validate(payload,schema_name:str)->None:
    schema=read(SCHEMA/schema_name)
    issues=sorted(Draft202012Validator(schema).iter_errors(payload),key=lambda e:list(e.path))
    if issues:
        lines=[]
        for issue in issues[:20]:
            where='.'.join(map(str,issue.path)) or '<root>'; lines.append(f'{where}: {issue.message}')
        raise SystemExit(f'library schema validation failed: {schema_name}\n - '+'\n - '.join(lines))

def verify_snapshot()->str:
    snapshot=read(SNAPSHOT); errors=[]
    for row in snapshot.get('files',[]):
        path=ROOT/row['path']
        if not path.is_file(): errors.append('missing '+row['path']); continue
        if path.stat().st_size!=row['size']: errors.append('size '+row['path'])
        if sha(path)!=row['sha256']: errors.append('sha '+row['path'])
    if errors: raise SystemExit('library source snapshot mismatch: '+', '.join(errors))
    return canonical_hash(snapshot)

def source_record(provider:str,source_id:str,source_file:str,source_url:str,source_row=None,**extra):
    row={'provider':provider,'source_id':source_id,'source_file':source_file,'source_url':source_url}
    if source_row is not None: row['source_row']=source_row
    row.update(extra); return row

def local_text(row:dict,asset:dict)->None:
    if row['storage_mode']!='local_text': return
    source_path=ROOT/row['local_source_file']; frozen=read(source_path)
    for key in ('key','content_path','content_sha256','content_size_bytes','source_revision','verified_on'):
        if frozen.get(key)!=row.get(key): raise SystemExit('local text source mismatch: '+row['key']+' '+key)
    if frozen.get('rights_status')!='open_license' or not (frozen.get('author_evidence_url') or frozen.get('work_rights_evidence_url')) or not frozen.get('source_header') or not frozen.get('completeness_scope'):
        raise SystemExit('local text evidence incomplete: '+row['key'])
    if frozen.get('source_url')!=row['source_url'] or not str(frozen.get('license_url') or '').startswith('https://creativecommons.org/licenses/by-sa/4.0/'):
        raise SystemExit('local text source/license mismatch: '+row['key'])
    blocks=frozen.get('blocks') or []
    if not blocks or any(x.get('kind') not in ('heading','paragraph') or not isinstance(x.get('text'),str) or not x['text'].strip() for x in blocks):
        raise SystemExit('local text empty/malformed blocks: '+row['key'])
    body=('\n\n'.join(x['text'] for x in blocks)+'\n').encode('utf-8')
    if len(body)!=row['content_size_bytes'] or hashlib.sha256(body).hexdigest()!=row['content_sha256']:
        raise SystemExit('local text checksum/size mismatch: '+row['key'])
    target=ROOT/row['content_path']; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(body)
    asset.update(content_path=row['content_path'],content_sha256=row['content_sha256'],content_size_bytes=row['content_size_bytes'])
    asset['source_records'][0].update(local_source_file=row['local_source_file'],source_revision=row['source_revision'],verified_on=row['verified_on'],completeness_scope=frozen['completeness_scope'],text_quality=frozen['text_quality'])

def build()->None:
    snapshot_hash=verify_snapshot()
    manifest=read(MANIFEST); validate(manifest,'library_source_manifest.schema.json')
    rights_source=read(RIGHTS); policies=rights_source.get('policies') or []
    for policy in policies: validate(policy,'library_rights_policy.schema.json')
    policy_by_key={p['key']:p for p in policies}
    if len(policy_by_key)!=len(policies): raise SystemExit('library rights taxonomy contains duplicate keys')

    scripture=read(SCRIPTURE); validate(scripture,'library_scripture_catalog.schema.json')
    if scripture.get('rights_status')!='metadata_only': raise SystemExit('M5.8.2 Scripture source must remain metadata_only')
    author_rows=scripture['authors']; work_rows=scripture['works']
    for row in author_rows: validate_aliases(row.get('aliases') or [], 'scripture author '+str(row.get('key')))
    author_keys=[x['key'] for x in author_rows]; work_keys=[x['key'] for x in work_rows]; prefixes=[x['citation_prefix'] for x in work_rows]
    if len(author_keys)!=len(set(author_keys)) or len(work_keys)!=len(set(work_keys)) or len(prefixes)!=len(set(prefixes)): raise SystemExit('M5.8.2 source catalog duplicate key/prefix')
    author_key_set=set(author_keys)
    for row in work_rows:
        if row['author_key'] is not None and row['author_key'] not in author_key_set: raise SystemExit('M5.8.2 unknown author key: '+row['author_key'])
        if bool(row['author_key'])!=bool(row['author_relation_type']): raise SystemExit('M5.8.2 author relation metadata incomplete: '+row['key'])

    cleared=read(CLEARED); validate(cleared,'library_rights_cleared_assets.schema.json')
    if len(cleared.get('text_records') or [])!=19 or len(cleared.get('life_records') or [])!=5 or len(cleared.get('media_records') or [])!=2 or len(cleared.get('relations') or [])!=1:
        raise SystemExit('Library rights-cleared source coverage mismatch')
    text_keys=[row['key'] for row in cleared['text_records']+cleared['life_records']]
    if len(set(text_keys))!=len(text_keys): raise SystemExit('Library duplicate textual source key')
    for row in cleared['text_records']:
        if row.get('author_key'): validate_aliases(row.get('author_aliases') or [], 'text author '+str(row.get('author_key')))
    for row in cleared['life_records']:
        if row['rights_status']!='public_domain_verified' or not row.get('rights_evidence_url'): raise SystemExit('M5.10.2 life rights contract mismatch: '+row['key'])
    for row in cleared['media_records']:
        policy=policy_by_key.get(row['rights_status'])
        if not policy or not row.get('rights_evidence_url'): raise SystemExit('M5.8.3 media lacks rights evidence: '+row['key'])
        if row['rights_status']=='open_license' and not row.get('license_url'): raise SystemExit('M5.8.3 open-license media missing license URL: '+row['key'])
    for row in cleared['text_records']:
        if row['rights_status'] not in ('public_domain_verified','open_license','external_link_only') or not row.get('rights_evidence_url'): raise SystemExit('Library text rights contract mismatch: '+row['key'])
        if row['storage_mode']=='local_text' and not policy_by_key[row['rights_status']]['local_text_allowed']: raise SystemExit('Library local text rights forbidden: '+row['key'])

    sources=[{k:p.get(k) for k in ('provider','label','source_file','source_section','mode','trust_layer','verification_status','jurisdiction','rights_scope','notes')} for p in manifest['providers']]
    scripture_url=scripture['source_url']; scripture_provider=scripture['provider']

    authors=[]; author_by_key={}
    for i,row in enumerate(author_rows,1):
        aid=stable('pm-author-',scripture_provider,row['key']); slug=row['key']
        rec={'id':aid,'slug':slug,'display_name':row['display_name'],'summary':'Библиографическая персона для проверенных записей православной библиотеки; историко-критические вопросы авторства здесь не выводятся автоматически.','canonical_path':f'library.html?author={slug}','aliases':row['aliases'],'trust_layer':'editorial','verification_status':'source_verified','source_records':[source_record(scripture_provider,'author:'+row['key'],'data/library_sources/scripture_catalog_azbyka_2026-10-05.json',scripture_url,i)]}
        validate(rec,'library_author.schema.json'); authors.append(rec); author_by_key[row['key']]=rec

    works=[]; editions=[]; work_by_prefix={}; edition_by_work={}; work_by_source_key={}
    for i,row in enumerate(work_rows,1):
        wid=stable('pm-work-',scripture_provider,row['key']); slug='scripture-'+row['key']
        rec={'id':wid,'slug':slug,'title':row['title'],'work_type':'scripture','summary':'Книга Священного Писания в библиографическом каталоге ПМ. На этом этапе хранится только metadata/provenance; полный текст локально не копируется.','original_language':None,'canonical_path':f'library/item.html?slug={slug}','rights_status':'metadata_only','aliases':[row['citation_prefix'],row['title']],'trust_layer':'editorial','verification_status':'source_verified','source_records':[source_record(scripture_provider,'work:'+row['key'],'data/library_sources/scripture_catalog_azbyka_2026-10-05.json',scripture_url,i)]}
        validate(rec,'library_work.schema.json'); works.append(rec); work_by_prefix[row['citation_prefix']]=rec
        eid=stable('pm-edition-',scripture_provider,row['key'],'synodal')
        ed={'id':eid,'work_ref':wid,'title':scripture['translation_label']+' — '+row['title'],'language':'ru','publisher':None,'publication_year':None,'identifiers':{'translation':'synodal','scripture_abbreviation':row['citation_prefix'],'external_catalog_url':scripture_url},'rights_status':'metadata_only','trust_layer':'editorial','verification_status':'source_verified','source_records':[source_record(scripture_provider,'edition:'+row['key']+':synodal','data/library_sources/scripture_catalog_azbyka_2026-10-05.json',scripture_url,i)]}
        validate(ed,'library_edition.schema.json'); editions.append(ed); edition_by_work[wid]=ed

    relations=[]
    for i,row in enumerate(work_rows,1):
        if not row['author_key']: continue
        work=work_by_prefix[row['citation_prefix']]; author=author_by_key[row['author_key']]
        rel={'id':stable('pm-library-rel-',row['author_relation_type'],work['id'],author['id']),'relation_type':row['author_relation_type'],'from':{'kind':'work','id':work['id']},'to':{'kind':'author','id':author['id']},'trust_layer':'editorial','verification_status':'source_verified','source_records':[source_record(scripture_provider,'authorship:'+row['key'],'data/library_sources/scripture_catalog_azbyka_2026-10-05.json',scripture_url,i)]}
        validate(rel,'library_relation.schema.json'); relations.append(rel)

    reading_payload=read(READINGS); readings=reading_payload.get('readings') or []; scripture_refs=[]; mapped_prefixes=set()
    for reading in readings:
        citation=str(reading.get('citation') or ''); prefix=next((p for p in prefixes if citation.startswith(p)),None)
        if prefix is None: raise SystemExit('M5.8.2 unmapped verified Scripture citation: '+citation)
        mapped_prefixes.add(prefix); work=work_by_prefix[prefix]; edition=edition_by_work[work['id']]; original_sources=reading.get('source_records') or []
        if not original_sources: raise SystemExit('M5.8.2 reading lacks provenance: '+reading['id'])
        day_url=str(original_sources[0].get('source_url') or ''); records=[source_record(scripture_provider,'bridge:'+prefix,'data/library_sources/scripture_catalog_azbyka_2026-10-05.json',scripture_url)]+original_sources
        ref={'id':stable('pm-scripture-ref-',reading['id'],work['id'],citation),'reading_ref':reading['id'],'work_ref':work['id'],'edition_ref':edition['id'],'date':reading['date'],'citation':citation,'canonical_path':reading['canonical_path'],'external_url':day_url or scripture_url,'trust_layer':'editorial','verification_status':'source_verified_bridge','source_records':records}
        validate(ref,'library_scripture_reference.schema.json'); scripture_refs.append(ref)
        rel={'id':stable('pm-library-rel-','scripture_citation_of',reading['id'],work['id']),'relation_type':'scripture_citation_of','from':{'kind':'reading','id':reading['id']},'to':{'kind':'work','id':work['id']},'trust_layer':'editorial','verification_status':'source_verified_bridge','source_records':records}
        validate(rel,'library_relation.schema.json'); relations.append(rel)
    if mapped_prefixes!=set(prefixes) or len(scripture_refs)!=len(readings): raise SystemExit('M5.8.2 Scripture bridge coverage mismatch')

    text_assets=[]; media_assets=[]
    text_provider='wikisource-public-domain-2026-10-05'; media_provider='wikimedia-commons-rights-2026-10-05'; source_file='data/library_sources/rights_cleared_assets_2026-10-05.json'
    text_author_by_key={}
    for i,row in enumerate(cleared['text_records'],1):
        verification='source_verified' if row['rights_status']=='external_link_only' else 'rights_verified'
        akey=row['author_key']; aid=None
        source_extra={'rights_evidence_url':row['rights_evidence_url']}
        if row.get('classification_evidence_url'):
            source_extra.update(classification_evidence_url=row['classification_evidence_url'],classification_evidence_summary=row.get('classification_evidence_summary'))
        if akey:
            aslug=akey; author=text_author_by_key.get(akey)
            if author is None:
                aid=stable('pm-author-',text_provider,akey)
                author={'id':aid,'slug':aslug,'display_name':row['author_name'],'summary':'Автор source-verified public-domain произведений; запись создана из frozen rights evidence.','canonical_path':f'library.html?author={aslug}','aliases':row['author_aliases'],'trust_layer':'editorial','verification_status':'rights_verified','source_records':[source_record(text_provider,'author:'+akey,source_file,row['source_url'],i,rights_evidence_url=row['rights_evidence_url'])]}
                validate(author,'library_author.schema.json'); authors.append(author); author_by_key[akey]=author; text_author_by_key[akey]=author
            else:
                if author['display_name']!=row['author_name'] or set(author['aliases'])!=set(row['author_aliases']):
                    raise SystemExit('text expansion author identity mismatch: '+akey)
                aid=author['id']
        wid=stable('pm-work-',text_provider,row['key']); slug='work-'+row['key']
        if row['storage_mode']=='local_text' and row['work_type'] in ('prayer','liturgy','hymnography'):
            summary='Молитвенный, богослужебный или гимнографический текст с полной выбранной локальной электронной редакцией и закреплённым источником. Транскрипция не проходила независимую критическую выверку.'
        else:
            summary='Богословское произведение с полной локальной электронной публикацией и сохранённым источником. Транскрипция не проходила независимую критическую выверку.' if row['storage_mode']=='local_text' else ('Произведение доступно по внешней ссылке. Права точной электронной редакции требуют проверки; локальная копия не включается.' if verification=='source_verified' else 'Произведение с подтверждённым внешним текстовым источником; локальная копия пока не включается.')
        work={'id':wid,'slug':slug,'title':row['title'],'work_type':row['work_type'],'summary':summary,'original_language':row['language'],'canonical_path':f'library/item.html?slug={slug}','rights_status':row.get('work_rights_status',row['rights_status']),'aliases':[row['title']],'trust_layer':'editorial','verification_status':verification,'source_records':[source_record(text_provider,'work:'+row['key'],source_file,row['source_url'],i,**source_extra)]}
        validate(work,'library_work.schema.json'); works.append(work); work_by_source_key[row['key']]=work
        eid=stable('pm-edition-',text_provider,row['key'],'wikisource')
        edition={'id':eid,'work_ref':wid,'title':row['edition_title'],'language':row['language'],'publisher':row['publisher'],'publication_year':row['publication_year'],'identifiers':{'external_catalog_url':row['source_url']},'rights_status':row['rights_status'],'trust_layer':'editorial','verification_status':verification,'source_records':[source_record(text_provider,'edition:'+row['key'],source_file,row['source_url'],i,**source_extra)]}
        validate(edition,'library_edition.schema.json'); editions.append(edition); edition_by_work[wid]=edition
        tid=stable('pm-text-',text_provider,row['key'],'full_text')
        asset={'id':tid,'work_ref':wid,'edition_ref':eid,'asset_kind':row['asset_kind'],'language':row['language'],'storage_mode':row['storage_mode'],'content_path':None,'external_url':row['external_url'],'rights_status':row['rights_status'],'license_url':row['license_url'],'copyright_notice':row['copyright_notice'],'trust_layer':'editorial','verification_status':verification,'source_records':[source_record(text_provider,'text:'+row['key'],source_file,row['source_url'],i,**source_extra)]}
        local_text(row,asset)
        validate(asset,'library_text_asset.schema.json'); text_assets.append(asset)
        relation_rows=[('full_text_of','text_asset',tid,'work',wid,'text-work:'+row['key'])]
        if aid:
            relation_rows.insert(0,('author_attribution','work',wid,'author',aid,'authorship:'+row['key']))
        for relation_type,from_kind,from_id,to_kind,to_id,sid in relation_rows:
            rel={'id':stable('pm-library-rel-',relation_type,from_id,to_id),'relation_type':relation_type,'from':{'kind':from_kind,'id':from_id},'to':{'kind':to_kind,'id':to_id},'trust_layer':'editorial','verification_status':verification,'source_records':[source_record(text_provider,sid,source_file,row['source_url'],i,**source_extra)]}
            validate(rel,'library_relation.schema.json'); relations.append(rel)


    saint_by_id={x['id']:x for x in (read(SAINTS).get('saints') or [])}
    for i,row in enumerate(cleared['life_records'],1):
        wid=stable('pm-work-',text_provider,row['key']); slug='work-'+row['key']
        work={'id':wid,'slug':slug,'title':row['title'],'work_type':'life','summary':'Source-verified hagiographic work linked only to explicit canonical saint IDs from the frozen source record; the external public-domain text is not copied into the release.','original_language':'ru','canonical_path':f'library/item.html?slug={slug}','rights_status':row['rights_status'],'aliases':[row['title']],'trust_layer':'editorial','verification_status':'rights_verified','source_records':[source_record(text_provider,'work:'+row['key'],source_file,row['source_url'],i,rights_evidence_url=row['rights_evidence_url'])]}
        validate(work,'library_work.schema.json'); works.append(work); work_by_source_key[row['key']]=work
        eid=stable('pm-edition-',text_provider,row['key'],'wikisource')
        edition={'id':eid,'work_ref':wid,'title':row['edition_title'],'language':row['language'],'publisher':row['publisher'],'publication_year':row['publication_year'],'identifiers':{'external_catalog_url':row['source_url']},'rights_status':row['rights_status'],'trust_layer':'editorial','verification_status':'rights_verified','source_records':[source_record(text_provider,'edition:'+row['key'],source_file,row['source_url'],i,rights_evidence_url=row['rights_evidence_url'])]}
        validate(edition,'library_edition.schema.json'); editions.append(edition); edition_by_work[wid]=edition
        tid=stable('pm-text-',text_provider,row['key'],'full_text')
        asset={'id':tid,'work_ref':wid,'edition_ref':eid,'asset_kind':row['asset_kind'],'language':row['language'],'storage_mode':row['storage_mode'],'content_path':None,'external_url':row['external_url'],'rights_status':row['rights_status'],'license_url':row['license_url'],'copyright_notice':row['copyright_notice'],'trust_layer':'editorial','verification_status':'rights_verified','source_records':[source_record(text_provider,'text:'+row['key'],source_file,row['source_url'],i,rights_evidence_url=row['rights_evidence_url'])]}
        validate(asset,'library_text_asset.schema.json'); text_assets.append(asset)
        rel={'id':stable('pm-library-rel-','full_text_of',tid,wid),'relation_type':'full_text_of','from':{'kind':'text_asset','id':tid},'to':{'kind':'work','id':wid},'trust_layer':'editorial','verification_status':'rights_verified','source_records':asset['source_records']}
        validate(rel,'library_relation.schema.json'); relations.append(rel)
        for saint_ref in row['saint_refs']:
            saint=saint_by_id.get(saint_ref['id'])
            if not saint or saint.get('name')!=saint_ref['label']:
                raise SystemExit('M5.10.2 explicit saint target mismatch: '+saint_ref['id'])
            rel={'id':stable('pm-library-rel-',saint_ref['relation_type'],wid,saint_ref['id']),'relation_type':saint_ref['relation_type'],'from':{'kind':'work','id':wid},'to':{'kind':'saint','id':saint_ref['id']},'trust_layer':'editorial','verification_status':'rights_verified','source_records':[source_record(text_provider,'life-saint:'+row['key']+':'+saint_ref['id'],source_file,row['source_url'],i,evidence=saint_ref['evidence'],rights_evidence_url=row['rights_evidence_url'])]}
            validate(rel,'library_relation.schema.json'); relations.append(rel)

    media_by_key={}
    for i,row in enumerate(cleared['media_records'],1):
        work_ref=None
        if row.get('work_key'):
            wid=stable('pm-work-',media_provider,row['work_key']); slug='work-'+row['work_key']
            work={'id':wid,'slug':slug,'title':row['work_title'],'work_type':row['work_type'],'summary':'Медиапроизведение/гимнографическая запись с проверенным внешним media asset; права конкретной записи подтверждены отдельно.','original_language':None,'canonical_path':f'library/item.html?slug={slug}','rights_status':'metadata_only','aliases':[row['work_title']],'trust_layer':'editorial','verification_status':'rights_verified','source_records':[source_record(media_provider,'work:'+row['work_key'],source_file,row['source_url'],i,rights_evidence_url=row['rights_evidence_url'])]}
            validate(work,'library_work.schema.json'); works.append(work); work_by_source_key[row['work_key']]=work; work_ref=wid
        mid=stable('pm-media-',media_provider,row['key'])
        asset={'id':mid,'title':row['title'],'media_kind':row['media_kind'],'work_ref':work_ref,'storage_mode':row['storage_mode'],'asset_path':None,'external_url':row['external_url'],'rights_status':row['rights_status'],'license_url':row['license_url'],'copyright_notice':row['copyright_notice'],'trust_layer':'editorial','verification_status':'rights_verified','source_records':[source_record(media_provider,'media:'+row['key'],source_file,row['source_url'],i,rights_evidence_url=row['rights_evidence_url'],source_sha1=row['source_sha1'],source_size=row['source_size'],source_creator=row['source_creator'])]}
        validate(asset,'library_media_asset.schema.json'); media_assets.append(asset); media_by_key[row['key']]=asset
        if work_ref:
            rel={'id':stable('pm-library-rel-','recording_of',mid,work_ref),'relation_type':'recording_of','from':{'kind':'media_asset','id':mid},'to':{'kind':'work','id':work_ref},'trust_layer':'editorial','verification_status':'rights_verified','source_records':asset['source_records']}
            validate(rel,'library_relation.schema.json'); relations.append(rel)

    feast_ids={x['id']:x for x in (read(FEASTS).get('feasts') or [])}
    for i,row in enumerate(cleared['relations'],1):
        media=media_by_key.get(row['from_media_key']); target=feast_ids.get(row['to_id']) if row['to_kind']=='feast' else None
        if not media: raise SystemExit('M5.8.3 relation media key unresolved: '+row['from_media_key'])
        if row['to_kind']=='feast' and (not target or target.get('title')!=row['target_label']): raise SystemExit('M5.8.3 explicit feast target mismatch: '+row['to_id'])
        rel={'id':stable('pm-library-rel-',row['relation_type'],media['id'],row['to_id']),'relation_type':row['relation_type'],'from':{'kind':'media_asset','id':media['id']},'to':{'kind':row['to_kind'],'id':row['to_id']},'trust_layer':'editorial','verification_status':'rights_verified','source_records':[source_record(media_provider,'relation:'+row['key'],source_file,media['external_url'],i,evidence=row['evidence'],rights_evidence_url=(media.get('source_records') or [{}])[0].get('rights_evidence_url'))]}
        validate(rel,'library_relation.schema.json'); relations.append(rel)

    review=[]; rejected=[]
    counts={'sources':len(sources),'rights_policies':len(policies),'authors':len(authors),'works':len(works),'editions':len(editions),'scripture_references':len(scripture_refs),'text_assets':len(text_assets),'media_assets':len(media_assets),'relations':len(relations),'review_queue':0,'rejected':0}
    payloads={
      'library_sources.json':{'schema_version':'1.2.0','source_snapshot_sha256':snapshot_hash,'count':len(sources),'sources':sources},
      'library_rights.json':{'schema_version':'1.0.0','source_snapshot_sha256':snapshot_hash,'count':len(policies),'policies':policies},
      'library_authors.json':{'schema_version':'1.2.0','source_snapshot_sha256':snapshot_hash,'count':len(authors),'authors':authors},
      'library_works.json':{'schema_version':'1.2.0','source_snapshot_sha256':snapshot_hash,'count':len(works),'works':works},
      'library_editions.json':{'schema_version':'1.2.0','source_snapshot_sha256':snapshot_hash,'count':len(editions),'editions':editions},
      'library_scripture_references.json':{'schema_version':'1.0.0','source_snapshot_sha256':snapshot_hash,'count':len(scripture_refs),'scripture_references':scripture_refs},
      'library_text_assets.json':{'schema_version':'1.2.0','source_snapshot_sha256':snapshot_hash,'count':len(text_assets),'text_assets':text_assets},
      'library_media_assets.json':{'schema_version':'1.1.0','source_snapshot_sha256':snapshot_hash,'count':len(media_assets),'media_assets':media_assets},
      'library_relations.json':{'schema_version':'1.2.0','source_snapshot_sha256':snapshot_hash,'count':len(relations),'relations':relations},
      'library_review_queue.json':{'schema_version':'1.0.0','source_snapshot_sha256':snapshot_hash,'count':0,'items':review},
      'library_rejected.json':{'schema_version':'1.0.0','source_snapshot_sha256':snapshot_hash,'count':0,'items':rejected},
      'library_index.json':{'schema_version':'1.2.0','source_snapshot_sha256':snapshot_hash,'counts':counts,'rights_by_key':{p['key']:i for i,p in enumerate(policies)},'work_by_slug':{x['slug']:x['id'] for x in works},'author_by_slug':{x['slug']:x['id'] for x in authors},'work_by_citation_prefix':{p:work_by_prefix[p]['id'] for p in prefixes},'scripture_by_reading':{x['reading_ref']:x['id'] for x in scripture_refs},'text_assets_by_work':{x['work_ref']:[y['id'] for y in text_assets if y['work_ref']==x['work_ref']] for x in text_assets},'media_assets_by_work':{w['id']:[x['id'] for x in media_assets if x.get('work_ref')==w['id']] for w in works if any(x.get('work_ref')==w['id'] for x in media_assets)}},
      'library_report.json':{'schema_version':'1.2.0','source_snapshot_sha256':snapshot_hash,'canonical_works_created':len(works),'canonical_authors_created':len(authors),'canonical_editions_created':len(editions),'scripture_references_created':len(scripture_refs),'explicit_relations_created':len(relations),'rights_cleared_text_assets_created':sum(x['rights_status'] in ('public_domain_verified','open_license','permission_granted') for x in text_assets),'rights_cleared_media_assets_created':len(media_assets),'local_text_assets_created':sum(x['storage_mode']=='local_text' for x in text_assets),'local_media_assets_created':0,'full_protected_texts_copied':0,'unlicensed_local_assets_created':0,'inferred_relations_created':0,'organisation_entities_created':0,'notes':['M5.10.7 closes the current Library/Knowledge engineering gate without adding canonical works, assets or relations.','Stable IDs and rights boundaries are preserved; normalized author aliases are validated at the frozen-source/build boundary to prevent search-equivalent duplicates.','The Philaret Longer Catechism exact electronic asset remains external-link-only while the historical work remains public-domain; prior rights assessment stays in audit evidence.','All existing saint/Scripture/media relations remain explicit and unchanged; no inferred place/feast/organisation links are created.']}
    }
    for name,payload in payloads.items(): write(GEN/name,payload)
    print('library sources=%d rights=%d authors=%d works=%d editions=%d scripture_refs=%d text=%d media=%d relations=%d review=0 rejected=0' % (len(sources),len(policies),len(authors),len(works),len(editions),len(scripture_refs),len(text_assets),len(media_assets),len(relations)))

if __name__=='__main__': build()
