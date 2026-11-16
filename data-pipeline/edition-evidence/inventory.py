"""Descriptions of the inputs that can establish claims for each edition."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INPUTS = json.loads(Path(__file__).with_name('inputs.json').read_text())
LAYOUT_HASHES = json.loads((ROOT/'data-pipeline/assets/literary-source-hashes.json').read_text())
WORD_HASHES = json.loads((ROOT/'data-pipeline/assets/word-source-hashes.json').read_text())
CW_REV = 'd490be7e34762deb2c76cb2c1306d4808e27890d'
CW_SHA = '4bcbfe45722fca396adbeac9c81025bbb173cb1e30296da90864f0400cb0e3f5'
CW_URL = 'https://gitlab.com/api/v4/projects/crosswire-bible-society%2Fkjv/repository/files/kjv.osis.xml/raw?ref=' + CW_REV
STEP_REV = 'f71b5e51f2d768ae72e3ed69743a7a9df25ef8b5'
GAPS = {
 'KJV':'KJV2003 provides Greek source indices for the NT. The Bible Foundation Hebrew tags do not establish Hebrew source positions. Published KJV OT tag lookups remain distinct from the migrated Hebrew restorations.',
 'BSB':'The publisher table is the primary alignment. Rows whose published English cannot be reconciled to an exact printed span remain dictionary-only or unresolved. The distributor USFM is a derivative publication.',
 'WEB':'The distributor supplies word-level tags, including demonstrably incorrect within-verse assignments. An exact tagged English span alone cannot establish a Hebrew or Greek position. John 11:35 has a reviewed occurrence. The text is the Protestant Updated edition.',
 'ASV':'The distributor supplies word-level tags but no source-word positions. John 11:35 has a reviewed concordant reading. No universal Greek master edition is assumed for ASV.',
 'YLT':'The Young’s USFM contains text and layout. This archive has no Strong’s word tags or source positions.',
 'GNV':'The 1599 Geneva USFM uses period spelling. This archive has no Strong’s word tags or source positions. A modern-spelling Geneva alignment would need separate edition reconciliation.',
 'TNT':'The Tyndale 1534 USFM covers only the New Testament. This archive has no Strong’s word tags or source positions.',
 'WYC':'This late Wycliffite text covers the Pentateuch and four Gospels. Its immediate source is the Latin Vulgate. Hebrew or Greek words from a parallel edition cannot establish its immediate source form.',
 'JuliaSmith':'The published 1876 text and local recovery snapshot provide verse text. No publisher word tags, source positions or encoded edition layout were identified.'
}
def inventory(edition, book_counts, rights, archive_books):
    archive,digest,hello = INPUTS[edition]
    candidates = []
    if hello:
        candidates.append(dict(name='Free Use Bible API edition snapshot',url=f'https://bible.helloao.org/api/{hello}/complete.json',
            sha256=LAYOUT_HASHES[f'helloao_{hello}.json'], rights='Public-domain edition text. Preserve publisher credits and applicable territorial notices.',
            establishes='The pinned v0.5.0 published text and its edition-specific layout.'))
        candidates.append(dict(name='eBible.org USFM',url=f'https://ebible.org/Scriptures/{archive}_usfm.zip',
            catalog=f'https://ebible.org/details.php?id={archive}',sha256=digest,books=archive_books,rights=rights,
            establishes='Edition-specific markup and any word-level tags as supplied by the distributor. An archive hash identifies the precise snapshot. See upstream/ for the unchanged source and embedded rights notice.'))
    if edition in ('KJV','BSB','ASV','WEB'):
        candidates.append(dict(name='BSB publisher alignment',url='https://bereanbible.com/bsb_tables.tsv',
            rights='Berean Bible, public domain. BSB Publishing, LLC.',sha256=WORD_HASHES['bsb_tables.tsv'],
            establishes='Direct BSB English-to-source rows. Checking the same English rendering supplies corroboration for a dictionary tag in another edition; it does not by itself establish a restoration.'))
        candidates.append(dict(name='STEPBible TAGNT and TAHOT',url=f'https://github.com/STEPBible/STEPBible-Data/tree/{STEP_REV}',revision=STEP_REV,
            rights='CC BY 4.0, STEPBible / Tyndale House. Greek forms, Strong’s IDs, transliterations and morphology reproduced from TAGNT. Hebrew comparison data from TAHOT.',
            checksums={k:v for k,v in WORD_HASHES.items() if k.startswith(('tagnt_','tahot_','SCR-','BYZ-'))},
            printedOrder='https://www.byztxt.com/downloads.html',establishes='Greek edition readings and Masoretic lexical occurrences at a mapped verse. ROBINSON Scrivener/Byzantine archives check unaccented printed order.'))
    if edition == 'KJV':
        candidates.extend([dict(name='CrossWire Bible Society KJV2003 OSIS',url=CW_URL,revision=CW_REV,sha256Uncompressed=CW_SHA,
            terms='https://wiki.crosswire.org/CrossWire_KJV',rights='CrossWire Bible Society © 2003–2023 grants a general public license to use this text for any purpose. Bible Foundation (OT); KJV2003 and Maurice Robinson (NT). See the eBible notice for United Kingdom printing rights.',
            establishes='English spans and explicit NT Stephanus TR source positions and comparison spellings. Scrivener witnesses are linked only after checking the local verse and printed order. The eBible KJV credits CrossWire and cannot corroborate it independently.'),
            dict(name='kaiserlik/kjv',revision='323f79bc6f4c2749e77a23a71b7ca7772fad81a7',url='https://github.com/kaiserlik/kjv',
            rights='Existing v0.5.0 tagged text, credited to the upstream project; no separate license file was identified at this revision.',
            establishes='Existing per-word dictionary tagging. These tags alone supply no inflected form.')])
    alternatives={
        'YLT':('YLT','1.1','Public domain. Robert Young, 1898.','The catalog describes a text module and supplies no source-occurrence indices.'),
        'GNV':('Geneva1599','2.0','Public domain. Electronic edition edited by Mark Langley.','A 1599 Geneva edition; its catalog documents no source-occurrence indices.'),
        'TNT':('Tyndale','2.1','Public domain.','1525/1530 NT and Pentateuch differ from the bundled 1534 NT. No occurrence data can safely transfer from that identification.'),
        'WYC':('Wycliffe','2.4.1','Creative Commons BY-SA 4.0.','A larger Wikisource-derived corpus with different numbering and modern transcription choices. Historical verse divisions are retrospective. No source-word indices are documented.')
    }
    if edition in alternatives:
        name,rev,terms,scope=alternatives[edition]
        candidates.append(dict(name='CrossWire SWORD catalog, '+name,url='https://www.crosswire.org/sword/modules/ModInfo.jsp?modName='+name,
                               revision=rev,rights=terms,establishes=scope))
    if edition == 'WEB':
        candidates.append(dict(name='World English Bible publisher',url='https://worldenglish.bible/',rights='Public domain; World English Bible is a trademark.',establishes='Edition identity, revisions and translation source policy. The underlying readings can vary by passage.'))
    if edition == 'JuliaSmith':
        candidates.extend([dict(name='Digital Bible Society, ENGJESPT',url='https://arc.dbs.org/data/scripture/ENGJESPT/index.html',
            rights='Public-domain Julia E. Smith translation, 1876. Preserve Digital Bible Society source credit.',
            establishes='Distributor attribution for the 1876 edition.'),
            dict(name='Julia Smith Bible, StudyBible.info',url='https://studybible.info/JuliaSmith',localArtifact='sources/julia-smith-1876.json.gz',
                 rights='Public-domain 1876 text credited to Digital Bible Society in v0.5.0.',
                 sha256='b6bc750b364402c950b7dd30d097d7f039edf48e50950611ea55082dfebc6c6f',
                 sha256Uncompressed='5702fb61513f4e97a0bb1caf71d5892caa55f1b17dea8709666af42bab606de1',
                 establishes='The hashes identify the normalized 31,102-verse migration snapshot sourced via this site. No independently established source-word positions were imported.')])
    if edition in ('ASV','JuliaSmith'):
        candidates.append(dict(name='Encyclopaedia Biblica statistical alignment',url='https://'+('americanstandardversion.encyclopaediabiblica.com/alignment' if edition=='ASV' else 'smithsliteral.encyclopaediabiblica.com/rights'),
            rights='No separately licensed, independently reviewed occurrence dataset established by this inspection.',establishes='Statistical alignment is a candidate for research. It cannot substantiate restoration from agreement with another inference.'))
    return dict(edition=edition, format=1, candidates=candidates, gaps=GAPS[edition],books=book_counts)
