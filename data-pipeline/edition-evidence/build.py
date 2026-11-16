#!/usr/bin/env python3
"""Audit supplementary word evidence against an immutable v0.5.0 offline database."""
import argparse
from collections import Counter, defaultdict
import gzip
import hashlib
import html
import json
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import urllib.request
import zipfile

from inventory import CW_SHA, CW_URL, INPUTS, ROOT, WORD_HASHES, inventory
from sources import WORD, lexical, read_crosswire, romanless, strong, usfm_verses, utf16

HERE = Path(__file__).resolve().parent
CACHE = ROOT/'data-pipeline/sources/edition-evidence'
MIGRATION = '302bb5f92f1e05bf4b96c894f96da77a4cf10845'
GOSPELS = {'Matt','Mark','Luke','John'}
STRIP_GREEK = '.,;··:!?'

def json_file(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')

def snapshot(edition, name, url, digest, staging, compressed=False):
    cached = CACHE/name
    preserved = ROOT/'data/editions'/edition.lower()/'upstream'/name
    if not cached.exists() and preserved.is_file():
        shutil.copyfile(preserved,cached)
    if not cached.exists():
        with urllib.request.urlopen(url,timeout=120) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f'{edition} {url} has changed; obtain the pinned snapshot from upstream/ in the edition repository')
        cached.write_bytes(gzip.compress(data,mtime=0) if compressed else data)
    data = gzip.decompress(cached.read_bytes()) if compressed else cached.read_bytes()
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError(f'{edition}: checksum mismatch for {cached}')
    dest = staging/edition.lower()/'upstream'/name
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(cached,dest)
    return cached

def by_reference(rows):
    result = defaultdict(list)
    for row in rows:
        result[(row['chapter'],row['verse'])].append(row)
    return result

def load_book(db, edition, book):
    texts = {(c,v):t for c,v,t in db.execute(
        'SELECT chapter,verse,text FROM verses WHERE translation_id=? AND book_id=?',(edition,book))}
    bsb = by_reference(db.execute("""
        SELECT t.chapter,t.verse,t.surface,t.strongs,s.source_row FROM source_word_spans s
        JOIN verse_tokens t ON t.translation_id='BSB' AND t.book_id=s.book_id AND t.chapter=s.chapter
          AND t.verse=s.verse AND t.position=s.bsb_position
        WHERE s.translation_id='BSB' AND s.book_id=? AND s.start_position=s.end_position""",(book,)))
    originals = by_reference(db.execute(
        'SELECT * FROM original_tokens WHERE book_id=? AND edition IN (\'TR\',\'BYZ\',\'MT\',\'NA\') ORDER BY chapter,verse,edition,position',(book,)))
    uncertain = {(e,c,v) for e,c,v in db.execute(
        'SELECT edition,chapter,verse FROM greek_order_uncertainties WHERE book_id=?',(book,))}
    return texts, bsb, originals, uncertain

def occurrence(book, token, standalone=False, unique=False):
    part = 'tagnt_mat-jhn.txt' if book in GOSPELS else 'tagnt_act-rev.txt'
    form = token['original'].rstrip(STRIP_GREEK)
    if not form or not romanless(form) or re.search(r'[^\w\u0300-\u036f]',form):
        return None
    return dict(edition=token['edition'],revision=WORD_HASHES[part],book=book,chapter=token['chapter'],
                verse=token['verse'],row=f"{book}.{token['chapter']}.{token['verse']}/{token['position']}",position=token['position'],
                language='Greek',form=form,translit=token['translit'],morph=token['morph'],standalone=standalone,uniqueForm=unique)

def row(c,v,text,start,end,id,citation,status,**extra):
    return dict(chapter=c,verse=v,start=utf16(text[:start]),end=utf16(text[:end]),english=text[start:end],
                strongs=id,citation=citation,status=status,**extra)

