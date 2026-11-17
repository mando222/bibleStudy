package org.openbiblestudy.android;

import static org.openbiblestudy.android.StudyLibrary.rows;
import static org.openbiblestudy.android.StudyLibrary.scalar;

import android.content.Context;

import androidx.sqlite.SQLiteConnection;
import androidx.sqlite.SQLiteStatement;
import androidx.sqlite.driver.bundled.BundledSQLiteDriver;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** One write connection per profile, exclusively used on the personal plugin's worker thread. */
final class PersonalStore implements AutoCloseable {
    final SQLiteConnection db;
    final File directory;
    final String id;
    final Context context;
    static final String PREFS = "study-profiles";
    static final String NOTES =
            "SELECT id,book,chapter,verse,body,created_at AS createdAt,updated_at AS updatedAt FROM"
                + " notes";
    static final String MARKS =
            "SELECT id,translation,book,chapter,verse,start_token AS startToken,end_token AS"
                + " endToken,color,created_at AS createdAt FROM highlights";
    static final String BOOKMARKS =
            "SELECT id,name,book,chapter,verse,note,created_at AS createdAt FROM bookmarks";
    static final String CARDS =
            "SELECT strongs,language,ease,interval_days AS intervalDays,due_at AS"
                + " dueAt,reps,lapses,last_grade AS lastGrade,updated_at AS updatedAt FROM"
                + " srs_cards";
    final StudyNotebook notebook;
    final ImportedModules imports;

    static File folder(Context c, String id) {
        return new File(new File(c.getFilesDir(), "study-profiles"), id);
    }

    static String active(Context c) {
        return c.getSharedPreferences(PREFS, 0).getString("active", "default");
    }

    PersonalStore(Context c, String profile) throws Exception {
        context = c;
        id = profile;
        directory = folder(c, id);
        mkdir(directory);
        db = new BundledSQLiteDriver().open(new File(directory, "user.sqlite").getPath());
        try {
            exec(db, "PRAGMA trusted_schema=OFF");
            transaction(
                    () -> {
                        String schema;
                        try (InputStream in =
                                c.getResources().openRawResource(R.raw.personal_schema)) {
                            schema = read(in);
                        }
                        for (String sql : schema.split(";"))
                            if (!sql.trim().isEmpty()) exec(db, sql);
                        String version =
                                scalar(
                                        db,
                                        "SELECT value FROM user_meta WHERE key='schema_version'");
                        if (version != null && !version.equals("2"))
                            throw new IOException("Unsupported study database version.");
                        exec(db, "INSERT OR IGNORE INTO user_meta VALUES('schema_version','2')");
                        return null;
                    });
            if (id.equals("default")) migrateTrial(c.getDatabasePath("study-notes.sqlite"));
            imports = new ImportedModules(db);
            notebook = new StudyNotebook(c, directory, id);
        } catch (Exception e) {
            db.close();
            throw e;
        }
    }

    private void migrateTrial(File previous) throws Exception {
        if (!previous.exists()
                || scalar(db, "SELECT value FROM user_meta WHERE key='android_trial_migrated'")
                        != null) return;
        exec(db, "ATTACH DATABASE ? AS trial", previous.getPath());
        try {
            transaction(
                    () -> {
                        // The trial exposed only BSB/KJV. Its BSB Philippians 1:16 and 1:17 use the
                        // opposite
                        // order from the canonical KJV references used for shared desktop notes.
                        exec(
                                db,
                                "INSERT INTO notes(book,chapter,verse,body,created_at,updated_at)"
                                    + " SELECT book,chapter,CASE WHEN translation='BSB' AND"
                                    + " book='Phil' AND chapter=1 AND verse IN (16,17) THEN"
                                    + " 33-verse ELSE verse END,body,created_at,updated_at FROM"
                                    + " trial.notes ORDER BY id");
                        exec(
                                db,
                                "INSERT INTO"
                                    + " highlights(translation,book,chapter,verse,color,created_at)"
                                    + " SELECT translation,book,chapter,verse,color,created_at FROM"
                                    + " trial.highlights ORDER BY id");
                        exec(db, "INSERT INTO user_meta VALUES('android_trial_migrated','1')");
                        return null;
                    });
        } finally {
            exec(db, "DETACH DATABASE trial");
        }
    }

