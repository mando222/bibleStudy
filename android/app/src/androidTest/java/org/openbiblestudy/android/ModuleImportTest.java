package org.openbiblestudy.android;

import android.content.Context;
import androidx.sqlite.SQLiteConnection;
import androidx.sqlite.driver.bundled.BundledSQLiteDriver;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.UUID;
import static org.junit.Assert.*;
import static org.openbiblestudy.android.PersonalStore.*;

@RunWith(AndroidJUnit4.class)
public final class ModuleImportTest {
    @Test public void readsPrintedCharactersAndRollsBackUninterpretableText() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String profile = "import-test-" + UUID.randomUUID();
        File module = File.createTempFile("encoded-", ".bbl", context.getCacheDir());
        try (PersonalStore store = new PersonalStore(context, profile)) {
            try (InputStream in = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("encoded.bbl");
                 FileOutputStream out = new FileOutputStream(module)) {
                copy(in, out);
            }
            JSONArray books = new JSONArray().put("Gen");
            String id = store.imports.importFile(module, "encoded.bbl", books, store).getString("id");
            JSONObject ref = new JSONObject().put("translation", id).put("book", "Gen").put("chapter", 1);
            JSONArray verses = store.imports.chapter(ref).getJSONArray("verses");
            assertEquals("I am the Α and the Ω.", verses.getJSONObject(0).getString("text"));
            String second = "Α & Ω & café <said> λόγος &lt;.";
            assertEquals(second, verses.getJSONObject(1).getString("text"));
            assertEquals("Less than 2 < 3 and 4 > 3.", verses.getJSONObject(2).getString("text"));
            assertEquals(second, store.imports.search(ref.put("text", "λογος")).getJSONArray("hits").getJSONObject(0).getString("snippet"));
            try (SQLiteConnection db = new BundledSQLiteDriver().open(module.getPath())) {
                exec(db, "INSERT INTO Bible VALUES(1,1,4,'unreadable &unknownName;')");
            }
            Exception error = assertThrows(Exception.class, () -> store.imports.importFile(module, "broken.bbl", books, store));
            assertTrue(error.getMessage(), error.getMessage().contains("Gen 1:4"));
            assertEquals("1", StudyLibrary.scalar(store.db, "SELECT count(*) FROM imported_translations"));
        } finally {
            module.delete();
            remove(folder(context, profile));
        }
    }

    private static void remove(File path) {
        File[] children = path.listFiles();
        if (children != null) for (File child : children) remove(child);
        path.delete();
    }
}