def distributor(edition, book, markup, mappings, db, counts, only_ref=None):
    texts, bsb, originals, uncertain = load_book(db,edition,book)
    archive = INPUTS[edition][0]
    found = []
    for c,v,source_words,tags in usfm_verses(markup):
        if only_ref is not None and (c,v)!=only_ref:
            continue
        counts['distributorVerseUnits'] += 1
        counts['distributorWordTags'] += len(tags)
        text = texts.get((c,v))
        if not tags:
            continue
        if text is None or lexical(text) != source_words:
            counts['unmatchedVerseTags'] += len(tags)
            continue
        counts['tagsOnMatchingEnglish'] += len(tags)
        # For editions already carrying primary tags the independent source audit below (KJV)
        # and the Berean publisher table take precedence over derivative eBible exports.
        if edition in ('BSB','KJV'):
            counts['derivativeArchiveTags'] += len(tags)
            continue
        target_words = list(WORD.finditer(text))
        kv,bv = mappings.get(f'{edition}.{book}.{c}.{v}',[(c,v),(c,v)])
        if not kv or not bv:
            counts['unmappedVerseTags'] += len(tags)
            continue
        canonical, berean = tuple(kv),tuple(bv)
        primary = bsb.get(berean, [])
        native = originals.get(canonical,[])
        witness = 'MT' if any(t['edition']=='MT' for t in native) else ('BYZ' if edition=='WEB' else 'NA')
        witness_counts = Counter(t['strongs'] for t in native if t['edition']==witness)
        english_counts = Counter(w.casefold() for w in source_words)
        for start_word,end_word,tag in tags:
            strongs = strong(tag)
            start,end = target_words[start_word].start(),target_words[end_word-1].end()
            english = text[start:end]
            citations = f'eBible.org {archive} USFM, {book} {c}:{v}'
            if book=='Gen' and (c,v)==(1,1) and edition in ('WEB','ASV') and english in ('God','earth') and tag=='H8064':
                actual={'God':'H430','earth':'H776'}[english]
                reason=f'The distributor assigns H8064 (heavens). The Masoretic occurrence for {english} is {actual}.'
                if english=='God' and edition=='WEB':
                    if '(Elohim)' not in markup:
                        raise ValueError('Missing WEB Genesis 1:1 footnote')
                    reason+=' The distributor’s footnote identifies Elohim.'
                if witness_counts[actual]!=1:
                    raise ValueError('Expected Genesis 1:1 Masoretic reading')
                found.append(row(c,v,text,start,end,tag,citations+'; Berean publisher table; Masoretic WLC Gen 1:1','rejected',reason=reason))
                counts['rejectedConflicts'] += 1
                continue
            if not strongs or end_word != start_word+1 or english_counts[source_words[start_word].casefold()] != 1:
                counts['awaitingReview'] += 1
                continue
            # Require the independent publisher to tag the entire same single rendered word,
            # exactly once in the mapped verse. Agreement on dictionary headwords is insufficient.
            parallels = [t for t in primary if t['surface'].casefold()==english.casefold()]
            if len(parallels)!=1 or parallels[0]['strongs']!=strongs or witness_counts[strongs]!=1:
                counts['awaitingReview'] += 1
                continue
            evidence = citations+f"; Berean aligned text, {book} {berean[0]}:{berean[1]}, row {parallels[0]['source_row']}"
            if book=='John' and c==11 and v==35 and english=='wept' and strongs=='G1145':
                same = [t for t in native if t['strongs']==strongs and t['edition'] in ('NA','TR','BYZ')]
                if (text!='Jesus wept.' or {t['edition'] for t in same}!={'NA','BYZ','TR'} or len(same)!=3 or
                    any(t['position']!=0 or t['original']!='ἐδάκρυσεν' or t['morph']!='V-AAI-3S' or
                        (t['edition'],*canonical) in uncertain for t in same)):
                    raise ValueError(f'{edition} John 11:35 reviewed occurrence no longer matches all three witnesses')
                src = occurrence(book,next(t for t in same if t['edition']==witness),True,True)
                cite=evidence+'; STEPBible TAGNT, John 11:35, Greek word 1 (NA, Byzantine and TR agree)'
                if parallels[0]['source_row']!='92072':
                    raise ValueError('Unexpected Berean source row for John 11:35')
                correspondence=dict(edition='BSB',revision=WORD_HASHES['bsb_tables.tsv'],book=book,
                                    chapter=11,verse=35,row='92072',position=None,citation=cite)
                found.append(row(c,v,text,start,end,strongs,cite,'corroborated',source=src,correspondences=[correspondence]))
                counts['corroborated'] += 1
            else:
                found.append(row(c,v,text,start,end,strongs,evidence,'published'))
                counts['publishedLookups'] += 1
    return found

