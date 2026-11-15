package org.openbiblestudy.android;

import static org.openbiblestudy.android.PersonalStore.*;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import android.util.AtomicFile;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

final class StudyNotebook {
    final Context context;
    final File root;
    private final String key;
    private final Map<String, String> revisions = new HashMap<>();
    private Uri tree;

    StudyNotebook(Context c, File profile, String id) throws IOException {
        context = c;
        root = new File(profile, "Notebooks");
        mkdir(root);
        key = "notebook:" + id;
        String saved = c.getSharedPreferences(PREFS, 0).getString(key, null);
        if (saved != null) tree = Uri.parse(saved);
    }

    void use(Uri folder) throws IOException {
        entries(folder); // Confirm the provider grants access before changing the current folder.
        if (!context.getSharedPreferences(PREFS, 0)
                .edit()
                .putString(key, folder.toString())
                .commit()) throw new IOException("Could not save notebook location.");
        tree = folder;
        revisions.clear();
    }

    static String safe(String name) throws IOException {
        String trimmed = name.trim();
        if (trimmed.isEmpty()
                || trimmed.startsWith(".")
                || trimmed.contains("/")
                || trimmed.contains("\\")
                || trimmed.indexOf(0) >= 0) throw new IOException("Choose a Markdown file name.");
        return trimmed.toLowerCase(Locale.ROOT).endsWith(".md") ? trimmed : trimmed + ".md";
    }

