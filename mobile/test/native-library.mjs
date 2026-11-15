// Run with Node 22+ and a debug APK installed on a connected Android device.
// ANDROID_SERIAL chooses a device when more than one is attached.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as pause } from 'node:timers/promises'

const appId = 'org.openbiblestudy.android'
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
const adbPath = sdk ? join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : 'adb'
function adb(...args) {
  return execFileSync(adbPath, args, { encoding: 'utf8' }).trim()
}

async function connect(t) {
  adb('shell', 'am', 'start', '-W', '-n', appId + '/.MainActivity')
  const pid = adb('shell', 'pidof', appId)
  assert.match(pid, /^\d+$/, 'debug app is running')
  const port = adb('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid)
  t.after(() => adb('forward', '--remove', 'tcp:' + port))
  let target
  for (let attempt = 0; attempt < 50 && !target; attempt++) {
    try {
      const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
      target = pages.find(page => page.type === 'page')
    } catch { /* WebView opens the socket during startup. */ }
    if (!target) await pause(200)
  }
  assert.ok(target?.webSocketDebuggerUrl, 'installed debug APK exposes its WebView')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  t.after(() => ws.close())
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let nextId = 0
  const pending = new Map()
  ws.onmessage = ({ data }) => {
    const response = JSON.parse(data)
    const request = pending.get(response.id)
    if (!request) return
    pending.delete(response.id)
    const error = response.error?.message || response.result.exceptionDetails?.exception?.description
    if (error) request.reject(Error(error))
    else request.resolve(response.result.result.value)
  }
  function evaluate(expression) {
    const id = ++nextId
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await evaluate('typeof window.Capacitor?.nativePromise === "function"')) {
      return evaluate
    }
    await pause(200)
  }
  throw Error('Native study bridge did not initialize.')
}

test('installed offline corpus preserves aligned forms, MT witnesses and original-script search', { timeout: 90000 }, async t => {
  const evaluate = await connect(t)
  const call = (method, args) => evaluate('window.Capacitor.nativePromise("Study",' + JSON.stringify(method) + ',' + JSON.stringify(args) + ')')
  const read = (translation, book, chapter) => call('getChapter', { translation, book, chapter })
  const verse = (chapter, verse) => chapter.verses.find(row => row.verse === verse)
  const [bsb, kjv, genesis, hebrew, dictionary] = await Promise.all([
    read('BSB', '1John', 2), read('KJV', '1John', 2), read('BSB', 'Gen', 4), read('MT', '1Chr', 1), call('getStrongs', { id: 'G264' })
  ])

  const printed = verse(bsb, 1)
  assert.equal(printed.tokens.map(t => t.surface + t.trailer).join(''), printed.text)
  assert.deepEqual(printed.tokens.filter(t => t.strongs === 'G264').map(t => [
    t.sourceWord.rowId, t.sourceWord.text, t.sourceWord.english, t.sourceWord.canReplaceAlone
  ]), [
    ['199485', 'ἁμάρτητε', 'you will not sin', false], ['199489', 'ἁμάρτῃ', 'does sin', false]
  ])
  assert.equal(dictionary.entry.lemma, 'ἁμαρτάνω')
  assert.deepEqual(dictionary.coverage, [{ translation: 'BSB', occurrences: 39 }])
  assert.ok(verse(kjv, 1).tokens.filter(t => t.strongs === 'G264').every(t => !t.sourceWord))
  const name = verse(genesis, 16).tokens.find(t => t.strongs === 'H3068').sourceWord
  assert.deepEqual([name.english, name.rowId, name.text], ['of the LORD', '2266', 'יְהוָ֑ה'])

  const paired = verse(hebrew, 11).tokens.find(t => t.ketiv)
  assert.deepEqual([paired.sourceType, paired.surface, paired.ketiv], ['Q(K)', 'לוּדִ֧ים', 'לוּדִיִּים'])
  assert.equal(verse(hebrew, 11).tokens.map(t => t.surface + t.trailer).join(''), verse(hebrew, 11).text)

  const english = text => call('search', { text, translation: 'BSB', limit: 3 })
  assert.equal((await english('shepherd')).total, 114)
  assert.equal((await english('"shepherd"')).total, 62)
  const phrase = await english('“good shepherd”')
  assert.deepEqual(phrase.hits.map(hit => [hit.book, hit.chapter, hit.verse]).sort(), [['John', 10, 11], ['John', 10, 14]])
  assert.equal((await english('"shepherd good"')).total, 0)

  const greek = await call('search', { text: 'λόγος', translation: 'BSB', book: 'John', limit: 3 })
  assert.ok(greek.hits.length && greek.total >= greek.hits.length)
  assert.ok(greek.hits.every(hit => hit.translation === 'NA' && hit.book === 'John'))
  const gh = greek.hits[0]
  assert.equal(gh.snippet, verse(await read('NA', gh.book, gh.chapter), gh.verse).text)
  const [acts] = (await english('διαμεριζόμεναι')).hits
  assert.deepEqual([acts.edition, acts.book, acts.chapter, acts.verse, acts.orderStatus], ['NA', 'Acts', 2, 3, 'unverified'])
  assert.ok(acts.markedGreekKey.includes('{{διαμεριζομεναι}}'))

  const mt = await call('search', { text: 'בְּרֵאשִׁית', translation: 'KJV', book: 'Gen', limit: 10 })
  const mh = mt.hits.find(hit => hit.translation === 'MT' && hit.chapter === 1 && hit.verse === 1)
  assert.ok(mh, 'pointed Hebrew lookup returns Genesis 1:1')
  assert.equal(mh.snippet, verse(await read('MT', 'Gen', 1), 1).text)
})