def kjv_spans(db, book):
    data = by_reference(db.execute("""SELECT chapter,verse,position,surface,trailer,strongs FROM verse_tokens
        WHERE translation_id='KJV' AND book_id=? ORDER BY chapter,verse,position""",(book,)))
    spans = by_reference(db.execute("""SELECT chapter,verse,start_position,end_position FROM source_word_spans
        WHERE translation_id='KJV' AND book_id=?""",(book,)))
    return data,spans

def crosswire(book, raw, db, counts):
    texts,_,originals,uncertain = load_book(db,'KJV',book)
    tokens,occupied = kjv_spans(db,book)
    found=[]
    for ref,(osis,tags) in raw.items():
        c,v=ref
        counts['crosswireWordGroups']+=len(tags)
        text=texts.get(ref)
        if not text or lexical(text)!=lexical(osis):
            counts['crosswireVerseMismatchGroups']+=len(tags)
            continue
        source_tokens=[t for t in originals.get(ref,[]) if t['edition']=='TR']
        if not source_tokens or ('TR',c,v) in uncertain:
            counts['crosswireGroupsWithoutCheckedGreekOrder']+=len(tags)
            continue
        source_by_pos={t['position']:t for t in source_tokens}
        pos_usage=Counter(int(n)-1 for _,_,a in tags for n in a.get('src','').split() if n.isdecimal())
        # The CrossWire key is Stephanus; the reader's accented witness is Scrivener.
        # Compare every indexed spelling in the entire verse and require all printed
        # Scrivener positions to be accounted for. A variant can shift later positions.
        attested={}
        mismatched=False
        for _,_,attrs in tags:
            positions=attrs.get('src','').split()
            forms=[w.removeprefix('lemma.TR:') for w in attrs.get('lemma','').split() if w.startswith('lemma.TR:')]
            if len(positions)!=len(forms) or any(not n.isdecimal() for n in positions):
                mismatched=True
                break
            for n,form in zip(positions,forms):
                position=int(n)-1
                attested[position]=romanless(form)
                if position not in source_by_pos or attested[position]!=romanless(source_by_pos[position]['original']):
                    mismatched=True
                    break
        if mismatched or attested.keys()!=source_by_pos.keys():
            counts['crosswireGreekVerseDifference']+=len(tags)
            continue
        # Verify English boundaries against *existing* KJV tokens, preserving the v0.5 positions.
        starts,ends={},{}
        offset=0
        built=''
        existing_tags={}
        for t in tokens.get(ref,[]):
            existing_tags[t['position']]=t['strongs']
            starts[offset]=t['position']
            ends[offset+len(t['surface'])]=t['position']
            offset+=len(t['surface'])+len(t['trailer'])
            built+=t['surface']+t['trailer']
        if built!=text:
            counts['crosswireWithoutExistingTokenBoundaries']+=len(tags)
            continue
        input_words=list(WORD.finditer(osis))
        out_words=list(WORD.finditer(text))
        in_starts={m.start():i for i,m in enumerate(input_words)}
        in_ends={m.end():i for i,m in enumerate(input_words)}
        taken=set(p for span in occupied.get(ref,[]) for p in range(span['start_position'],span['end_position']+1))
        for osis_start,osis_end,attrs in tags:
            ids=[strong(w.removeprefix('strong:')) for w in attrs.get('lemma','').split() if w.startswith('strong:')]
            spellings=[w.removeprefix('lemma.TR:') for w in attrs.get('lemma','').split() if w.startswith('lemma.TR:')]
            index=attrs.get('src','')
            # An English phrase may have multiple source words; never reassign it to one member.
            if not index.isdecimal() or len(ids)!=1 or len(spellings)!=1:
                counts['crosswireCompoundOrUnindexed']+=1
                continue
            p=int(index)-1
            t=source_by_pos.get(p)
            if (not t or pos_usage[p]!=1 or not t['morph'] or t['strongs']!=ids[0] or
                romanless(t['original'])!=romanless(spellings[0]) or osis_start not in in_starts or osis_end not in in_ends):
                counts['crosswireUnconfirmedOccurrence']+=1
                continue
            # A second identical unaccented form could conceal a shifted occurrence
            # between Stephanus and Scrivener; withhold these homographs.
            matches=[x for x in source_tokens if romanless(x['original'])==romanless(spellings[0])]
            if len(matches)!=1:
                counts['crosswireRepeatedUnaccentedForm']+=1
                continue
            start=out_words[in_starts[osis_start]].start()
            end=out_words[in_ends[osis_end]].end()
            if start not in starts or end not in ends or any(n in taken for n in range(starts[start],ends[end]+1)):
                counts['crosswireBoundaryOrMigratedOverlap']+=1
                continue
            if existing_tags[ends[end]] not in (None,ids[0]) or any(existing_tags[n] for n in range(starts[start],ends[end])):
                counts['crosswireIncompatibleExistingLexicalTags']+=1
                continue
            src=occurrence(book,t,standalone=(book=='John' and ref==(11,35) and text[start:end]=='wept'),unique=True)
            if not src:
                counts['crosswireComplexSourceSurface']+=1
                continue
            cite=f'CrossWire KJV2003, Stephanus TR, {book} {c}:{v}, Greek word {p+1}; checked against Scrivener 1894 and STEPBible TAGNT'
            claim=row(c,v,text,start,end,ids[0],cite,'corroborated',source=src)
            if book=='John' and ref==(11,35) and text[start:end]=='wept':
                publisher=db.execute('''SELECT s.source_row, t.lemma FROM source_word_spans s JOIN verse_tokens t ON
                   t.translation_id='BSB' AND t.book_id=s.book_id AND t.chapter=s.chapter AND t.verse=s.verse AND t.position=s.bsb_position
                   WHERE s.translation_id='BSB' AND s.book_id='John' AND s.chapter=11 AND s.verse=35 AND t.surface='wept' AND t.strongs='G1145' ''').fetchall()
                if len(publisher)!=1 or publisher[0][0]!='92072' or romanless(publisher[0][1])!=romanless(src['form']) or p!=0:
                    raise ValueError('KJV John 11:35 no longer corresponds to the reviewed Berean occurrence')
                claim['correspondences']=[dict(edition='BSB',revision=WORD_HASHES['bsb_tables.tsv'],book=book,chapter=c,
                     verse=v,row='92072',position=None,citation=cite+'; Berean aligned text, John 11:35, row 92072')]
            if existing_tags[ends[end]] is None:
                counts['crosswireFilledMissingTags']+=1
            found.append(claim)
            taken.update(range(starts[start],ends[end]+1))
            counts['crosswireCorroborated']+=1
    return found

