package org.openbiblestudy.android;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class NotebookRecoveryTest {
    @Test public void restoresAnArchivedNoteAfterRestartWithoutOverwritingANewFile() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String profile = "trash-test-" + UUID.randomUUID();
        File directory = new File(context.getCacheDir(), profile);
        try {
            StudyNotebook notes = new StudyNotebook(context, directory, profile);
            JSONObject file = new JSONObject().put("name", "Reading.md");
            notes.handle("notebookCreate", file);
            notes.handle("notebookWrite", file.put("content", "Notes on Psalm 23 · שָׁלוֹם"));
            notes.handle("notebookDelete", file);
            notes = new StudyNotebook(context, directory, profile);
            assertEquals(0, ((JSONArray) notes.handle("notebookList", new JSONObject())).length());
            JSONArray deleted = (JSONArray) notes.handle("notebookListDeleted", new JSONObject());
            assertEquals(1, deleted.length());
            JSONObject old = deleted.getJSONObject(0);
            assertEquals("Reading.md", old.getString("name"));
            notes.handle("notebookCreate", file);
            notes.handle("notebookWrite", file.put("content", "My newer note"));
            JSONObject restored = (JSONObject) notes.handle("notebookRestoreDeleted", old);
            assertNotEquals("Reading.md", restored.getString("name"));
            assertEquals("Notes on Psalm 23 · שָׁלוֹם", notes.handle("notebookRead", restored));
            assertEquals("My newer note", notes.handle("notebookRead", file));
            assertEquals(0, ((JSONArray) notes.handle("notebookListDeleted", new JSONObject())).length());
        } finally {
            remove(directory);
        }
    }

    private static void remove(File directory) {
        File[] children = directory.listFiles();
        if (children != null) for (File child : children) remove(child);
        directory.delete();
    }
}
