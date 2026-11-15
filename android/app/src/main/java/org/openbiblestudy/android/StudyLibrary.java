package org.openbiblestudy.android;

import androidx.sqlite.SQLiteConnection;
import androidx.sqlite.SQLiteStatement;
import androidx.sqlite.driver.bundled.BundledSQLiteDriver;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/** Read-only queries against the same versioned Bible and alignments as the desktop edition. */
final class StudyLibrary implements AutoCloseable {
    final SQLiteConnection db;
    private final boolean verified;
    private static final Pattern GREEK_FORM = Pattern.compile("^\\p{IsGreek}[\\p{IsGreek}\\p{M}]*[᾽’']?$");
    private static final Pattern SEMITIC_FORM = Pattern.compile("^[א-ת][א-ת\\p{M}]*$");

    StudyLibrary(File file) {
        db = new BundledSQLiteDriver().open(file.getAbsolutePath(), 1); // SQLITE_OPEN_READONLY
        try {
            verified = "1".equals(scalar(db, "SELECT value FROM meta WHERE key='source_word_alignment_version'"));
        } catch (RuntimeException e) {
            db.close();
            throw e;
        }
    }

    @Override public void close() { db.close(); }

    static SQLiteStatement query(SQLiteConnection db, String sql, Object... args) {
        SQLiteStatement cursor = db.prepare(sql);
        try {
            for (int i = 0; i < args.length; i++) {
                Object arg = args[i];
                if (arg == null) cursor.bindNull(i + 1);
                else if (arg instanceof Double || arg instanceof Float) cursor.bindDouble(i + 1, ((Number) arg).doubleValue());
                else if (arg instanceof Number) cursor.bindLong(i + 1, ((Number) arg).longValue());
                else cursor.bindText(i + 1, (String) arg);
            }
            return cursor;
        } catch (RuntimeException e) {
            cursor.close();
            throw e;
        }
    }

    static String scalar(SQLiteConnection db, String sql, Object... args) {
        try (SQLiteStatement cursor = query(db, sql, args)) {
            return cursor.step() && !cursor.isNull(0) ? cursor.getText(0) : null;
        }
    }

    private static JSObject row(SQLiteStatement cursor) {
        JSObject row = new JSObject();
        for (int i = 0; i < cursor.getColumnCount(); i++) {
            String name = cursor.getColumnName(i);
            switch (cursor.getColumnType(i)) {
                case 1: row.put(name, cursor.getLong(i)); break;
                case 2: row.put(name, cursor.getDouble(i)); break;
                case 3: row.put(name, cursor.getText(i)); break;
                case 5: row.put(name, JSONObject.NULL); break;
                default: throw new IllegalStateException("Unexpected binary field " + name);
            }
        }
        return row;
    }

    static List<JSObject> rows(SQLiteConnection db, String sql, Object... args) {
        List<JSObject> result = new ArrayList<>();
        try (SQLiteStatement cursor = query(db, sql, args)) {
            while (cursor.step()) result.add(row(cursor));
        }
        return result;
    }

    static boolean isGreekNt(String id) {
        return id.equals("NA") || id.equals("TR") || id.equals("BYZ");
    }

    JSObject chapter(String translation, String book, int chapter) throws JSONException {
        String name = scalar(db, "SELECT name FROM books WHERE id=?", book);
        if (name == null) throw new IllegalArgumentException("Unknown book");
        JSObject result = new JSObject().put("translation", translation).put("book", book)
            .put("chapter", chapter).put("bookName", name)
            .put("direction", "MT".equals(translation) ? "rtl" : "ltr");
        if (isGreekNt(translation) || translation.equals("MT"))
            return result.put("verses", originalChapter(translation, book, chapter));

        Object[] address = { translation, book, chapter };
        Map<Integer, JSObject> verses = new LinkedHashMap<>();
        Map<Integer, List<JSObject>> tokens = new HashMap<>();
        for (JSObject verse : rows(db, "SELECT v.verse,v.text,l.marks FROM verses v " +
                "LEFT JOIN verse_layout l USING(translation_id,book_id,chapter,verse) " +
                "WHERE v.translation_id=? AND v.book_id=? AND v.chapter=? ORDER BY v.verse", address)) {
            String marks = verse.getString("marks");
            if (marks != null) verse.put("layout", new JSONArray(marks));
            verse.remove("marks");
            verse.put("tokens", JSONObject.NULL);
            verses.put(verse.getInt("verse"), verse);
        }
        if (translation.equals("BSB") || translation.equals("KJV")) {
            for (JSObject token : rows(db, "SELECT verse,position,surface,COALESCE(trailer,' ') AS trailer," +
                    "strongs,lemma,translit,morph,gloss FROM verse_tokens WHERE translation_id=? AND book_id=? " +
                    "AND chapter=? ORDER BY verse,position", address)) {
                int verse = token.getInt("verse");
                token.remove("verse");
                tokens.computeIfAbsent(verse, key -> new ArrayList<>()).add(token);
            }
            if (verified && !tokens.isEmpty()) addEvidence(translation, book, chapter, tokens);
            for (Map.Entry<Integer, List<JSObject>> entry : tokens.entrySet()) {
                JSObject verse = verses.get(entry.getKey());
                if (verse != null) verse.put("tokens", new JSONArray(entry.getValue()));
            }
        }
        return result.put("verses", new JSONArray(verses.values()));
    }

