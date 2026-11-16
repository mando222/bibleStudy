"""Read provider markup without changing the target verse or guessing offsets."""
import gzip
import re
import unicodedata
from collections import defaultdict
from xml.sax import ContentHandler, parse

WORD = re.compile(r"[^\W_]+(?:['’][^\W_]+)*", re.UNICODE)
NOTE = re.compile(r"\\(f|fe|x|fig)\s.*?\\\1\*", re.S)
HEADING = re.compile(r"^\s*\\(?:s\d*|r|d|sp|ms\d*|mr|cl|cd|mt\d*|rem|toc\d+|h)\b.*$", re.M)
FIELD = re.compile(r"\\\+?w\s+([^|\\]*?)\|([^\\]*)\\\+?w\*")
MARKER = re.compile(r"\\\+?[A-Za-z][A-Za-z0-9-]*\*?\s?")
STRONG = re.compile(r"[HG]0*([1-9]\d*)$")

def key(word):
    return unicodedata.normalize('NFC', word).replace('’', "'")

def romanless(word):
    # Only used to compare the unaccented comparison spelling supplied in the OSIS.
    return ''.join(c for c in unicodedata.normalize('NFD', word.lower())
                   if 'GREEK' in unicodedata.name(c, '') and c.isalpha()).replace('ς','σ')

def strong(value):
    match = STRONG.fullmatch(value)
    return value[0] + match[1] if match else None

def utf16(text):
    return len(text.encode('utf-16-le')) // 2

def lexical(text):
    return [key(m[0]) for m in WORD.finditer(text)]

def usfm_verses(book):
    chapter = None
    # The negative lookahead keeps combined or suffixed verse IDs from becoming integers.
    parts = re.split(r"(?m)^\\([cv])\s+(\S+)\s*", book)
    for i in range(1,len(parts),3):
        marker, number, content = parts[i:i+3]
        if marker == 'c':
            chapter = int(number) if number.isdecimal() else None
            continue
        if not chapter or not number.isdecimal():
            continue
        content = HEADING.sub('', NOTE.sub('', content))
        tokens, tags = [], []
        offset = 0
        for match in FIELD.finditer(content):
            tokens.extend(lexical(MARKER.sub(' ', content[offset:match.start()])))
            start = len(tokens)
            tokens.extend(lexical(match[1]))
            attr = re.search(r'(?:^|\s)strong="([^"]+)"',match[2])
            if attr and len(tokens) > start:
                tags.append((start,len(tokens),attr[1]))
            offset = match.end()
        tokens.extend(lexical(MARKER.sub(' ',content[offset:])))
        yield chapter,int(number),tokens,tags

class CrossWire(ContentHandler):
    """Flatten canonical verse content while keeping every <w> boundary and source index."""
    def __init__(self):
        super().__init__()
        self.by_book = defaultdict(dict)
        self.ref = None
        self.exclude = 0
        self.words = []
        self.tags = []
        self.parts = []

    def startElement(self, name, attrs):
        if name == 'verse' and 'sID' in attrs:
            self.ref = attrs.getValue('sID')
            self.words, self.tags, self.parts = [], [], []
        elif name == 'verse' and 'eID' in attrs and self.ref:
            if self.ref != attrs.getValue('eID') or self.words:
                raise ValueError('Unbalanced KJV OSIS at ' + self.ref)
            book,c,v = self.ref.split('.')
            self.by_book[book][int(c),int(v)] = (''.join(self.parts),self.tags)
            self.ref = None
        if name in ('note','title','rdg'):
            self.exclude += 1
        if self.ref and not self.exclude and name == 'w':
            self.words.append((sum(map(len,self.parts)),dict(attrs)))
        if self.ref and not self.exclude and name in ('lb','milestone') and self.parts:
            self.parts.append(' ')

    def endElement(self, name):
        if self.ref and not self.exclude and name == 'w':
            start, attrs = self.words.pop()
            self.tags.append((start,sum(map(len,self.parts)),attrs))
        if name in ('note','title','rdg'):
            self.exclude -= 1

    def characters(self, data):
        if self.ref and not self.exclude:
            self.parts.append(data)

def read_crosswire(path):
    parser = CrossWire()
    with gzip.open(path,'rb') as f:
        parse(f,parser)
    return parser.by_book
