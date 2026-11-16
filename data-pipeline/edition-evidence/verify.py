#!/usr/bin/env python3
"""Compare a book-stratified sample with raw supplier records and named source occurrences."""
import argparse
from collections import Counter
import gzip
from hashlib import sha256
import html
import json
from pathlib import Path
import re
import sqlite3
import unicodedata
import zipfile

from inventory import CW_SHA, INPUTS, ROOT, WORD_HASHES

PREFIX = {'Matt':'MT','Mark':'MR','Luke':'LU','John':'JOH','Acts':'AC','Rom':'RO','1Cor':'1CO','2Cor':'2CO',
          'Gal':'GA','Eph':'EPH','Phil':'PHP','Col':'COL','1Thess':'1TH','2Thess':'2TH','1Tim':'1TI',
          '2Tim':'2TI','Titus':'TIT','Phlm':'PHM','Heb':'HEB','Jas':'JAS','1Pet':'1PE','2Pet':'2PE',
          '1John':'1JO','2John':'2JO','3John':'3JO','Jude':'JUDE','Rev':'RE'}
ASCII = str.maketrans('αβγδεζηθικλμνξοπρστυφχψω','abgdezhyiklmnxoprstufcqw')

def search_spelling(form):
    decomposed=unicodedata.normalize('NFD',form.lower().replace('ς','σ'))
    return ''.join(c for c in decomposed if c in 'αβγδεζηθικλμνξοπρστυφχψω')

