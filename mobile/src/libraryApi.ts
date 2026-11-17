import type { BibleApi } from '@shared/types'
import { importedPassageContext } from '@shared/passageStudy'
import type { BundledLibrary } from './bundledLibrary'
import { bundledQueries } from './libraryWorkerClient'
import { importedLibrary } from './personalApi'
import { Study } from './study'

type CorpusApi = Pick<BibleApi, keyof BundledLibrary>

/** Library methods exposed to the reader. Local imports never receive the corpus's word links. */
export const libraryApi: CorpusApi = {
  listEditions: bundledQueries.listEditions,
  getStrongs: bundledQueries.getStrongs,
  getSourceWordCoverage: bundledQueries.getSourceWordCoverage,
  browseLexicon: bundledQueries.browseLexicon,
  getWordFrequency: bundledQueries.getWordFrequency,
  getWordFrequencyPassages: bundledQueries.getWordFrequencyPassages,
  getLexiconEntries: bundledQueries.getLexiconEntries,
  getLexiconByWord: bundledQueries.getLexiconByWord,
  getConcordance: bundledQueries.getConcordance,
  getInterlinear: bundledQueries.getInterlinear,
  getChapterApparatus: bundledQueries.getChapterApparatus,
  getOriginalVerseReadings: bundledQueries.getOriginalVerseReadings,
  getPeoplePage: bundledQueries.getPeoplePage,
  getPeople: bundledQueries.getPeople,
  getPerson: bundledQueries.getPerson,
  getAncestry: bundledQueries.getAncestry,
  getPlaces: bundledQueries.getPlaces,
  getPlaceVerses: bundledQueries.getPlaceVerses,
  getEvents: bundledQueries.getEvents,
  getMappedPeople: bundledQueries.getMappedPeople,
  getPersonMap: bundledQueries.getPersonMap,
  getMapLand: bundledQueries.getMapLand,
  getMapRegions: bundledQueries.getMapRegions,
  getCrossReferences: bundledQueries.getCrossReferences,
  getVocab: bundledQueries.getVocab,
  getGrammarLessons: bundledQueries.getGrammarLessons,
  getGrammarLesson: bundledQueries.getGrammarLesson,
  async listTranslations() {
    const [bundled, imported] = await Promise.all([bundledQueries.listTranslations(), importedLibrary.list()])
    return [...bundled, ...imported]
  },
  listReadingChapters(edition, interlinear) {
    return edition.startsWith('imp_') ? importedLibrary.chapters(edition) : bundledQueries.listReadingChapters(edition, interlinear)
  },
  listReadingVerses(ref, interlinear) {
    return ref.translation.startsWith('imp_') ? importedLibrary.verses(ref) : bundledQueries.listReadingVerses(ref, interlinear)
  },
  getChapter(ref) {
    if (ref.translation.startsWith('imp_')) return importedLibrary.chapter(ref)
    // The native original-text reader includes source readings, attestations and paired forms.
    if (['MT', 'NA', 'TR', 'BYZ'].includes(ref.translation)) return Study.getChapter(ref)
    return bundledQueries.getChapter(ref)
  },
  getComparisonVerse(ref) {
    return ref.translation.startsWith('imp_') ? importedLibrary.comparison(ref) : bundledQueries.getComparisonVerse(ref)
  },
  async getPassageContext(range) {
    if (!range.edition.startsWith('imp_')) return bundledQueries.getPassageContext(range)
    const chapter = await importedLibrary.chapter({ translation: range.edition, book: range.book, chapter: range.chapter })
    return importedPassageContext(range, chapter.verses)
  },
  search(query) {
    if (query.translation.startsWith('imp_')) return importedLibrary.search(query)
    // The shared concordance also resolves the inferred Strong’s links in other English editions.
    if (/^[GH]0*\d{1,5}[a-z]?$/i.test(query.text.trim())) return bundledQueries.search(query)
    // Native FTS supports quoted phrases and returns printed, accented text for original-script searches.
    return Study.search(query)
  }
}
