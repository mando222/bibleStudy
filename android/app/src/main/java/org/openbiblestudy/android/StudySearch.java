package org.openbiblestudy.android;

import android.text.TextUtils;
import androidx.sqlite.SQLiteConnection;

import com.getcapacitor.JSObject;
import org.json.JSONArray;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.openbiblestudy.android.StudyLibrary.isGreekNt;
import static org.openbiblestudy.android.StudyLibrary.rows;
import static org.openbiblestudy.android.StudyLibrary.scalar;

/** FTS5 keys are folded at import. Original-script result text comes from the printed source. */
final class StudySearch {
    private static final Pattern GREEK = Pattern.compile("[\\u0370-\\u03ff\\u1f00-\\u1fff]");
    private static final Pattern HEBREW = Pattern.compile("[\\u0590-\\u05ff]");
    private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{N}]");
    private static final Pattern STRONGS = Pattern.compile("^([GH])0*(\\d{1,5})[a-z]?$", Pattern.CASE_INSENSITIVE);
    private static final String GREEK_ALIASES = "ABEZHIKMNOPTYXol";
    private static final String GREEK_LETTERS = "ΑΒΕΖΗΙΚΜΝΟΡΤΥΧοι";

    static JSObject search(SQLiteConnection db, String text, String translation, String greekEdition,
            String book, String testament, int limit, int offset) {
        String term = text.trim();
        Matcher strongs = STRONGS.matcher(term);
        if (strongs.matches()) {
            String id = strongs.group(1).toUpperCase(Locale.ROOT) + Integer.parseInt(strongs.group(2));
            return concordance(db, translation, id, book, testament, limit, offset);
        }
        boolean quoted = term.length() >= 2 && (
            (term.startsWith("\"") && term.endsWith("\"")) || (term.startsWith("“") && term.endsWith("”")));
        if (quoted) term = term.substring(1, term.length() - 1);
        boolean greek = GREEK.matcher(term).find(), hebrew = HEBREW.matcher(term).find();
        List<String> editions = new ArrayList<>();
        if (hebrew) editions.add("MT");
        else if (greek && !translation.equals("LXX") && !isGreekNt(translation)) {
            editions.add("LXX");
            editions.add(isGreekNt(greekEdition) ? greekEdition : "NA");
        } else editions.add(translation);
        if (greek) {
            term = term.replaceFirst("^(?:[IVXLCDM]{2,}|[VLCD])(?=[\\u0370-\\u03ff\\u1f00-\\u1fff])", "");
            StringBuilder folded = new StringBuilder(term.length());
            for (int i = 0; i < term.length(); i++) {
                char letter = term.charAt(i);
                int alias = GREEK_ALIASES.indexOf(letter);
                folded.append(alias >= 0 ? GREEK_LETTERS.charAt(alias) : letter);
            }
            term = folded.toString();
        }
        if (greek || hebrew) term = Normalizer.normalize(term, Normalizer.Form.NFD)
                .replaceAll("[\\u0300-\\u036f\\u0591-\\u05c7]", "").toLowerCase(Locale.ROOT).replace('ς', 'σ');
        List<String> words = new ArrayList<>();
        for (String word : term.replace('"', ' ').replace('*', ' ').trim().split("\\s+"))
            if (WORD.matcher(word).find()) words.add(word);
        if (words.isEmpty()) return empty();

        List<Object> args = new ArrayList<>();
        if (quoted) args.add("\"" + TextUtils.join(" ", words) + "\"");
        else args.add("\"" + TextUtils.join("\" \"", words) + "\"*");
        args.addAll(editions);
        String conditions = "verses_fts MATCH ? AND t.translation_id IN (" + (editions.size() == 2 ? "?,?" : "?") + ")" +
            scope(args, book, testament);
        String from = " FROM verses_fts t WHERE " + conditions;
        int total = Integer.parseInt(scalar(db, "SELECT count(*)" + from, args.toArray()));
        args.add(limit); args.add(offset);
        boolean includesGreekNt = editions.stream().anyMatch(StudyLibrary::isGreekNt);
        String greekFields = includesGreekNt
            ? ",CASE WHEN t.translation_id IN ('NA','BYZ','TR') THEN highlight(verses_fts,0,'{{','}}') END AS markedGreekKey," +
              orderStatus(db, "t.translation_id", "t") + " AS orderStatus" : "";
        List<JSObject> hits = rows(db, "SELECT t.translation_id AS translation,t.book_id AS book," +
                "(SELECT name FROM books WHERE id=t.book_id) AS bookName,CAST(t.chapter AS INTEGER) AS chapter," +
                "CAST(t.verse AS INTEGER) AS verse,snippet(verses_fts,0,'{{','}}','…',12) AS snippet" + greekFields + from +
                " ORDER BY rank,t.rowid LIMIT ? OFFSET ?", args.toArray());
        for (JSObject hit : hits) {
            String edition = hit.getString("translation");
            if (isGreekNt(edition)) {
                hit.put("edition", edition);
                hit.put("snippet", scalar(db, "SELECT group_concat(original,' ') FROM " +
                    "(SELECT original FROM original_tokens WHERE edition=? AND book_id=? AND chapter=? AND verse=? ORDER BY position)",
                    edition, hit.getString("book"), hit.getInteger("chapter"), hit.getInteger("verse")));
            } else if (edition.equals("MT") || edition.equals("LXX")) {
                hit.put("snippet", scalar(db, "SELECT text FROM verses WHERE translation_id=? AND book_id=? AND chapter=? AND verse=?",
                    edition, hit.getString("book"), hit.getInteger("chapter"), hit.getInteger("verse")));
            }
        }
        return new JSObject().put("total", total).put("hits", new JSONArray(hits));
    }

    private static JSObject empty() { return new JSObject().put("total", 0).put("hits", new JSONArray()); }

    private static String orderStatus(SQLiteConnection db, String editionColumn, String ref) {
        boolean reviewed = scalar(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='greek_order_uncertainties'") != null;
        String status = reviewed ? "(SELECT 'unverified' FROM greek_order_uncertainties u WHERE u.edition=" + editionColumn
            + " AND u.book_id=" + ref + ".book_id AND u.chapter=" + ref + ".chapter AND u.verse=" + ref + ".verse)" : "'unknown'";
        return "CASE WHEN " + editionColumn + " IN ('NA','TR','BYZ') THEN " + status + " END";
    }

    private static String scope(List<Object> args, String book, String testament) {
        String conditions = "";
        if (book != null && !book.isEmpty()) {
            conditions += " AND t.book_id=?";
            args.add(book);
        }
        if ("OT".equals(testament) || "NT".equals(testament)) {
            conditions += " AND t.book_id IN (SELECT id FROM books WHERE testament=?)";
            args.add(testament);
        }
        return conditions;
    }

    private static JSObject concordance(SQLiteConnection db, String edition, String id, String book, String testament,
            int limit, int offset) {
        boolean original = edition.equals("MT") || isGreekNt(edition);
        if (!original && !edition.equals("BSB") && !edition.equals("KJV"))
            return empty().put("notice", "This edition has no verified Strong’s word tags in the Android reader.");
        String table = original ? "original_tokens" : "verse_tokens";
        String editionColumn = original ? "edition" : "translation_id";
        List<Object> args = new ArrayList<>(Arrays.asList(edition, id));
        String refs = "SELECT DISTINCT t." + editionColumn + " AS edition,t.book_id,t.chapter,t.verse FROM " + table + " t WHERE t." + editionColumn +
                "=? AND t.strongs=?" + scope(args, book, testament);
        int total = Integer.parseInt(scalar(db, "SELECT count(*) FROM (" + refs + ")", args.toArray()));
        args.add(limit); args.add(offset);
        String statusField = isGreekNt(edition) ? "," + orderStatus(db, "r.edition", "r") + " AS orderStatus" : "";
        List<JSObject> hits = rows(db, "SELECT r.book_id AS book,b.name AS bookName,r.chapter,r.verse" + statusField + " FROM (" + refs +
            ") r JOIN books b ON b.id=r.book_id ORDER BY b.sort_order,r.chapter,r.verse LIMIT ? OFFSET ?", args.toArray());
        for (JSObject hit : hits) {
            List<JSObject> words = rows(db, "SELECT " + (original ? "original AS surface" : "surface,trailer") +
                ",strongs FROM " + table + " WHERE " + editionColumn + "=? AND book_id=? AND chapter=? AND verse=? ORDER BY position",
                edition, hit.getString("book"), hit.getInteger("chapter"), hit.getInteger("verse"));
            StringBuilder snippet = new StringBuilder();
            for (int i = 0; i < words.size(); i++) {
                JSObject word = words.get(i);
                String surface = word.getString("surface");
                if (edition.equals("MT")) surface = surface.replace("\\", "");
                if (id.equals(word.getString("strongs"))) snippet.append("{{").append(surface).append("}}");
                else snippet.append(surface);
                snippet.append(word.getString("trailer", i + 1 < words.size() ? " " : ""));
            }
            hit.put("translation", edition).put("snippet", snippet.toString());
            if (isGreekNt(edition)) hit.put("edition", edition);
        }
        return new JSObject().put("total", total).put("hits", new JSONArray(hits));
    }
}