def check(root,db):
    counts=Counter()
    form_rows=Counter()
    for name in INPUTS:
        path=root/name.lower()
        inventory=json.loads((path/'inventory.json').read_text())
        if name=='JuliaSmith':
            origin=next(t for t in inventory['candidates'] if 'localArtifact' in t)
            local=(ROOT/'data/editions/juliasmith'/origin['localArtifact']).read_bytes()
            assert sha256(local).hexdigest()==origin['sha256']
            unpacked=gzip.decompress(local)
            assert sha256(unpacked).hexdigest()==origin['sha256Uncompressed']
            assert len(json.loads(unpacked))==31102
            continue
        arch,sha,_=INPUTS[name]
        zfile=path/'upstream'/(arch+'_usfm.zip')
        assert sha256(zfile.read_bytes()).hexdigest()==sha
        with zipfile.ZipFile(zfile) as z:
            assert 'public domain' in z.read('copr.htm').decode().lower()
            usfm={}
            for p in z.namelist():
                if p.endswith('.usfm'):
                    content=z.read(p).decode('utf-8-sig')
                    usfm[content.splitlines()[0].split()[1]]=content
        if name=='KJV':
            cw=gzip.decompress((path/'upstream/crosswire-kjv.xml.gz').read_bytes())
            assert sha256(cw).hexdigest()==CW_SHA
            cw_verses={ref:body for ref,body in re.findall(r'<verse [^>]*?\bsID="([^"]+)"[^>]*/>(.*?)<verse eID="\1"[^>]*/>',cw.decode(),re.S)}
        for f in sorted((path/'evidence').glob('*.jsonl')):
            b=f.stem
            rows=[json.loads(line) for line in f.read_text().splitlines()]
            form_rows[name]+=sum(r['status']=='corroborated' for r in rows)
            if not rows:
                continue
            code=db.execute('SELECT usfm FROM books WHERE id=?',(b,)).fetchone()[0]
            samples={0,len(rows)//3,2*len(rows)//3,len(rows)-1}
            samples.update(i for i,r in enumerate(rows) if
                          r['status']=='rejected' or (b=='John' and r['chapter']==11 and r['verse']==35) or
                          (b=='1John' and (r['chapter'],r['verse'],r['strongs'])==(2,1,'G264')))
            for i in sorted(samples):
                r=rows[i]
                c,v=r['chapter'],r['verse']
                text=db.execute('SELECT text FROM verses WHERE translation_id=? AND book_id=? AND chapter=? AND verse=?',(name,b,c,v)).fetchone()[0]
                assert text.encode('utf-16-le')[2*r['start']:2*r['end']].decode('utf-16-le')==r['english'],(name,b,c,v,r['english'])
                if name in ('ASV','WEB'):
                    chapter=re.split(r'(?m)^\\c\s+'+str(c)+r'\s+',usfm[code],maxsplit=1)[1]
                    verse=re.split(r'(?m)^\\v\s+'+str(v)+r'\s+',chapter,maxsplit=1)[1]
                    verse=re.split(r'(?m)^\\(?:v|c)\s+',verse,maxsplit=1)[0]
                    tags=re.findall(r'\\\+?w\s+([^|\\]+)\|strong="([GH]0*\d+)"',verse)
                    assert (r['english'].replace('’',"'"),r['strongs']) in [(w.replace('’',"'"),t) for w,t in tags],(name,b,c,v,r['english'])
                    if r['status']!='rejected':
                        row=re.search(r'Berean aligned text, [^ ]+ (\d+):(\d+), row (\d+)',r['citation'])
                        assert row
                        result=db.execute("""SELECT t.surface,t.strongs FROM source_word_spans s JOIN verse_tokens t
                           ON t.translation_id=s.translation_id AND t.book_id=s.book_id AND t.chapter=s.chapter
                           AND t.verse=s.verse AND t.position=s.bsb_position
                           WHERE s.translation_id='BSB' AND s.book_id=? AND s.chapter=? AND s.verse=? AND s.source_row=?""",(b,*row.groups())).fetchone()
                        assert result and result[0].casefold()==r['english'].casefold() and result[1]==r['strongs']
                else:
                    raw=cw_verses[f'{b}.{c}.{v}']
                    found=False
                    for attrs,body in re.findall(r'<w ([^>]+?)(?<!/)>(.*?)</w>',raw,re.S):
                        source=re.search(r'\bsrc="(\d+)"',attrs)
                        if not source or int(source[1])!=r['source']['position']+1:
                            continue
                        raw_english=html.unescape(re.sub('<[^>]+>','',body))
                        key=lambda s:re.findall(r"[^\W_]+(?:['’][^\W_]+)*",s.replace('’',"'"))
                        if key(raw_english)!=key(r['english']):
                            continue
                        assert 'strong:'+r['strongs']+' ' in attrs
                        form=re.search(r'lemma.TR:([^" ]+)',attrs)
                        assert form and search_spelling(form[1])==search_spelling(r['source']['form'])
                        found=True
                    assert found,(b,c,v,r['english'])
                if r['status']=='corroborated':
                    src=r['source']
                    source=db.execute('''SELECT original,strongs,morph,translit FROM original_tokens WHERE
                       edition=? AND book_id=? AND chapter=? AND verse=? AND position=?''',
                       (src['edition'],b,c,v,src['position'])).fetchone()
                    assert source==(source[0],r['strongs'],src['morph'],src['translit']) and source[0].rstrip('.,;··:!?')==src['form']
                    if src['edition'] in ('BYZ','TR'):
                        suffix='SCR' if src['edition']=='TR' else 'BYZ'
                        archive=ROOT/'data-pipeline/sources'/(suffix+'-ASCII.ZIP')
                        assert sha256(archive.read_bytes()).hexdigest()==WORD_HASHES[archive.name]
                        with zipfile.ZipFile(archive) as greek:
                            printed=greek.read(f'{PREFIX[b]}_{suffix}.txt').decode('ascii').splitlines()
                        words=next(line.split()[1:] for line in printed if line.split()[0]==f'{c}:{v}')
                        assert search_spelling(src['form']).translate(ASCII)==words[src['position']].replace('v','s'),(b,c,v,src)
                counts[(name,r['status'])]+=1
    return form_rows,counts

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database',type=Path)
    parser.add_argument('packs',type=Path)
    args=parser.parse_args()
    db=sqlite3.connect(args.database.resolve().as_uri()+'?mode=ro',uri=True)
    verified,checked=check(args.packs,db)
    print('Verified counts across all records',dict(verified))
    print('Direct checks, first/last/interior of each book and reviewed cases',dict(checked))