    static void mkdir(File dir) throws IOException {
        if (!dir.isDirectory() && !dir.mkdirs())
            throw new IOException("Could not create " + dir.getName());
    }

    static String read(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        copy(in, out);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[65536];
        int n;
        while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
    }

    static SQLiteStatement prepare(SQLiteConnection db, String sql, Object... params) {
        SQLiteStatement st = db.prepare(sql);
        try {
            for (int i = 0; i < params.length; i++) {
                Object p = params[i];
                int ix = i + 1;
                if (p == null || p == JSONObject.NULL) st.bindNull(ix);
                else if (p instanceof Double || p instanceof Float)
                    st.bindDouble(ix, ((Number) p).doubleValue());
                else if (p instanceof Number) st.bindLong(ix, ((Number) p).longValue());
                else if (p instanceof byte[]) st.bindBlob(ix, (byte[]) p);
                else st.bindText(ix, (String) p);
            }
            return st;
        } catch (RuntimeException e) {
            st.close();
            throw e;
        }
    }

    static void exec(SQLiteConnection db, String sql, Object... params) {
        try (SQLiteStatement s = prepare(db, sql, params)) {
            s.step();
        }
    }

    interface Task<T> {
        T run() throws Exception;
    }

    <T> T transaction(Task<T> task) throws Exception {
        exec(db, "BEGIN IMMEDIATE");
        try {
            T result = task.run();
            exec(db, "COMMIT");
            return result;
        } catch (Exception e) {
            exec(db, "ROLLBACK");
            throw e;
        }
    }

    static JSONArray array(SQLiteConnection db, String sql, Object... args) {
        return new JSONArray(rows(db, sql, args));
    }

    static JSObject one(SQLiteConnection db, String sql, Object... args) {
        List<JSObject> result = rows(db, sql, args);
        return result.isEmpty() ? null : result.get(0);
    }

    long lastId() {
        return Long.parseLong(scalar(db, "SELECT last_insert_rowid()"));
    }