    static String sha(byte[] bytes) throws Exception {
        return hex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    static String hex(byte[] hash) {
        StringBuilder result = new StringBuilder(hash.length * 2);
        for (byte b : hash)
            result.append(Character.forDigit((b >> 4) & 15, 16))
                    .append(Character.forDigit(b & 15, 16));
        return result.toString();
    }

    private static String archivedName(String id) {
        if (id.length() <= 37 || id.charAt(36) != '-') return null;
        String name = id.substring(37);
        try {
            return UUID.fromString(id.substring(0, 36)).toString().equals(id.substring(0, 36))
                    && safe(name).equals(name) ? name : null;
        } catch (IllegalArgumentException | IOException ignored) {
            return null;
        }
    }

    private static boolean markdown(String name) {
        return name != null
                && !name.startsWith(".")
                && name.toLowerCase(Locale.ROOT).endsWith(".md");
    }

    private static final class Entry {
        final String name;
        final long modified;
        final Uri uri;

        Entry(String n, long m, Uri u) {
            name = n;
            modified = m;
            uri = u;
        }

        JSObject info() {
            return new JSObject().put("name", name).put("modified", modified);
        }
    }

    private List<Entry> entries(Uri folder) throws IOException {
        ArrayList<Entry> result = new ArrayList<>();
        if (folder == null) {
            File[] files = root.listFiles(f -> f.isFile() && markdown(f.getName()));
            if (files == null) throw new IOException("Could not list the notebook.");
            for (File f : files) result.add(new Entry(f.getName(), f.lastModified(), null));
        } else {
            String parent = DocumentsContract.getTreeDocumentId(folder);
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(folder, parent);
            try (Cursor c =
                    context.getContentResolver()
                            .query(
                                    children,
                                    new String[] {
                                        Document.COLUMN_DOCUMENT_ID,
                                        Document.COLUMN_DISPLAY_NAME,
                                        Document.COLUMN_MIME_TYPE,
                                        Document.COLUMN_LAST_MODIFIED
                                    },
                                    null,
                                    null,
                                    null)) {
                if (c == null) throw new IOException("The notebook folder is unavailable.");
                while (c.moveToNext())
                    if (!Document.MIME_TYPE_DIR.equals(c.getString(2)) && markdown(c.getString(1)))
                        result.add(
                                new Entry(
                                        c.getString(1),
                                        c.getLong(3),
                                        DocumentsContract.buildDocumentUriUsingTree(
                                                folder, c.getString(0))));
            }
        }
        result.sort((a, b) -> Long.compare(b.modified, a.modified));
        return result;
    }

    private Entry find(String name) throws IOException {
        for (Entry e : entries(tree)) if (e.name.equals(name)) return e;
        return null;
    }

    private InputStream open(Entry e) throws IOException {
        InputStream in =
                e.uri == null
                        ? new FileInputStream(new File(root, e.name))
                        : context.getContentResolver().openInputStream(e.uri);
        if (in == null) throw new IOException("Could not open " + e.name);
        return in;
    }

    InputStream stream(String name) throws IOException {
        Entry e = find(safe(name));
        if (e == null) throw new IOException("Notebook file is missing.");
        return open(e);
    }

    List<String> names() throws IOException {
        List<String> names = new ArrayList<>();
        for (Entry e : entries(tree)) names.add(e.name);
        return names;
    }

    private byte[] bytes(Entry e) throws IOException {
        try (InputStream in = open(e);
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            copy(in, out);
            return out.toByteArray();
        }
    }

    private Entry checked(String name) throws Exception {
        Entry e = find(name);
        if (e == null || !sha(bytes(e)).equals(revisions.get(name)))
            throw new IOException(
                    "This note changed on disk. Save your draft as a copy to keep both versions.");
        return e;
    }

    private static void writeInternal(File target, byte[] content) throws IOException {
        AtomicFile file = new AtomicFile(target);
        FileOutputStream out = file.startWrite();
        try {
            out.write(content);
            file.finishWrite(out);
        } catch (IOException e) {
            file.failWrite(out);
            throw e;
        }
    }

    private Uri createExternal(String name) throws IOException {
        Uri parent =
                DocumentsContract.buildDocumentUriUsingTree(
                        tree, DocumentsContract.getTreeDocumentId(tree));
        Uri created =
                DocumentsContract.createDocument(
                        context.getContentResolver(), parent, "text/markdown", name);
        if (created == null) throw new IOException("Could not create the notebook file.");
        return created;
    }

    private void writeUri(Uri uri, byte[] content) throws IOException {
        try (OutputStream out = context.getContentResolver().openOutputStream(uri, "wt")) {
            if (out == null) throw new IOException("Could not write the notebook file.");
            out.write(content);
            out.flush();
        }
    }

    private Entry create(String name, byte[] content) throws Exception {
        if (find(name) != null) throw new IOException("A note with that name already exists.");
        if (tree == null) {
            File file = new File(root, name);
            if (!file.createNewFile()) throw new IOException("Note already exists.");
            try {
                writeInternal(file, content);
            } catch (IOException e) {
                file.delete();
                throw e;
            }
        } else {
            Uri uri = createExternal(name);
            try {
                writeUri(uri, content);
                for (Entry entry : entries(tree))
                    if (uri.equals(entry.uri)) {
                        revisions.put(entry.name, sha(content));
                        return entry;
                    }
                throw new IOException("The provider did not create a Markdown file.");
            } catch (Exception e) {
                DocumentsContract.deleteDocument(context.getContentResolver(), uri);
                throw e;
            }
        }
        revisions.put(name, sha(content));
        return new Entry(name, new File(root, name).lastModified(), null);
    }

    Object handle(String op, JSONObject p) throws Exception {
        if (op.equals("notebookFolder"))
            return tree == null
                    ? "On this device / Notebooks"
                    : DocumentsContract.getTreeDocumentId(tree);
        if (op.equals("notebookList")) {
            JSONArray list = new JSONArray();
            for (Entry e : entries(tree)) list.put(e.info());
            return list;
        }
        File trash = new File(root.getParentFile(), "deleted-notebooks");
        if (op.equals("notebookListDeleted")) {
            JSONArray list = new JSONArray();
            if (!trash.exists()) return list;
            File[] files = trash.listFiles(f -> f.isFile() && archivedName(f.getName()) != null);
            if (files == null) throw new IOException("Could not list deleted notes.");
            Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
            for (File f : files)
                list.put(new JSObject().put("id", f.getName())
                        .put("name", archivedName(f.getName())).put("modified", f.lastModified()));
            return list;
        }
        if (op.equals("notebookRestoreDeleted")) {
            String id = p.getString("id");
            String name = archivedName(id);
            if (name == null) throw new IOException("Invalid deleted note.");
            File source = new File(trash, id);
            if (!source.isFile()) throw new IOException("This deleted note is no longer available.");
            if (find(name) != null) {
                name = name.substring(0, name.length() - 3) + " (restored "
                        + UUID.randomUUID().toString().substring(0, 8) + ").md";
            }
            try (InputStream in = new FileInputStream(source);
                    ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                copy(in, out);
                Entry restored = create(name, out.toByteArray());
                if (!source.delete()) throw new IOException(
                        "Restored " + restored.name + ", but could not remove its archived copy.");
                return restored.info();
            }
        }
        String name = safe(p.getString(op.equals("notebookRename") ? "oldName" : "name"));
        switch (op) {
            case "notebookCreate":
                return create(name, new byte[0]).info();
            case "notebookRecover":
                return create(
                                name.substring(0, name.length() - 3)
                                        + " (recovered "
                                        + UUID.randomUUID().toString().substring(0, 8)
                                        + ").md",
                                p.getString("content").getBytes(StandardCharsets.UTF_8))
                        .info();
            case "notebookRead":
                {
                    Entry entry = find(name);
                    if (entry == null) throw new IOException("Notebook file is missing.");
                    byte[] content = bytes(entry);
                    revisions.put(name, sha(content));
                    return new String(content, StandardCharsets.UTF_8);
                }
            case "notebookWrite":
                {
                    Entry e = checked(name);
                    byte[] content = p.getString("content").getBytes(StandardCharsets.UTF_8);
                    if (e.uri == null) writeInternal(new File(root, name), content);
                    else {
                        // Keep the prior file available if the selected provider fails mid-write.
                        File recovery = new File(root.getParentFile(), "notebook-recovery/" + name);
                        mkdir(recovery.getParentFile());
                        writeInternal(recovery, bytes(e));
                        try {
                            writeUri(e.uri, content);
                        } catch (IOException error) {
                            try (InputStream in = new FileInputStream(recovery);
                                    OutputStream out =
                                            context.getContentResolver()
                                                    .openOutputStream(e.uri, "wt")) {
                                if (out != null) copy(in, out);
                            } catch (IOException ignored) {
                                /* Previous bytes are retained under notebook-recovery. */
                            }
                            throw error;
                        }
                        recovery.delete();
                    }
                    revisions.put(name, sha(content));
                    return find(name).info();
                }
            case "notebookRename":
                {
                    Entry e = checked(name);
                    String fresh = safe(p.getString("newName"));
                    if (name.equals(fresh)) return null;
                    if (find(fresh) != null)
                        throw new IOException("A note with that name already exists.");
                    if (e.uri == null) {
                        if (!new File(root, name).renameTo(new File(root, fresh)))
                            throw new IOException("Could not rename note.");
                    } else if (DocumentsContract.renameDocument(
                                    context.getContentResolver(), e.uri, fresh)
                            == null) throw new IOException("Could not rename note.");
                    revisions.put(fresh, revisions.remove(name));
                    return null;
                }
            case "notebookDelete":
                {
                    Entry e = checked(name);
                    mkdir(trash);
                    File kept = new File(trash, UUID.randomUUID() + "-" + name);
                    if (e.uri == null) {
                        if (!new File(root, name).renameTo(kept))
                            throw new IOException("Could not move note to trash.");
                    } else {
                        writeInternal(kept, bytes(e));
                        if (!DocumentsContract.deleteDocument(context.getContentResolver(), e.uri)) {
                            kept.delete();
                            throw new IOException("Could not delete note.");
                        }
                    }
                    kept.setLastModified(System.currentTimeMillis());
                    revisions.remove(name);
                    return null;
                }
            default:
                throw new IOException("Unknown notebook operation.");
        }
    }
}
