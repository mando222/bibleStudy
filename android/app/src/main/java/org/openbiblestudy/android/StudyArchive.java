package org.openbiblestudy.android;

import static org.openbiblestudy.android.PersonalStore.*;
import static org.openbiblestudy.android.StudyLibrary.*;

import androidx.sqlite.SQLiteConnection;
import androidx.sqlite.SQLiteStatement;
import androidx.sqlite.driver.bundled.BundledSQLiteDriver;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.*;

/** Desktop's v1 .obsbackup container. SQLite files and notebooks are streamed in 1 MiB parts. */
final class StudyArchive {
    static final Set<String> DESKTOP_EXTRAS =
            new HashSet<>(
                    Arrays.asList(
                            "ai.sqlite", "ai-config.json", "updates.json", "system-prompt.md"));
    private static final String[] TABLES = {
        "SELECT id,translation,book,chapter,verse,start_token,end_token,color,created_at FROM"
                + " highlights",
        "SELECT id,book,chapter,verse,body,created_at,updated_at FROM notes",
        "SELECT id,abbrev,name,direction,added_at FROM imported_translations",
        "SELECT translation_id,book_id,chapter,verse,text FROM imported_verses",
        "SELECT id,name,book,chapter,verse,note,created_at FROM bookmarks",
        "SELECT id,book,chapter,verse,visited_at FROM reading_history",
        "SELECT module,key,value,updated_at FROM learn_progress",
        "SELECT strongs,language,ease,interval_days,due_at,reps,lapses,last_grade,updated_at FROM"
                + " srs_cards"
    };

    static void write(PersonalStore store, File destination, String state) throws Exception {
        if (state != null) state = readerOnly(state);
        File snapshot =
                File.createTempFile("study-snapshot-", ".sqlite", store.context.getCacheDir());
        try {
            exec(store.db, "VACUUM INTO ?", snapshot.getPath());
            try (SQLiteConnection zip = new BundledSQLiteDriver().open(destination.getPath())) {
                exec(
                        zip,
                        "CREATE TABLE manifest(version INTEGER NOT NULL,created_at TEXT NOT NULL)");
                exec(
                        zip,
                        "CREATE TABLE files(section TEXT NOT NULL,name TEXT NOT NULL,sha256"
                                + " TEXT,PRIMARY KEY(section,name))");
                exec(
                        zip,
                        "CREATE TABLE parts(section TEXT NOT NULL,name TEXT NOT NULL,seq INTEGER"
                                + " NOT NULL,bytes BLOB NOT NULL,PRIMARY KEY(section,name,seq))");
                SimpleDateFormat date =
                        new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                date.setTimeZone(TimeZone.getTimeZone("UTC"));
                exec(zip, "BEGIN");
                exec(zip, "INSERT INTO manifest VALUES(1,?)", date.format(new Date()));
                try (InputStream in = new FileInputStream(snapshot)) {
                    append(zip, "profile", "user.sqlite", in);
                }
                if (state != null)
                    try (InputStream in =
                            new ByteArrayInputStream(state.getBytes(StandardCharsets.UTF_8))) {
                        append(zip, "profile", "reader-state.json", in);
                    }
                for (String name : store.notebook.names()) {
                    if (!name.equals(StudyNotebook.safe(name)))
                        throw new IOException("Notebook file name cannot be backed up: " + name);
                    try (InputStream in = store.notebook.stream(name)) {
                        append(zip, "notebook", name, in);
                    }
                }
                exec(zip, "COMMIT");
            }
        } finally {
            snapshot.delete();
        }
    }