    // sourceWords.ts applies display policy to these occurrence records, including punctuation,
    // multiword spans and certified singletons. Dictionary headwords never enter this join.
    private void addEvidence(String translation, String book, int chapter, Map<Integer, List<JSObject>> tokens)
            throws JSONException {
        String sql = "SELECT s.verse,s.start_position,s.end_position,s.source_row,s.language,b.lemma AS text," +
            "b.translit,b.strongs,b.morph,cert.source_row IS NOT NULL AS standalone " +
            "FROM source_word_spans s JOIN verse_tokens b ON b.translation_id='BSB' AND b.book_id=s.book_id " +
            "AND b.chapter=s.chapter AND b.verse=s.verse AND b.position=s.bsb_position " +
            "LEFT JOIN source_word_singletons cert ON cert.translation_id=s.translation_id AND cert.book_id=s.book_id " +
            "AND cert.chapter=s.chapter AND cert.verse=s.verse AND cert.position=s.end_position " +
            "AND s.start_position=s.end_position AND cert.source_row=s.source_row " +
            "WHERE s.translation_id=? AND s.book_id=? AND s.chapter=?";
        for (JSObject span : rows(db, sql, translation, book, chapter)) {
            int verse = span.getInt("verse");
            int start = span.getInt("start_position"), end = span.getInt("end_position");
            List<JSObject> words = tokens.get(verse);
            if (words == null || start < 0 || end < start || end >= words.size()) continue;
            JSObject token = words.get(end);
            String id = token.getString("strongs");
            String translit = span.getString("translit");
            if (token.getInt("position") != end || id == null || !id.equals(span.getString("strongs")) ||
                    translit == null || translit.trim().isEmpty()) continue;
            String language = span.getString("language");
            String text = publisherForm(language, span.getString("text"));
            if (text == null) continue;
            StringBuilder english = new StringBuilder();
            for (int i = start; i < end; i++) english.append(words.get(i).getString("surface"))
                .append(words.get(i).getString("trailer"));
            english.append(token.getString("surface"));
            token.put("sourceWord", new JSObject().put("edition", "BSB").put("language", language)
                .put("rowId", span.getString("source_row")).put("book", book).put("chapter", chapter)
                .put("verse", verse).put("startPosition", start).put("endPosition", end).put("english", english.toString())
                .put("text", text).put("strongs", id).put("translit", translit).put("morph", span.getString("morph", ""))
                .put("evidence", translation.equals("BSB") ? "aligned" : "corroborated")
                .put("canReplaceAlone", span.getInt("standalone") == 1));
        }
    }

    private static String publisherForm(String language, String text) {
        if (text == null) return null;
        if ("Greek".equals(language)) return GREEK_FORM.matcher(text).matches() ? text : null;
        if (!"Hebrew".equals(language) && !"Aramaic".equals(language)) return null;
        String form = text.replaceFirst("׃[פס]$", "").replaceAll("^[־׀׃]+|[־׀׃]+$", "");
        return SEMITIC_FORM.matcher(form).matches() ? form : null;
    }

