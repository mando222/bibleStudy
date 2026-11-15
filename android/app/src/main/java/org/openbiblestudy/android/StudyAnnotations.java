package org.openbiblestudy.android;

import android.content.Context;
import androidx.sqlite.SQLiteConnection;
import androidx.sqlite.SQLiteStatement;
import androidx.sqlite.driver.bundled.BundledSQLiteDriver;
import com.getcapacitor.JSObject;
import org.json.JSONArray;

import java.io.File;
import java.io.IOException;

import static org.openbiblestudy.android.StudyLibrary.query;
import static org.openbiblestudy.android.StudyLibrary.rows;

/** User content lives outside the replaceable packaged corpus. Keys use each edition's own verse numbers. */
final class StudyAnnotations implements AutoCloseable {
    private final SQLiteConnection db;

    StudyAnnotations(Context context) throws IOException {
        File file = context.getDatabasePath("study-notes.sqlite");
        File dir = file.getParentFile();
        if (dir == null || (!dir.isDirectory() && !dir.mkdirs())) throw new IOException("Cannot create study notes folder.");
        db = new BundledSQLiteDriver().open(file.getAbsolutePath());
        try {
            execute("CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY,translation TEXT NOT NULL,book TEXT NOT NULL," +
                "chapter INTEGER NOT NULL,verse INTEGER NOT NULL,body TEXT NOT NULL,created_at INTEGER NOT NULL," +
                "updated_at INTEGER NOT NULL, UNIQUE(translation,book,chapter,verse))");
            execute("CREATE TABLE IF NOT EXISTS highlights (id INTEGER PRIMARY KEY,translation TEXT NOT NULL,book TEXT NOT NULL," +
                "chapter INTEGER NOT NULL,verse INTEGER NOT NULL,color TEXT NOT NULL,created_at INTEGER NOT NULL," +
                "UNIQUE(translation,book,chapter,verse))");
        } catch (RuntimeException e) {
            db.close();
            throw e;
        }
    }

    private void execute(String sql, Object... args) {
        try (SQLiteStatement statement = query(db, sql, args)) { statement.step(); }
    }

    JSObject list(String translation, String book, int chapter) {
        Object[] ref = {translation, book, chapter};
        String filter = " WHERE translation=? AND book=? AND chapter=? ORDER BY verse";
        return new JSObject().put("notes", new JSONArray(rows(db,
            "SELECT id,book,chapter,verse,body,created_at AS createdAt,updated_at AS updatedAt FROM notes" + filter, ref)))
            .put("highlights", new JSONArray(rows(db, "SELECT id,translation,book,chapter,verse,NULL AS startToken," +
                "NULL AS endToken,color,created_at AS createdAt FROM highlights" + filter, ref)));
    }

    void note(String translation, String book, int chapter, int verse, String text) {
        if (text.trim().isEmpty()) {
            execute("DELETE FROM notes WHERE translation=? AND book=? AND chapter=? AND verse=?", translation, book, chapter, verse);
        } else {
            long now = System.currentTimeMillis();
            execute("INSERT INTO notes(translation,book,chapter,verse,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?) " +
                "ON CONFLICT(translation,book,chapter,verse) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at",
                translation, book, chapter, verse, text, now, now);
        }
    }

    void highlight(String translation, String book, int chapter, int verse, String color) {
        if (color.isEmpty()) {
            execute("DELETE FROM highlights WHERE translation=? AND book=? AND chapter=? AND verse=?", translation, book, chapter, verse);
        } else {
            if (!color.matches("yellow|green|blue|pink|orange")) throw new IllegalArgumentException("Unknown highlight color");
            execute("INSERT INTO highlights(translation,book,chapter,verse,color,created_at) VALUES(?,?,?,?,?,?) " +
                "ON CONFLICT(translation,book,chapter,verse) DO UPDATE SET color=excluded.color",
                translation, book, chapter, verse, color, System.currentTimeMillis());
        }
    }

    @Override public void close() { db.close(); }
}