    Object handle(String op, JSONObject p) throws Exception {
        if (op.startsWith("notebook")) return notebook.handle(op, p);
        switch (op) {
            case "hasRecovery":
                return context.getSharedPreferences(PREFS, 0).contains("recovery");
            case "profile":
                {
                    File file = new File(directory, "reader-state.json");
                    String state = null;
                    if (file.isFile())
                        try (InputStream in = new FileInputStream(file)) {
                            state = read(in);
                        }
                    return new JSObject()
                            .put("id", id.equals("default") ? "" : id)
                            .put("initialState", state == null ? JSONObject.NULL : state);
                }
            case "notes":
                return array(
                        db,
                        NOTES + " WHERE book=? AND chapter=? ORDER BY verse,id",
                        p.getString("book"),
                        p.getInt("chapter"));
            case "saveNote":
                {
                    long now = System.currentTimeMillis(), key = p.optLong("id");
                    if (key > 0)
                        exec(
                                db,
                                "UPDATE notes SET body=?,verse=?,updated_at=? WHERE id=?",
                                p.getString("body"),
                                p.getInt("verse"),
                                now,
                                key);
                    else {
                        exec(
                                db,
                                "INSERT INTO notes(book,chapter,verse,body,created_at,updated_at)"
                                    + " VALUES(?,?,?,?,?,?)",
                                p.getString("book"),
                                p.getInt("chapter"),
                                p.getInt("verse"),
                                p.getString("body"),
                                now,
                                now);
                        key = lastId();
                    }
                    JSObject note = one(db, NOTES + " WHERE id=?", key);
                    if (note == null) throw new IOException("Note no longer exists.");
                    return note;
                }
            case "deleteNote":
                exec(db, "DELETE FROM notes WHERE id=?", p.getLong("id"));
                return null;
            case "highlights":
                return array(
                        db,
                        MARKS + " WHERE translation=? AND book=? AND chapter=?",
                        p.getString("translation"),
                        p.getString("book"),
                        p.getInt("chapter"));
            case "saveHighlight":
                return transaction(
                        () -> {
                            String edition = p.getString("translation"),
                                    book = p.getString("book"),
                                    color = p.getString("color");
                            if (!color.matches("yellow|green|blue|pink|orange"))
                                throw new IOException("Unknown highlight color.");
                            int chapter = p.getInt("chapter"), verse = p.getInt("verse");
                            if (p.isNull("startToken"))
                                exec(
                                        db,
                                        "DELETE FROM highlights WHERE translation=? AND book=? AND"
                                            + " chapter=? AND verse=? AND start_token IS NULL",
                                        edition,
                                        book,
                                        chapter,
                                        verse);
                            exec(
                                    db,
                                    "INSERT INTO"
                                        + " highlights(translation,book,chapter,verse,start_token,end_token,color,created_at)"
                                        + " VALUES(?,?,?,?,?,?,?,?)",
                                    edition,
                                    book,
                                    chapter,
                                    verse,
                                    p.opt("startToken"),
                                    p.opt("endToken"),
                                    color,
                                    System.currentTimeMillis());
                            return one(db, MARKS + " WHERE id=?", lastId());
                        });
            case "deleteHighlight":
                exec(db, "DELETE FROM highlights WHERE id=?", p.getLong("id"));
                return null;
            case "bookmarks":
                return array(db, BOOKMARKS + " ORDER BY created_at DESC,id DESC");
            case "addBookmark":
                {
                    exec(
                            db,
                            "INSERT INTO bookmarks(name,book,chapter,verse,note,created_at)"
                                + " VALUES(?,?,?,?,?,?)",
                            p.getString("name"),
                            p.getString("book"),
                            p.getInt("chapter"),
                            p.optInt("verse", 1),
                            p.opt("note"),
                            System.currentTimeMillis());
                    return one(db, BOOKMARKS + " WHERE id=?", lastId());
                }
            case "deleteBookmark":
                exec(db, "DELETE FROM bookmarks WHERE id=?", p.getLong("id"));
                return null;
            case "addHistory":
                return transaction(
                        () -> {
                            String book = p.getString("book");
                            int chapter = p.getInt("chapter");
                            JSObject last =
                                    one(
                                            db,
                                            "SELECT book,chapter FROM reading_history ORDER BY id"
                                                + " DESC LIMIT 1");
                            if (last == null
                                    || !book.equals(last.getString("book"))
                                    || chapter != last.getInt("chapter")) {
                                exec(
                                        db,
                                        "INSERT INTO reading_history(book,chapter,verse,visited_at)"
                                            + " VALUES(?,?,?,?)",
                                        book,
                                        chapter,
                                        p.opt("verse"),
                                        System.currentTimeMillis());
                                exec(
                                        db,
                                        "DELETE FROM reading_history WHERE id NOT IN (SELECT id"
                                            + " FROM reading_history ORDER BY id DESC LIMIT 200)");
                            }
                            return null;
                        });
            case "history":
                return array(
                        db,
                        "SELECT id,book,chapter,verse,visited_at AS visitedAt FROM reading_history"
                            + " ORDER BY id DESC LIMIT ?",
                        p.optInt("limit", 50));
            case "dueCards":
                return array(
                        db,
                        CARDS + " WHERE language=? AND due_at<=? ORDER BY due_at LIMIT ?",
                        p.getString("language"),
                        System.currentTimeMillis(),
                        p.optInt("limit", 100));
            case "reviewCard":
                return review(p);
            case "seenCards":
                {
                    JSONArray cards = new JSONArray();
                    for (JSObject row :
                            rows(
                                    db,
                                    "SELECT strongs FROM srs_cards WHERE language=?",
                                    p.getString("language"))) cards.put(row.getString("strongs"));
                    return cards;
                }
            case "srsStats":
                return one(
                        db,
                        "SELECT count(*) AS total,count(*) FILTER(WHERE due_at<=?) AS due,count(*)"
                            + " FILTER(WHERE reps>0) AS learned FROM srs_cards WHERE language=?",
                        System.currentTimeMillis(),
                        p.getString("language"));
            case "getProgress":
                {
                    JSObject result = new JSObject();
                    for (JSObject row :
                            rows(
                                    db,
                                    "SELECT key,value FROM learn_progress WHERE module=?",
                                    p.getString("module")))
                        result.put(row.getString("key"), row.getString("value"));
                    return result;
                }
            case "setProgress":
                exec(
                        db,
                        "INSERT OR REPLACE INTO learn_progress(module,key,value,updated_at)"
                            + " VALUES(?,?,?,?)",
                        p.getString("module"),
                        p.getString("key"),
                        p.getString("value"),
                        System.currentTimeMillis());
                return null;
            case "imports":
                return imports.list();
            case "importChapters":
                return array(db, "SELECT book_id AS book, chapter, MIN(verse) AS firstVerse FROM imported_verses WHERE translation_id=? GROUP BY book_id, chapter",
                        p.getString("translation"));
            case "importChapter":
                return imports.chapter(p);
            case "importVerseNumbers":
                return array(db, "SELECT verse FROM imported_verses WHERE translation_id=? AND book_id=? AND chapter=? ORDER BY verse",
                        p.getString("translation"), p.getString("book"), p.getInt("chapter"));
            case "importVerse":
                return one(
                        db,
                        "SELECT verse,text,NULL AS tokens FROM imported_verses WHERE"
                            + " translation_id=? AND book_id=? AND chapter=? AND verse=?",
                        p.getString("translation"),
                        p.getString("book"),
                        p.getInt("chapter"),
                        p.getInt("verse"));
            case "importSearch":
                return imports.search(p);
            case "deleteImport":
                return transaction(
                        () -> {
                            String key = p.getString("id");
                            exec(db, "DELETE FROM imported_verses WHERE translation_id=?", key);
                            exec(db, "DELETE FROM imported_translations WHERE id=?", key);
                            imports.invalidate(key);
                            return null;
                        });
            case "markdown":
                return new JSObject()
                        .put("notes", array(db, NOTES + " ORDER BY book,chapter,verse,id"))
                        .put("highlights", array(db, MARKS + " ORDER BY book,chapter,verse,id"))
                        .put("imports", imports.list());
            default:
                throw new IllegalArgumentException("Unknown study operation " + op);
        }
    }