def build(db, edition, mappings, staging):
    path=staging/edition.lower()
    path.mkdir(parents=True,exist_ok=True)
    stream=path/'evidence'
    # Build into a fresh staging directory; remove obsolete book files after success.
    pending=path/'evidence.build'
    if pending.exists():
        shutil.rmtree(pending)
    pending.mkdir()
    id,digest,_=INPUTS[edition]
    zip_books={}
    rights=None
    if id:
        name=id+'_usfm.zip'
        archive=zipfile.ZipFile(snapshot(edition,name,'https://ebible.org/Scriptures/'+name,digest,staging))
        for member in archive.namelist():
            if member.endswith('.usfm'):
                code=re.search(r'\\id\s+(\w+)',archive.read(member).splitlines()[0].decode('utf-8-sig'))[1]
                zip_books[code]=member
        notice=html.unescape(re.sub('<[^>]+>',' ',archive.read('copr.htm').decode('utf-8-sig')))
        rights=re.sub(r'\s+',' ',notice).strip()
    cross={}
    if edition=='KJV':
        cw=snapshot(edition,'crosswire-kjv.xml.gz',CW_URL,CW_SHA,staging,True)
        cross=read_crosswire(cw)
    if edition=='JuliaSmith':
        # Reuse the app's preserved v0.5.0 recovery source.
        file=ROOT/'data/editions/juliasmith/sources/julia-smith-1876.json.gz'
        if hashlib.sha256(gzip.decompress(file.read_bytes())).hexdigest()!='5702fb61513f4e97a0bb1caf71d5892caa55f1b17dea8709666af42bab606de1':
            raise ValueError('Julia Smith uncompressed source checksum mismatch')
        # The edition repository owns the text snapshot under sources/; avoid a second binary.
        duplicate=path/'upstream'/file.name
        if duplicate.exists():
            duplicate.unlink()
    stats={}
    for book,code,verses in db.execute('''SELECT b.id,b.usfm,COUNT(*) FROM books b JOIN verses v
            ON b.id=v.book_id WHERE v.translation_id=? GROUP BY b.id ORDER BY b.sort_order''',(edition,)):
        counts=Counter(targetVerses=verses)
        found=[]
        if code in zip_books:
            markup=archive.read(zip_books[code]).decode('utf-8-sig')
            if 'strong=' in markup:
                found=distributor(edition,book,markup,mappings,db,counts)
            else:
                counts['distributorVerseUnits']=len(re.findall(r'(?m)^\\v\s+',markup))
                counts['distributorWordTags']=0
        if book in cross:
            found.extend(crosswire(book,cross[book],db,counts))
        stats[book]=dict(counts)
        if found:
            with (pending/(book+'.jsonl')).open('w') as f:
                for obj in sorted(found,key=lambda x:(x['chapter'],x['verse'],x['start'])):
                    f.write(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n')
    if id:
        archive.close()
    info=inventory(edition,stats,rights,sorted(zip_books))
    info.update(migration=MIGRATION,method={
        'published':'A distributor Strong’s tag on a matching whole English verse is independently supported by a complete BSB publisher rendering of the same single word and a unique same Strong’s occurrence in the selected source verse. These flags are for lexical lookup.',
        'corroborated':'The WEB and ASV John 11:35 readings are independently reviewed. CrossWire KJV2003 directly identifies individual source word positions. Additions require matching English boundaries and matching Greek form, ID and position. See the build script for abstentions.',
        'withheld':'The raw provider archive retains every candidate. Book counts record the reason a candidate was withheld. The original translation is preserved; a supported lexical lookup does not enable source-form display.',
        'publishedText':'The anchored translation and literary layout are preserved from the pinned migration reference. Later distributor text revisions never silently replace a published verse.'})
    if stream.exists():
        shutil.rmtree(stream)
    pending.rename(stream)
    json_file(path/'inventory.json',info)
    print(edition, dict(sum((Counter(c) for c in stats.values()),Counter())),flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database',type=Path,help='Immutable SQLite library from v0.5.0')
    parser.add_argument('--staging',type=Path,default=CACHE,help='Generated review staging directory')
    parser.add_argument('editions',nargs='*',help='Edition IDs; default: all nine')
    args=parser.parse_args()
    db=sqlite3.connect(args.database.resolve().as_uri()+'?mode=ro',uri=True)
    db.row_factory=sqlite3.Row
    spans=dict(db.execute('SELECT translation_id,count(*) FROM source_word_spans GROUP BY translation_id'))
    if spans!={'BSB':348742,'KJV':2051}:
        raise ValueError(f'Unexpected migration corpus: {spans}')
    mappings=json.loads(subprocess.check_output(['node','--experimental-sqlite','--import','tsx',str(HERE/'passages.ts'),str(args.database)],cwd=ROOT))
    for edition in args.editions or INPUTS:
        if edition not in INPUTS:
            parser.error('Unknown edition '+edition)
        build(db,edition,mappings,args.staging)

if __name__=='__main__':
    main()