    private JSONArray originalChapter(String translation, String book, int chapter) throws JSONException {
        boolean masoretic = translation.equals("MT");
        String evidence = masoretic
            ? "0 AS uncertain,t.source_type AS sourceType,k.qere,k.ketiv FROM original_tokens t " +
              "LEFT JOIN ketiv_qere k ON k.book_id=t.book_id AND k.chapter=t.chapter AND k.verse=t.verse AND k.position=t.position "
            : "u.verse IS NOT NULL AS uncertain FROM original_tokens t LEFT JOIN greek_order_uncertainties u " +
              "ON u.edition=t.edition AND u.book_id=t.book_id AND u.chapter=t.chapter AND u.verse=t.verse ";
        List<JSObject> tokens = rows(db, "SELECT t.verse,t.position,t.original AS surface,t.strongs," +
                "t.translit,t.morph,t.gloss,t.native_chapter,t.native_verse," + evidence +
                "WHERE t.edition=? AND t.book_id=? AND t.chapter=? ORDER BY t.verse,t.position", translation, book, chapter);
        JSONArray result = new JSONArray();
        int start = 0;
        while (start < tokens.size()) {
            int verse = tokens.get(start).getInt("verse");
            int end = start + 1;
            while (end < tokens.size() && tokens.get(end).getInt("verse") == verse) end++;
            StringBuilder text = new StringBuilder();
            JSONArray words = new JSONArray();
            List<String> refs = new ArrayList<>();
            boolean uncertain = tokens.get(start).getInt("uncertain") == 1;
            for (int i = start; i < end; i++) {
                JSObject word = tokens.get(i);
                if (!word.isNull("native_chapter") && !word.isNull("native_verse")) {
                    String ref = word.getInt("native_chapter") + ":" + word.getInt("native_verse");
                    if (!refs.contains(ref)) refs.add(ref);
                }
                String trailer = i + 1 < end ? " " : "";
                String surface = word.getString("surface");
                if (masoretic) {
                    // TAHOT uses backslashes to delimit punctuation. Keep the punctuation itself.
                    surface = surface.replace("\\", "");
                    word.put("surface", surface);
                    if (!surface.equals(word.getString("qere"))) word.remove("ketiv");
                    else if (word.isNull("sourceType")) word.put("sourceType", "Q");
                    if (word.isNull("sourceType")) word.remove("sourceType");
                    word.remove("qere");
                }
                text.append(surface).append(trailer);
                word.put("trailer", trailer).put("lemma", JSONObject.NULL);
                for (String key : new String[] {"verse", "uncertain", "native_chapter", "native_verse"}) word.remove(key);
                words.put(word);
            }
            result.put(new JSObject().put("verse", verse).put("text", text.toString()).put("tokens", words)
                .put("nativeRefs", new JSONArray(refs)).put("orderUnverified", uncertain));
            start = end;
        }
        return result;
    }

    JSObject strongs(String raw) {
        String id = raw.trim().toUpperCase(Locale.ROOT).replaceFirst("^([GH])0+(\\d+)$", "$1$2");
        List<JSObject> entries = rows(db, "SELECT id,language,lemma,translit,pronunciation,definition,kjv_def AS kjvDef," +
            "derivation FROM strongs_lexicon WHERE id=?", id);
        JSObject entry = null;
        if (!entries.isEmpty()) {
            entry = entries.get(0);
            String definition = entry.getString("definition", ""), derivation = entry.getString("derivation", "");
            if (!derivation.isEmpty()) definition = definition.isEmpty() ? derivation : definition + " — " + derivation;
            if ("hebrew".equals(entry.getString("language")) && derivation.trim().toLowerCase(Locale.ROOT).startsWith("(aramaic)"))
                entry.put("sourceLanguage", "Aramaic");
            entry.remove("derivation");
            entry.put("lemma", entry.getString("lemma", "")).put("translit", entry.getString("translit", ""))
                .put("definition", definition);
        } else {
            List<JSObject> fallback = rows(db, "SELECT headword AS lemma,translit FROM lexicon_entries " +
                "WHERE strongs=? ORDER BY lexicon,sort,id LIMIT 1", id);
            if (!fallback.isEmpty()) {
                entry = fallback.get(0);
                entry.put("id", id).put("language", id.startsWith("H") ? "hebrew" : "greek")
                    .put("lemma", entry.getString("lemma", "")).put("translit", entry.getString("translit", ""))
                    .put("lexiconSource", "STEP").put("definition", "").put("pronunciation", JSONObject.NULL).put("kjvDef", JSONObject.NULL);
            }
        }
        if (entry != null) entry.put("occurrences", Integer.parseInt(scalar(db, "SELECT count(*) FROM verse_tokens WHERE strongs=?", id)));
        JSONArray coverage = verified ? new JSONArray(rows(db, "SELECT translation_id AS translation,occurrences " +
            "FROM source_word_coverage WHERE strongs=? ORDER BY translation_id", id)) : new JSONArray();
        return new JSObject().put("entry", entry == null ? JSONObject.NULL : entry).put("coverage", coverage);
    }
}