    private static void append(SQLiteConnection zip, String section, String name, InputStream in)
            throws Exception {
        byte[] buffer = new byte[1024 * 1024];
        long seq = 0;
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        int n;
        try (SQLiteStatement st = zip.prepare("INSERT INTO parts VALUES(?,?,?,?)")) {
            while ((n = in.read(buffer)) != -1) {
                hash.update(buffer, 0, n);
                st.bindText(1, section);
                st.bindText(2, name);
                st.bindLong(3, seq++);
                st.bindBlob(4, n == buffer.length ? buffer : Arrays.copyOf(buffer, n));
                st.step();
                st.reset();
            }
        }
        exec(
                zip,
                "INSERT INTO files VALUES(?,?,?)",
                section,
                name,
                StudyNotebook.hex(hash.digest()));
    }

    static JSObject restore(PersonalStore current, File archive, String readerState)
            throws Exception {
        String id = UUID.randomUUID().toString();
        File folder = folder(current.context, id),
                recoveryDir = new File(current.context.getFilesDir(), "study-backups");
        File recovery = new File(recoveryDir, "Before restore " + id + ".obsbackup");
        if (!folder.mkdir()) throw new IOException("Could not create a new study profile.");
        try {
            extract(archive, folder);
            validate(new File(folder, "user.sqlite"));
            File state = new File(folder, "reader-state.json");
            if (state.isFile()) {
                String clean;
                try (InputStream in = new FileInputStream(state)) {
                    clean = readerOnly(read(in));
                }
                try (FileOutputStream out = new FileOutputStream(state)) {
                    out.write(clean.getBytes(StandardCharsets.UTF_8));
                    out.getFD().sync();
                }
            }
            mkdir(recoveryDir);
            write(current, recovery, readerState);
            // A single durable pointer change activates the verified profile. The prior profile
            // remains on disk.
            if (!current.context
                    .getSharedPreferences(PREFS, 0)
                    .edit()
                    .putString("active", id)
                    .putString("recovery", recovery.getName())
                    .commit()) throw new IOException("Could not activate the restored profile.");
            return new JSObject()
                    .put("recovery", recovery.getName())
                    .put("folder", "On this device / Notebooks");
        } catch (Exception e) {
            removeTree(folder);
            recovery.delete();
            throw e;
        }
    }

    static void extract(File archive, File folder) throws Exception {
        File notes = new File(folder, "Notebooks");
        mkdir(notes);
        try (SQLiteConnection zip = new BundledSQLiteDriver().open(archive.getPath(), 1)) {
            exec(zip, "PRAGMA trusted_schema=OFF");
            if (!"1".equals(scalar(zip, "SELECT version FROM manifest"))
                    || !"1".equals(scalar(zip, "SELECT count(*) FROM manifest")))
                throw new IOException("Unsupported study backup version.");
            if (!"1"
                    .equals(
                            scalar(
                                    zip,
                                    "SELECT count(*) FROM files WHERE section='profile' AND"
                                            + " name='user.sqlite'")))
                throw new IOException("This backup has no study database.");
            try (SQLiteStatement files = zip.prepare("SELECT section,name,sha256 FROM files")) {
                while (files.step()) {
                    String section = files.getText(0),
                            name = files.getText(1),
                            expected = files.getText(2);
                    boolean notebook = section.equals("notebook");
                    if (notebook && !name.equals(StudyNotebook.safe(name)))
                        throw new IOException("Unsupported notebook name in backup.");
                    if (!notebook) {
                        if (!section.equals("profile"))
                            throw new IOException("Unsupported backup section.");
                        if (DESKTOP_EXTRAS.contains(name)) continue;
                        if (!name.equals("user.sqlite") && !name.equals("reader-state.json"))
                            throw new IOException("Unsupported file in backup.");
                    }
                    File dest = new File(notebook ? notes : folder, name);
                    if (!dest.createNewFile()) throw new IOException("Duplicate backup file.");
                    MessageDigest digest = MessageDigest.getInstance("SHA-256");
                    try (FileOutputStream out = new FileOutputStream(dest);
                            SQLiteStatement parts =
                                    query(
                                            zip,
                                            "SELECT seq,length(bytes),bytes FROM parts WHERE"
                                                    + " section=? AND name=? ORDER BY seq",
                                            section,
                                            name)) {
                        long seq = 0;
                        while (parts.step()) {
                            if (parts.getLong(0) != seq++
                                    || parts.getColumnType(2) != 4
                                    || parts.getLong(1) > 1024 * 1024)
                                throw new IOException("Damaged backup content.");
                            byte[] bytes = parts.getBlob(2);
                            out.write(bytes);
                            digest.update(bytes);
                        }
                        out.getFD().sync();
                    }
                    if (!StudyNotebook.hex(digest.digest()).equals(expected))
                        throw new IOException("Backup checksum failed for " + name);
                }
            }
        }
    }

