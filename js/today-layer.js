(function (global) {
    'use strict';

    function normalizeDate(value) {
        if (global.PravmirLiturgical && global.PravmirLiturgical.normalizeDate) return global.PravmirLiturgical.normalizeDate(value);
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return match ? match[0] : null;
    }

    function uniqueById(rows) {
        const seen = new Set();
        return rows.filter(function (row) {
            if (!row || !row.id || seen.has(row.id)) return false;
            seen.add(row.id);
            return true;
        });
    }

    async function relatedContentFor(items) {
        if (!global.PravmirContent || !global.PravmirContent.getRelated) return [];
        const refs = items
            .filter(function (entry) { return ['feast', 'saint', 'commemoration'].includes(entry.kind); })
            .map(function (entry) { return { kind: entry.kind, id: entry.item.id }; });
        const collected = [];
        for (const ref of refs) {
            const related = await global.PravmirContent.getRelated(ref);
            related.forEach(function (row) {
                const resolved = row && row.resolved && row.resolved.kind === 'content' && row.resolved.item ? row.resolved.item : (row && row.resolved);
                if (row && row.target && row.target.kind === 'content' && resolved && resolved.status === 'published') {
                    collected.push(resolved);
                }
            });
        }
        return uniqueById(collected);
    }

    async function nearestReadingAfter(date) {
        if (!global.PravmirLiturgical || !global.PravmirLiturgical.getRecords) return null;
        const rows = await global.PravmirLiturgical.getRecords('reading');
        const future = rows.filter(function (row) { return row.date && row.date > date; })
            .sort(function (a, b) { return a.date.localeCompare(b.date) || String(a.title || '').localeCompare(String(b.title || ''), 'ru'); });
        if (!future.length) return null;
        const nearestDate = future[0].date;
        return { date: nearestDate, readings: future.filter(function (row) { return row.date === nearestDate; }) };
    }

    async function getSnapshot(value) {
        const date = normalizeDate(value);
        if (!date) throw new Error('PravmirToday: invalid date');
        if (!global.PravmirLiturgical || !global.PravmirContent || !global.PravmirEvents || !global.PravmirFood || !global.PravmirNews || !global.PravmirLibrary) {
            throw new Error('PravmirToday: required domain layer missing');
        }

        await Promise.all([
            global.PravmirLiturgical.init(),
            global.PravmirContent.init(),
            global.PravmirEvents.init(),
            global.PravmirFood.init(),
            global.PravmirNews.init(),
            global.PravmirLibrary.init()
        ]);

        const bundle = await global.PravmirLiturgical.getDayBundle(date);
        const items = bundle ? bundle.items.slice() : [];
        const readings = items.filter(function (row) { return row.kind === 'reading'; }).map(function (row) { return row.item; });
        const feasts = items.filter(function (row) { return row.kind === 'feast'; }).map(function (row) { return row.item; });
        const directSaints = items.filter(function (row) { return row.kind === 'saint'; }).map(function (row) { return row.item; });
        const commemorations = items.filter(function (row) { return row.kind === 'commemoration'; }).map(function (row) { return row.item; });
        const saintMap = new Map(directSaints.map(function (row) { return [row.id, row]; }));
        for (const commemoration of commemorations) {
            const relations = await global.PravmirLiturgical.getRelations({ kind: 'commemoration', id: commemoration.id });
            for (const relation of relations) {
                if (relation.relation_type !== 'commemorates' || !relation.from || relation.from.kind !== 'commemoration' || relation.from.id !== commemoration.id || !relation.to || relation.to.kind !== 'saint') continue;
                const saint = await global.PravmirLiturgical.resolveReference(relation.to);
                if (saint) saintMap.set(saint.id, saint);
            }
        }
        const saints = Array.from(saintMap.values());
        const fastingRules = items.filter(function (row) { return row.kind === 'fasting_rule'; }).map(function (row) { return row.item; });

        const results = await Promise.all([
            global.PravmirFood.getForDate(date),
            global.PravmirEvents.getForDate(date),
            relatedContentFor(items),
            global.PravmirNews.getForDate(date, { limit: 3 })
        ]);
        const food = results[0];
        const events = results[1];
        const relatedContent = results[2];
        const newsBundle = results[3];
        const latestContent = relatedContent.length ? [] : await global.PravmirContent.getContentItems({ limit: 3 });
        const nextReading = readings.length ? null : await nearestReadingAfter(date);
        const readingLibrary = (await Promise.all(readings.map(async function (reading) {
            const bridge = await global.PravmirLibrary.getScriptureForReading(reading.id);
            if (!bridge) return null;
            const work = await global.PravmirLibrary.getWorkById(bridge.work_ref);
            return { reading_ref: reading.id, scripture_reference: bridge, work: work, work_url: work ? global.PravmirLibrary.getDetailUrl(work) : null };
        }))).filter(Boolean);
        const saintLibrary = [];
        for (const saint of saints) {
            const lives = await global.PravmirLibrary.getLivesForSaint(saint.id, { limit: 20 });
            const relations = await global.PravmirLibrary.getRelatedForTarget('saint', saint.id, { relation_type: 'life_of', limit: 20 });
            const relationByWork = new Map(relations.filter(function (relation) {
                return relation.from && relation.from.kind === 'work';
            }).map(function (relation) { return [relation.from.id, relation]; }));
            lives.forEach(function (work) {
                const relation = relationByWork.get(work.id);
                if (relation) saintLibrary.push({ saint_ref: saint.id, work: work, relation: relation });
            });
        }

        const mediaAssets = await global.PravmirLibrary.getMediaAssets({ limit: 200 });
        const mediaById = new Map(mediaAssets.map(function (asset) { return [asset.id, asset]; }));
        const relatedMedia = [];
        for (const feast of feasts) {
            const relations = await global.PravmirLibrary.getRelatedForTarget('feast', feast.id, { limit: 50 });
            relations.forEach(function (relation) {
                const ref = relation.from && relation.from.kind === 'media_asset' ? relation.from : relation.to;
                const media = ref && ref.kind === 'media_asset' ? mediaById.get(ref.id) : null;
                if (media) relatedMedia.push({ feast_ref: feast.id, relation: relation, media: media });
            });
        }

        return {
            date: date,
            day: bundle ? bundle.day : null,
            items: items,
            feasts: feasts,
            saints: saints,
            commemorations: commemorations,
            fasting_rules: fastingRules,
            readings: readings,
            reading_library: readingLibrary,
            saint_library: saintLibrary,
            related_media: relatedMedia,
            next_reading: nextReading,
            food: food,
            events: events,
            related_content: relatedContent,
            latest_content: latestContent,
            content_mode: relatedContent.length ? 'related' : 'latest',
            news: newsBundle.news,
            news_mode: newsBundle.mode,
            trust: {
                calendar_has_legacy_records: items.some(function (row) { return row.item && row.item.verification_status === 'legacy_unverified'; }),
                readings_editorial: readings.every(function (row) { return row.verification_status === 'editorial_verified'; }),
                reading_library_uses_stable_ids: readingLibrary.every(function (row) { return row.scripture_reference && row.scripture_reference.reading_ref === row.reading_ref && row.work && row.work.id === row.scripture_reference.work_ref; }),
                saint_library_uses_explicit_life_of: saintLibrary.every(function (row) { return row.relation && row.relation.relation_type === 'life_of' && row.relation.from && row.relation.from.id === row.work.id && row.relation.to && row.relation.to.id === row.saint_ref; }),
                library_media_rights_verified: relatedMedia.every(function (row) { return row.media && row.media.verification_status === 'rights_verified'; }),
                events_are_canonical_only: true,
                food_is_editorial_guidance: true,
                content_relation_is_explicit: relatedContent.length > 0,
                news_are_canonical_only: newsBundle.news.every(function (row) { return row.verification_status === 'source_verified'; }),
                news_legacy_review_excluded: true
            }
        };
    }

    global.PravmirToday = Object.freeze({
        version: '1.43.0',
        normalizeDate: normalizeDate,
        getSnapshot: getSnapshot
    });
})(window);
