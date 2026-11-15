package org.openbiblestudy.android;

import static org.openbiblestudy.android.PersonalStore.*;
import static org.openbiblestudy.android.StudyLibrary.*;

import androidx.sqlite.SQLiteConnection;
import androidx.sqlite.SQLiteStatement;
import androidx.sqlite.driver.bundled.BundledSQLiteDriver;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;

final class ImportedModules {
    private final SQLiteConnection db;
    private String indexed;
    private static final Pattern METADATA =
            Pattern.compile("<(S|m|n|f)>.*?</\\1>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern ENTITIES =
            Pattern.compile("&(#\\w*|[A-Za-z][A-Za-z0-9]*);");
    private static final Pattern BLOCK = Pattern.compile("</?(?:br|p|div)\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern TAG = Pattern.compile("</?[a-zA-Z][\\w:-]*(?:\\s[^<>]*)?\\s*/?>");
    private static final Pattern NUMBER = Pattern.compile("#(?:[xX]([0-9a-fA-F]+)|([0-9]+))");
    private static final Pattern SPACES = Pattern.compile("\\s+");
    private static final Pattern MARKS =
            Pattern.compile(
                    "[\\u0300-\\u036f\\u0591-\\u05bd\\u05bf\\u05c1-\\u05c2\\u05c4-\\u05c5\\u05c7]");

    ImportedModules(SQLiteConnection db) {
        this.db = db;
    }

    void invalidate(String id) {
        if (id.equals(indexed)) indexed = null;
    }

    JSONArray list() {
        List<JSObject> list =
                rows(
                        db,
                        "SELECT id,abbrev,name,direction,'imported' AS language,'User-imported' AS"
                            + " license,'Imported from a module you supplied.' AS attribution FROM"
                            + " imported_translations ORDER BY added_at");
        for (JSObject r : list) r.put("isOriginal", false).put("hasStrongs", false);
        return new JSONArray(list);
    }

    JSObject chapter(JSONObject p) throws Exception {
        return new JSObject()
                .put(
                        "direction",
                        scalar(
                                db,
                                "SELECT direction FROM imported_translations WHERE id=?",
                                p.getString("translation")))
                .put(
                        "verses",
                        array(
                                db,
                                "SELECT verse,text,NULL AS tokens FROM imported_verses WHERE"
                                        + " translation_id=? AND book_id=? AND chapter=? ORDER BY"
                                        + " verse",
                                p.getString("translation"),
                                p.getString("book"),
                                p.getInt("chapter")));
    }

    private static String quote(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }

    JSObject importFile(File file, String fileName, JSONArray books, PersonalStore store)
            throws Exception {
        JSONObject named;
        try (InputStream in = store.context.getAssets().open("htmlEntities.json")) {
            named = new JSONObject(read(in));
        }
        try (SQLiteConnection src = new BundledSQLiteDriver().open(file.getPath(), 1)) {
            exec(src, "PRAGMA trusted_schema=OFF");
            String table = null, text = null;
            for (JSObject t :
                    rows(
                            src,
                            "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY CASE"
                                    + " LOWER(name) WHEN 'bible' THEN 0 ELSE 1 END")) {
                String name = t.getString("name");
                Set<String> cols = new HashSet<>();
                for (JSObject r : rows(src, "SELECT name FROM pragma_table_info(?)", name))
                    cols.add(r.getString("name").toLowerCase(Locale.ROOT));
                if (cols.contains("book")
                        && cols.contains("chapter")
                        && cols.contains("verse")
                        && (cols.contains("scripture") || cols.contains("text"))) {
                    table = quote(name);
                    text = cols.contains("scripture") ? "Scripture" : "text";
                    break;
                }
            }
            if (table == null)
                throw new IOException(
                        "Choose a MySword or e-Sword Bible module containing Book, Chapter, Verse"
                                + " and Scripture.");
            String name = fileName.replaceFirst("\\.[^.]+$", ""), abbr = "", dir = "ltr";
            if (scalar(
                            src,
                            "SELECT name FROM sqlite_schema WHERE type='table' AND"
                                    + " lower(name)='details'")
                    != null) {
                JSObject d = one(src, "SELECT * FROM Details LIMIT 1");
                if (d != null)
                    for (Iterator<String> it = d.keys(); it.hasNext(); ) {
                        String key = it.next(), value = d.optString(key, "");
                        if (d.isNull(key) || value.isEmpty()) continue;
                        if (key.equalsIgnoreCase("title")) name = value;
                        if (key.equalsIgnoreCase("description")
                                && name.equals(fileName.replaceFirst("\\.[^.]+$", "")))
                            name = value;
                        if (key.equalsIgnoreCase("abbreviation")) abbr = value;
                        if (key.equalsIgnoreCase("righttoleft")
                                && (value.equals("1") || value.equalsIgnoreCase("true")))
                            dir = "rtl";
                    }
            }
            String id = "imp_" + UUID.randomUUID();
            final String title = name, direction = dir, abbrBase = abbr.isEmpty() ? name : abbr;
            final String abbreviation = abbrBase.substring(0, Math.min(8, abbrBase.length()));
            final String select = "SELECT Book,Chapter,Verse," + text + " FROM " + table;
            return store.transaction(
                    () -> {
                        exec(
                                db,
                                "INSERT INTO imported_translations VALUES(?,?,?,?,?)",
                                id,
                                abbreviation,
                                title,
                                direction,
                                System.currentTimeMillis());
                        try (SQLiteStatement source = src.prepare(select);
                                SQLiteStatement put =
                                        db.prepare(
                                                "INSERT OR REPLACE INTO imported_verses"
                                                        + " VALUES(?,?,?,?,?)")) {
                            while (source.step()) {
                                int book = (int) source.getLong(0);
                                if (book < 1 || book > books.length()) continue;
                                long chapter = parseReference(source, 1),
                                        verse = parseReference(source, 2);
                                if (chapter < 1 || verse < 1 || source.getColumnType(3) != 3)
                                    throw new IOException(
                                            "Invalid chapter, verse or text in the Bible module.");
                                String plain = verseText(source.getText(3), named, books.getString(book - 1) + " " + chapter + ":" + verse);
                                if (plain.isEmpty()) continue;
                                put.bindText(1, id);
                                put.bindText(2, books.getString(book - 1));
                                put.bindLong(3, chapter);
                                put.bindLong(4, verse);
                                put.bindText(5, plain);
                                put.step();
                                put.reset();
                            }
                        }
                        int count =
                                Integer.parseInt(
                                        scalar(
                                                db,
                                                "SELECT count(*) FROM imported_verses WHERE"
                                                        + " translation_id=?",
                                                id));
                        if (count == 0)
                            throw new IOException("No readable verses found in this module.");
                        return new JSObject()
                                .put("id", id)
                                .put("abbrev", abbreviation)
                                .put("name", title)
                                .put("direction", direction)
                                .put("verseCount", count);
                    });
        }
    }

    private static long parseReference(SQLiteStatement source, int column) throws IOException {
        String input = source.getText(column);
        try {
            long result = Long.parseLong(input);
            if (result > 0 && result <= Integer.MAX_VALUE) return result;
        } catch (NumberFormatException ignored) {
            // Continue to the user-facing module error below.
        }
        throw new IOException("The Bible module contains an invalid chapter or verse number.");
    }

    private static String verseText(String source, JSONObject named, String reference) throws IOException {
        String scripture = METADATA.matcher(source).replaceAll("");
        String plain = TAG.matcher(BLOCK.matcher(scripture).replaceAll(" ")).replaceAll("");
        // Decode entities only after stripping actual module markup. A published escaped
        // angle bracket is part of the verse and must survive the formatting pass.
        java.util.regex.Matcher entities = ENTITIES.matcher(plain);
        StringBuffer decoded = new StringBuffer();
        while (entities.find()) {
            String name = entities.group(1);
            String value = named.optString(name, null);
            if (value == null) {
                java.util.regex.Matcher number = NUMBER.matcher(name);
                if (number.matches()) {
                    try {
                        boolean hex = number.group(1) != null;
                        int cp = Integer.parseInt(number.group(hex ? 1 : 2), hex ? 16 : 10);
                        if ((cp == 9 || cp == 10 || cp == 13 || cp >= 32) && cp <= Character.MAX_CODE_POINT
                                && !(cp >= 0x7f && cp <= 0x9f) && !(cp >= 0xd800 && cp <= 0xdfff))
                            value = new String(Character.toChars(cp));
                    } catch (NumberFormatException ignored) {
                        // Report an uninterpretable reference below.
                    }
                }
                if (value == null)
                    throw new IOException("Cannot read the character reference " + entities.group() + " at " + reference + ".");
            }
            entities.appendReplacement(decoded, java.util.regex.Matcher.quoteReplacement(value));
        }
        entities.appendTail(decoded);
        return SPACES.matcher(decoded.toString().replace('\u00a0', ' ')).replaceAll(" ").trim();
    }

    private String folded(String s) {
        return MARKS.matcher(Normalizer.normalize(s, Normalizer.Form.NFD))
                .replaceAll("")
                .toLowerCase(Locale.ROOT)
                .replace('ς', 'σ');
    }

    private void index(String edition) {
        if (edition.equals(indexed)) return;
        exec(
                db,
                "CREATE VIRTUAL TABLE IF NOT EXISTS temp.import_search USING fts5(terms,book"
                        + " UNINDEXED,chapter UNINDEXED,verse UNINDEXED,text UNINDEXED)");
        exec(db, "SAVEPOINT index_import");
        try {
            exec(db, "DELETE FROM import_search");
            try (SQLiteStatement src =
                            query(
                                    db,
                                    "SELECT book_id,chapter,verse,text FROM imported_verses WHERE"
                                            + " translation_id=?",
                                    edition);
                    SQLiteStatement put =
                            db.prepare("INSERT INTO import_search VALUES(?,?,?,?,?)")) {
                while (src.step()) {
                    String original = src.getText(3);
                    put.bindText(1, folded(original));
                    put.bindText(2, src.getText(0));
                    put.bindLong(3, src.getLong(1));
                    put.bindLong(4, src.getLong(2));
                    put.bindText(5, original);
                    put.step();
                    put.reset();
                }
            }
            exec(db, "RELEASE index_import");
            indexed = edition;
        } catch (RuntimeException e) {
            exec(db, "ROLLBACK TO index_import");
            exec(db, "RELEASE index_import");
            throw e;
        }
    }

    JSObject search(JSONObject p) throws Exception {
        String edition = p.getString("translation"), text = p.getString("text").trim();
        JSObject empty = new JSObject().put("total", 0).put("hits", new JSONArray());
        if (text.matches("(?i)[GH]0*[0-9]{1,5}[a-z]?"))
            return empty.put("notice", "This imported translation has no Strong’s word tags.");
        boolean exact =
                text.length() >= 2
                        && ((text.startsWith("\"") && text.endsWith("\""))
                                || (text.startsWith("“") && text.endsWith("”")));
        String folded =
                folded(text)
                        .replace('"', ' ')
                        .replace('“', ' ')
                        .replace('”', ' ')
                        .replace('*', ' ')
                        .trim();
        StringBuilder terms = new StringBuilder();
        for (String word : folded.split("\\s+"))
            if (Pattern.compile("[\\p{L}\\p{N}]").matcher(word).find()) {
                if (terms.length() > 0) terms.append(' ');
                if (exact) terms.append(word);
                else terms.append('"').append(word).append('"');
            }
        if (terms.length() == 0) return empty;
        ArrayList<Object> args = new ArrayList<>();
        args.add(exact ? "\"" + terms + "\"" : terms + "*");
        StringBuilder scope = new StringBuilder(" WHERE import_search MATCH ?");
        if (!p.isNull("book")) {
            scope.append(" AND book=?");
            args.add(p.getString("book"));
        }
        if (p.has("books")) {
            JSONArray list = p.getJSONArray("books");
            if (list.length() == 0) return empty;
            scope.append(" AND book IN (");
            for (int i = 0; i < list.length(); i++) {
                if (i > 0) scope.append(',');
                scope.append('?');
                args.add(list.getString(i));
            }
            scope.append(')');
        }
        index(edition);
        long count =
                Long.parseLong(
                        scalar(db, "SELECT count(*) FROM import_search" + scope, args.toArray()));
        args.add(Math.min(300, Math.max(1, p.optInt("limit", 100))));
        args.add(Math.max(0, p.optInt("offset", 0)));
        List<JSObject> hits =
                rows(
                        db,
                        "SELECT book,chapter,verse,text AS snippet FROM import_search"
                                + scope
                                + " ORDER BY rank,rowid LIMIT ? OFFSET ?",
                        args.toArray());
        for (JSObject hit : hits) hit.put("translation", edition);
        return new JSObject().put("total", count).put("hits", new JSONArray(hits));
    }
}