test('phone study tools read the full desktop corpus through the worker', { timeout: 90000 }, async t => {
  const evaluate = await connect(t)
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await evaluate('Boolean(window.api?.getWordFrequency)')) break
    await pause(200)
  }
  assert.ok(await evaluate('Boolean(window.api?.getWordFrequency)'), 'phone study API has opened')
  const call = (method, ...args) => evaluate('window.api[' + JSON.stringify(method) + '](...' + JSON.stringify(args) + ')')

  const translations = await call('listTranslations')
  for (const id of ['BSB','KJV','ASV','WEB','YLT','TNT','GNV','WYC','JuliaSmith','MT','LXX']) {
    assert.ok(translations.some(t => t.id === id), id + ' is in the library')
  }
  const tagged = await call('getChapter', { translation: 'BSB', book: '1John', chapter: 2 })
  assert.deepEqual(tagged.verses[0].tokens.filter(t => t.strongs === 'G264').map(t => t.sourceWord?.rowId), ['199485','199489'])
  const inferred = await call('getChapter', { translation: 'ASV', book: 'Ps', chapter: 23 })
  assert.ok(inferred.verses[0].tokens.some(t => t.derived))
  assert.ok(inferred.verses[0].tokens.every(t => !t.sourceWord))
  const swete = await call('search', { text: 'G1519', translation: 'LXX' })
  assert.equal(swete.hits.length, 0)
  assert.match(swete.notice, /word tags/i)
  const mtConcordance = await call('getConcordance', 'H583', { translation: 'MT', book: '1Chr' })
  assert.equal(mtConcordance.hits.find(h => h.chapter === 1 && h.verse === 1).surface, 'אֱנֽוֹשׁ׃')
  const words = await call('browseLexicon', { query: 'G26', limit: 5 })
  assert.ok(words.entries.some(word => word.id === 'G26'))
  const query = { id: 'G26', edition: 'NA' }
  const frequency = await call('getWordFrequency', query)
  assert.deepEqual([frequency.occurrences, frequency.verses, frequency.forms.length], [116, 106, 5])
  const passages = await call('getWordFrequencyPassages', { ...query, book: '1John', chapter: 4 })
  assert.equal(passages.find(row => row.verse === 16).occurrences, 3)
  const [trLove] = (await call('getWordFrequencyPassages', { ...query, edition: 'TR', book: '1Cor', chapter: 13 })).filter(row => row.verse === 2)
  assert.deepEqual([trLove.occurrences, trLove.orderStatus], [1, 'unverified'])
  const parallel = await call('getInterlinear', 'Phil', 1, 'NA', ['BSB','ASV','KJV'], true)
  const love = parallel.verses.find(row => row.verse === 17).tokens.find(token => token.strongs === 'G26')
  assert.equal(love.aligned.BSB, 'love')
  assert.ok(love.parses.length)
  assert.equal(love.aligned.ASV, undefined)
  for (const [book, chapter, verse, id, expected] of [
    ['John', 17, 8, 'G1325', [['ἔδωκάς', 'You gave'], ['δέδωκα', 'I have given']]],
    ['1Thess', 3, 5, 'G3985', [['ἐπείρασεν', 'tempted'], ['πειράζων', 'tempter']]]
  ]) {
    const row = (await call('getInterlinear', book, chapter, 'NA', ['BSB', 'ASV'])).verses.find(v => v.verse === verse)
    assert.deepEqual(row.tokens.filter(t => t.strongs === id).map(t => [t.lemma.normalize('NFC'), t.aligned.BSB]), expected)
    const printed = (await call('getChapter', { book, chapter, translation: 'ASV' })).verses.find(v => v.verse === verse)
    assert.equal(row.lines.find(l => l.id === 'ASV').text, printed.text)
  }
  const greek = await call('getOriginalVerseReadings', { translation: 'BSB', book: 'John', chapter: 1, verse: 18 })
  assert.ok(greek.readings.NA.words.some(word => word.surface.normalize('NFC') === 'θεὸς'))
  const psalm = await call('getOriginalVerseReadings', { translation: 'BSB', book: 'Ps', chapter: 51, verse: 1 })
  assert.equal(psalm.lxx.ref.chapter, 50)
  assert.equal(psalm.lxx.ref.verse, 3)
  assert.ok((await call('getChapterApparatus', 'Matt', 4)).some(v => v.verse === 10 && v.kind === 'greek'))

  const places = await call('getPlaces')
  assert.equal(places.length, 1274)
  assert.equal(places.find(p => p.name === 'Nod').lat, null)
  assert.ok(places.find(p => p.name === 'Rome').lat > 40)
  assert.ok((await call('getEvents')).some(event => event.places.some(p => p.name === 'Rome')))
  assert.ok(JSON.parse(await call('getMapLand')).features.length)
  const personMap = await call('getPersonMap', 2479)
  assert.ok(personMap.stops.some(stop => stop.placeId === 936 && stop.refs.includes('Acts.13.13')))
  const ancestry = await call('getAncestry', 1938)
  assert.equal(ancestry.length, 76)
  assert.equal(ancestry.at(-1).id, 1938)
  assert.equal(new Set(ancestry.map(person => person.id)).size, ancestry.length)
  const context = await call('getPassageContext', { edition: 'BSB', book: 'Gen', chapter: 4, firstVerse: 16 })
  assert.ok(context.places.some(p => p.name === 'Nod' && p.refs.includes('Gen.4.16')))
  const lessons = await call('getGrammarLessons')
  assert.ok(lessons.some(lesson => lesson.vocab.length && lesson.exercises.length))
})

