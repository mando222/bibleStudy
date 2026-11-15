package org.openbiblestudy.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "Study")
public class StudyPlugin extends Plugin {
    // Keep extraction, statement execution and database closure serialized across calls.
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private StudyLibrary library;
    private StudyAnnotations annotations;

    private interface Work { JSObject run() throws Exception; }

    private void background(PluginCall call, Work work) {
        worker.execute(() -> {
            try { call.resolve(work.run()); }
            catch (Exception e) { call.reject(e.getMessage() == null ? "Offline library operation failed." : e.getMessage(), e); }
        });
    }

    private StudyLibrary library() throws IOException {
        if (library == null) library = new StudyLibrary(OfflineLibrary.ensure(getContext()));
        return library;
    }

    private StudyAnnotations annotations() throws IOException {
        if (annotations == null) annotations = new StudyAnnotations(getContext());
        return annotations;
    }

    private static String required(PluginCall call, String field) {
        String value = call.getString(field);
        if (value == null) throw new IllegalArgumentException("Missing " + field);
        return value;
    }

    private static int positive(PluginCall call, String field) {
        int number = call.getInt(field, 0);
        if (number < 1) throw new IllegalArgumentException("Invalid " + field);
        return number;
    }

    @PluginMethod public void openCorpus(PluginCall call) {
        background(call, () -> new JSObject().put("key", ((MainActivity) getActivity()).corpus().open()));
    }

    @PluginMethod public void getChapter(PluginCall call) {
        background(call, () -> library().chapter(required(call, "translation"), required(call, "book"), positive(call, "chapter")));
    }

    @PluginMethod public void getStrongs(PluginCall call) {
        background(call, () -> library().strongs(required(call, "id")));
    }

    @PluginMethod public void search(PluginCall call) {
        background(call, () -> StudySearch.search(library().db, required(call, "text"), required(call, "translation"),
            call.getString("greekEdition", "NA"), call.getString("book"), call.getString("testament"),
            Math.max(0, Math.min(300, call.getInt("limit", 100))), Math.max(0, call.getInt("offset", 0))));
    }

    @PluginMethod public void getAnnotations(PluginCall call) {
        background(call, () -> annotations().list(required(call, "translation"), required(call, "book"), positive(call, "chapter")));
    }

    @PluginMethod public void saveNote(PluginCall call) {
        background(call, () -> {
            annotations().note(required(call, "translation"), required(call, "book"), positive(call, "chapter"),
                positive(call, "verse"), required(call, "text"));
            return new JSObject();
        });
    }

    @PluginMethod public void saveHighlight(PluginCall call) {
        background(call, () -> {
            annotations().highlight(required(call, "translation"), required(call, "book"), positive(call, "chapter"),
                positive(call, "verse"), required(call, "color"));
            return new JSObject();
        });
    }

    @PluginMethod public void shareText(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                SelectionActions.share(getActivity(), required(call, "text"));
                call.resolve();
            } catch (Exception e) { call.reject("Could not share this passage.", e); }
        });
    }

    @PluginMethod public void copyText(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                SelectionActions.copy(getContext(), required(call, "text"));
                call.resolve();
            } catch (Exception e) { call.reject("Could not copy this passage.", e); }
        });
    }

    @Override protected void handleOnDestroy() {
        worker.execute(() -> {
            if (library != null) library.close();
            if (annotations != null) annotations.close();
        });
        worker.shutdown();
        super.handleOnDestroy();
    }
}
