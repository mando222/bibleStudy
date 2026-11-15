package org.openbiblestudy.android;

import static org.openbiblestudy.android.PersonalStore.*;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.*;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "Personal")
public class PersonalPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean picking = new AtomicBoolean();
    private PersonalStore store;

    private PersonalStore current() throws Exception {
        if (store == null)
            store = new PersonalStore(getContext(), PersonalStore.active(getContext()));
        return store;
    }

    private static JSObject value(Object value) {
        return new JSObject().put("value", value == null ? JSONObject.NULL : value);
    }

    @PluginMethod
    public void call(PluginCall call) {
        worker.execute(
                () -> {
                    try {
                        call.resolve(
                                value(
                                        current()
                                                .handle(
                                                        call.getString("operation", ""),
                                                        call.getObject("input", new JSObject()))));
                    } catch (Exception e) {
                        call.reject(
                                e.getMessage() == null ? "Study operation failed." : e.getMessage(),
                                e);
                    }
                });
    }

    @PluginMethod
    public void document(PluginCall call) {
        if (!picking.compareAndSet(false, true)) {
            call.reject("A document picker is already open.");
            return;
        }
        String op = call.getString("operation", "");
        Intent intent;
        if (op.equals("backup") || op.equals("exportMarkdown") || op.equals("exportRecovery")) {
            boolean md = op.equals("exportMarkdown");
            intent =
                    new Intent(Intent.ACTION_CREATE_DOCUMENT)
                            .addCategory(Intent.CATEGORY_OPENABLE)
                            .setType(md ? "text/markdown" : "application/octet-stream")
                            .putExtra(
                                    Intent.EXTRA_TITLE,
                                    md
                                            ? "open-bible-study-notes.md"
                                            : op.equals("exportRecovery")
                                                    ? "Before restore.obsbackup"
                                                    : "Open Bible Study.obsbackup");
        } else if (op.equals("notebookChooseFolder"))
            intent =
                    new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
                            .addFlags(
                                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                                            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                                            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        else if (op.equals("restore") || op.equals("importTranslation"))
            intent =
                    new Intent(Intent.ACTION_OPEN_DOCUMENT)
                            .addCategory(Intent.CATEGORY_OPENABLE)
                            .setType("*/*");
        else {
            picking.set(false);
            call.reject("Unknown document operation.");
            return;
        }
        try {
            startActivityForResult(call, intent, "onDocument");
        } catch (RuntimeException e) {
            picking.set(false);
            call.reject("Could not open the Android document picker.", e);
        }
    }

    @ActivityCallback
    private void onDocument(PluginCall call, ActivityResult result) {
        if (call == null) {
            picking.set(false);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        worker.execute(
                () -> {
                    try {
                        String op = call.getString("operation", "");
                        JSONObject p = call.getObject("input", new JSObject());
                        Object response = null;
                        PersonalStore profile = current();
                        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
                            if (op.equals("notebookChooseFolder"))
                                response =
                                        profile.notebook.handle("notebookFolder", new JSONObject());
                        } else if (op.equals("notebookChooseFolder")) {
                            final int notebookAccess = Intent.FLAG_GRANT_READ_URI_PERMISSION
                                    | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
                            if ((result.getData().getFlags() & notebookAccess) != notebookAccess) {
                                throw new IOException("Choose a folder where Android allows reading and writing notes.");
                            }
                            getContext()
                                    .getContentResolver()
                                    .takePersistableUriPermission(uri, notebookAccess);
                            profile.notebook.use(uri);
                            response = profile.notebook.handle("notebookFolder", new JSONObject());
                        } else if (op.equals("exportRecovery")) {
                            String recovery =
                                    getContext()
                                            .getSharedPreferences(PREFS, 0)
                                            .getString("recovery", null);
                            if (recovery == null)
                                throw new IOException("No recovery backup is available.");
                            try (InputStream in =
                                            new FileInputStream(
                                                    new File(
                                                            new File(
                                                                    getContext().getFilesDir(),
                                                                    "study-backups"),
                                                            recovery));
                                    OutputStream out = output(uri)) {
                                copy(in, out);
                            }
                            response = name(uri);
                        } else if (op.equals("exportMarkdown")) {
                            try (OutputStream out = output(uri)) {
                                out.write(p.getString("content").getBytes(StandardCharsets.UTF_8));
                            }
                            response = name(uri);
                        } else {
                            File temp =
                                    File.createTempFile(
                                            "study-transfer-",
                                            ".sqlite",
                                            getContext().getCacheDir());
                            try {
                                if (op.equals("backup")) {
                                    StudyArchive.write(
                                            profile,
                                            temp,
                                            p.isNull("state") ? null : p.getString("state"));
                                    try (InputStream in = new FileInputStream(temp);
                                            OutputStream out = output(uri)) {
                                        copy(in, out);
                                    }
                                    response = name(uri);
                                } else {
                                    try (InputStream in =
                                                    getContext()
                                                            .getContentResolver()
                                                            .openInputStream(uri);
                                            OutputStream out = new FileOutputStream(temp)) {
                                        if (in == null)
                                            throw new IOException(
                                                    "The selected file could not be read.");
                                        copy(in, out);
                                    }
                                    if (op.equals("importTranslation"))
                                        response =
                                                profile.imports.importFile(
                                                        temp,
                                                        name(uri),
                                                        p.getJSONArray("books"),
                                                        profile);
                                    else {
                                        response =
                                                StudyArchive.restore(
                                                        profile,
                                                        temp,
                                                        p.isNull("state")
                                                                ? null
                                                                : p.getString("state"));
                                        profile.close();
                                        store = null;
                                    }
                                }
                            } finally {
                                temp.delete();
                            }
                        }
                        call.resolve(value(response));
                    } catch (Exception e) {
                        call.reject(
                                e.getMessage() == null
                                        ? "Could not finish the file operation."
                                        : e.getMessage(),
                                e);
                    } finally {
                        picking.set(false);
                    }
                });
    }

    private OutputStream output(Uri uri) throws IOException {
        OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt");
        if (out == null) throw new IOException("The selected file could not be written.");
        return out;
    }

    private String name(Uri uri) {
        try (Cursor c =
                getContext()
                        .getContentResolver()
                        .query(
                                uri,
                                new String[] {OpenableColumns.DISPLAY_NAME},
                                null,
                                null,
                                null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getString(0);
        }
        return "Study file";
    }

    @Override
    protected void handleOnDestroy() {
        worker.execute(
                () -> {
                    if (store != null) store.close();
                });
        worker.shutdown();
        super.handleOnDestroy();
    }
}