    private static void validate(File file) throws Exception {
        try (SQLiteConnection db = new BundledSQLiteDriver().open(file.getPath(), 1)) {
            exec(db, "PRAGMA trusted_schema=OFF");
            if (!"ok".equals(scalar(db, "PRAGMA quick_check"))
                    || scalar(
                                    db,
                                    "SELECT name FROM sqlite_schema WHERE type IN"
                                            + " ('trigger','view') LIMIT 1")
                            != null)
                throw new IOException("Damaged or unsupported study database.");
            if (!"2".equals(scalar(db, "SELECT value FROM user_meta WHERE key='schema_version'")))
                throw new IOException("Unsupported study database version.");
            for (String sql : TABLES) {
                try (SQLiteStatement q = db.prepare(sql + " LIMIT 0")) {
                    q.step();
                }
            }
        }
    }

    // Only transfer the reader preferences the desktop actually persists. This keeps assistant
    // conversations, model settings, and unrecognized private fields out of mobile profiles.
    private static String readerOnly(String state) throws Exception {
        JSONObject envelope = new JSONObject(state), all = envelope.optJSONObject("state");
        if (all == null) throw new IOException("Invalid reader settings in backup.");
        JSONObject reader = new JSONObject();
        String[] keys = {
            "theme",
            "displayDefaults",
            "displayOverrides",
            "preferredTextOrder",
            "activity",
            "referenceEdition",
            "primary",
            "parallels",
            "book",
            "chapter",
            "strongsVisible",
            "interlinear",
            "interlinearEdition",
            "interlinearStack",
            "interlinearParses",
            "chronological",
            "restoreSourceWords",
            "sourceWordTerms",
            "sourceFormIds",
            "mapYear",
            "mapShowRegions",
            "activeNotebookFile",
            "learnModule",
            "learnLanguage"
        };
        for (String key : keys) if (all.has(key)) reader.put(key, all.get(key));
        JSONObject result = new JSONObject().put("state", reader);
        if (envelope.has("version")) result.put("version", envelope.getInt("version"));
        JSONObject phone = envelope.optJSONObject("phone");
        if (phone != null) {
            JSONObject mobile = new JSONObject();
            int size = phone.optInt("textSize", 0);
            if (Arrays.asList(15, 16, 17, 18, 19, 21, 24, 28).contains(size))
                mobile.put("textSize", size);
            JSONObject place = phone.optJSONObject("position");
            if (place != null
                    && place.opt("translation") instanceof String
                    && place.opt("book") instanceof String
                    && !place.getString("translation").isEmpty()
                    && !place.getString("book").isEmpty()
                    && place.optInt("chapter", 0) > 0
                    && place.optInt("verse", 0) > 0) {
                mobile.put(
                        "position",
                        new JSONObject()
                                .put("book", place.getString("book"))
                                .put("chapter", place.getInt("chapter"))
                                .put("verse", place.getInt("verse"))
                                .put("translation", place.getString("translation")));
            }
            if (mobile.length() > 0) result.put("phone", mobile);
        }
        return result.toString();
    }

    private static void removeTree(File root) {
        File[] files = root.listFiles();
        if (files != null) for (File f : files) removeTree(f);
        root.delete();
    }
}