    private Object review(JSONObject p) throws Exception {
        return transaction(
                () -> {
                    String strongs = p.getString("strongs"), language = p.getString("language");
                    JSObject current = one(db, CARDS + " WHERE strongs=?", strongs);
                    int grade = Math.max(0, Math.min(5, p.getInt("grade")));
                    int reps = current == null ? 0 : current.getInt("reps"),
                            lapses = current == null ? 0 : current.getInt("lapses");
                    double ease = current == null ? 2.5 : current.getDouble("ease");
                    long interval;
                    if (grade < 3) {
                        reps = 0;
                        lapses++;
                        interval = 1;
                    } else {
                        reps++;
                        interval =
                                reps == 1
                                        ? 1
                                        : reps == 2
                                                ? 6
                                                : Math.max(
                                                        1,
                                                        Math.round(
                                                                current.getLong("intervalDays")
                                                                        * ease));
                    }
                    ease = Math.max(1.3, ease + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
                    long now = System.currentTimeMillis();
                    exec(
                            db,
                            "INSERT OR REPLACE INTO"
                                + " srs_cards(strongs,language,ease,interval_days,due_at,reps,lapses,last_grade,updated_at)"
                                + " VALUES(?,?,?,?,?,?,?,?,?)",
                            strongs,
                            language,
                            ease,
                            interval,
                            now + interval * 86400000L,
                            reps,
                            lapses,
                            grade,
                            now);
                    return one(db, CARDS + " WHERE strongs=?", strongs);
                });
    }

    @Override
    public void close() {
        db.close();
    }
}
