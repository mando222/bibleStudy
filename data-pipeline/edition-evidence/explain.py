#!/usr/bin/env python3
"""Explain a distributor tag disposition in WEB or ASV without writing any files."""
import argparse
from collections import Counter
import json
import sqlite3
import subprocess
from pathlib import Path
import zipfile

from build import CACHE, HERE, INPUTS, ROOT, distributor, load_book
from sources import lexical, strong, usfm_verses

def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('database',type=Path)
    cli.add_argument('edition',choices=['WEB','ASV'])
    cli.add_argument('book',help='Bundled book ID (such as Gen or John)')
    cli.add_argument('chapter',type=int)
    cli.add_argument('verse',type=int)
    args=cli.parse_args()
    db=sqlite3.connect(args.database.resolve().as_uri()+'?mode=ro',uri=True)
    db.row_factory=sqlite3.Row
    ed,b,c,v=args.edition,args.book,args.chapter,args.verse
    code=db.execute('SELECT usfm FROM books WHERE id=?',(b,)).fetchone()
    if not code:
        cli.error('Unknown book '+b)
    archive_id=INPUTS[ed][0]
    filename=archive_id+'_usfm.zip'
    path=ROOT/'data/editions'/ed.lower()/'upstream'/filename
    if not path.is_file():
        path=CACHE/filename
    from hashlib import sha256
    if sha256(path.read_bytes()).hexdigest()!=INPUTS[ed][1]:
        cli.error('Unexpected archive checksum: '+str(path))
    with zipfile.ZipFile(path) as archive:
        book=archive.read(next(name for name in archive.namelist() if '-'+code[0]+archive_id+'.usfm' in name)).decode('utf-8-sig')
    markup=next(((words,tags) for ch,vs,words,tags in usfm_verses(book) if (c,v)==(ch,vs)),None)
    if not markup:
        cli.error('No separate unambiguous distributor verse at this address')
    words,tags=markup
    mappings=json.loads(subprocess.check_output(['node','--experimental-sqlite','--import','tsx',str(HERE/'passages.ts'),str(args.database)],cwd=ROOT))
    texts,baselines,originals,_=load_book(db,ed,b)
    english=texts.get((c,v))
    output={'edition':ed,'book':b,'chapter':c,'verse':v,'publishedText':english,'distributorWords':words,'candidates':[]}
    counts=Counter()
    claims=distributor(ed,b,book,mappings,db,counts,only_ref=(c,v))
    from sources import WORD, utf16
    offsets=[utf16(english[:w.start()]) for w in WORD.finditer(english or '')]
    index={r['start']:r for r in claims}
    mapped,berean=mappings.get(f'{ed}.{b}.{c}.{v}',[(c,v),(c,v)])
    native=originals.get(tuple(mapped or []),[])
    source='MT' if any(t['edition']=='MT' for t in native) else ('BYZ' if ed=='WEB' else 'NA')
    primary=baselines.get(tuple(berean or []),[])
    valid=english is not None and lexical(english)==words
    for start,end,value in tags:
        wanted=' '.join(words[start:end])
        matched=index.get(offsets[start]) if valid else None
        if matched:
            output['candidates'].append(matched)
            continue
        same=[dict(id=t['strongs'],row=t['source_row']) for t in primary if t['surface'].casefold()==wanted.casefold()]
        occurrences=[t['position'] for t in native if t['edition']==source and t['strongs']==strong(value)]
        if not valid:
            why='Full English word sequence differs, or target verse is unavailable.'
        elif not mapped or not berean:
            why='Target verse has no unambiguous mapped reference.'
        elif end!=start+1 or not strong(value):
            why='Dictionary lookup rule requires one word and one recognized Strong’s ID.'
        elif sum(w.casefold()==wanted.casefold() for w in words)!=1:
            why='This English word repeats in the verse.'
        elif len(same)!=1 or same[0]['id']!=strong(value):
            why='No unique matching complete Berean span with the same Strong’s ID.'
        else:
            why='The named source verse has zero or multiple occurrences of this Strong’s ID.'
        output['candidates'].append(dict(english=wanted,distributorTag=value,wordIndex=start,status='withheld',reason=why,
            completeBereanSpans=same,sourceEdition=source,sourcePositions=occurrences))
    print(json.dumps(output,ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