test('installed phone stylesheet keeps scripture and study controls on their own size scales', async t => {
  const evaluate = await connect(t)
  for (let i = 0; i < 60 && !await evaluate('!!document.querySelector(".phone")'); i++) await pause(150)
  const values = await evaluate(`(() => {
    const sample = document.createElement('div')
    sample.className = 'phone'
    sample.inert = true
    sample.setAttribute('aria-hidden', 'true')
    sample.style.cssText = 'position:fixed;left:-10000px;top:0;width:384px;visibility:hidden'
    sample.innerHTML = '<nav class="tabbar"><button>Words</button></nav>' +
      '<div class="reader-pane"><div data-scripture-passage><span data-scripture-part>Word</span></div>' +
      '<div data-interlinear-reader><span class="text-xl" data-interlinear-form>λόγος</span>' +
      '<span class="text-[9px]">Morphology</span></div></div>' +
      '<div class="page-learn"><div class="work-content"><div class="text-7xl" dir="rtl">א</div>' +
      '<div class="text-5xl" dir="ltr">λόγος</div></div></div>' +
      '<div class="library-list"><h2 class="section-label">Study</h2></div>'
    document.body.append(sample)
    const size = selector => parseFloat(getComputedStyle(sample.querySelector(selector)).fontSize)
    try {
      const measured = [1.0625, 1.75].map(rem => {
        sample.style.setProperty('--reading-size', rem + 'rem')
        return [size('[data-scripture-part]'), size('[data-interlinear-form]'),
          size('.tabbar button'), size('.section-label'), size('[data-interlinear-reader] span:last-child'),
          size('[dir=rtl]'), size('[dir=ltr]')]
      })
      return { measured, root: parseFloat(getComputedStyle(document.documentElement).fontSize) }
    } finally { sample.remove() }
  })()`)
  const [normal, enlarged] = values.measured
  for (const reading of [normal, enlarged]) {
    const [verse, source, tab, section, morph, alphabet, vocab] = reading
    assert.equal(source, verse)
    for (const label of [tab, section, morph]) assert.ok(label >= .81 * values.root, 'legible metadata')
    assert.equal(alphabet, vocab)
    assert.ok(alphabet > values.root && alphabet <= 2.25 * values.root, 'study specimens stay in a common range')
  }
  assert.ok(enlarged[0] > normal[0])
  assert.deepEqual(enlarged.slice(2), normal.slice(2), 'reading preference changes scripture independently')
})
