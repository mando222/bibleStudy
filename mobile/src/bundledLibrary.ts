// Worker entry points use the same corpus queries as Electron's main process.
import * as bible from '../../src/main/db/bible'
import * as graph from '../../src/main/db/graph'
import { getWordFrequency, getWordFrequencyPassages } from '../../src/main/db/wordFrequency'
import { getMappedPeople, getPassageContext, getPersonMap } from '../../src/main/db/passageStudy'

export const bundledLibrary = {
  listTranslations: bible.listTranslations,
  listEditions: bible.listEditions,
  listReadingChapters: bible.listReadingChapters,
  getChapter: bible.getChapter,
  getComparisonVerse: bible.getComparisonVerse,
  getStrongs: bible.getStrongs,
  getSourceWordCoverage: bible.getSourceWordCoverage,
  browseLexicon: bible.browseLexicon,
  getWordFrequency,
  getWordFrequencyPassages,
  getLexiconEntries: bible.getLexiconEntries,
  getLexiconByWord: bible.getLexiconByWord,
  getConcordance: bible.getConcordance,
  search: bible.search,
  getInterlinear: bible.getInterlinear,
  getChapterApparatus: bible.getChapterApparatus,
  getOriginalVerseReadings: bible.getOriginalVerseReadings,
  getPeoplePage: graph.getPeoplePage,
  getPeople: graph.getPeople,
  getPerson: graph.getPerson,
  getAncestry: graph.getAncestry,
  getPlaces: graph.getPlaces,
  getPlaceVerses: graph.getPlaceVerses,
  getEvents: graph.getEvents,
  getMappedPeople,
  getPassageContext,
  getPersonMap,
  getMapLand: bible.getMapLand,
  getMapRegions: bible.getMapRegions,
  getCrossReferences: bible.getCrossReferences,
  getVocab: bible.getVocab,
  getGrammarLessons: bible.getGrammarLessons,
  getGrammarLesson: bible.getGrammarLesson
}
export type BundledLibrary = typeof bundledLibrary
