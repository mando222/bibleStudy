package org.openbiblestudy.android;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import androidx.sqlite.SQLiteConnection;
import androidx.sqlite.SQLiteStatement;
import androidx.sqlite.driver.bundled.BundledSQLiteDriver;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.UUID;
import java.util.regex.Pattern;

/** Handles the local library worker's requests entirely inside the WebView. This connection
 * can only read the bundled corpus. The user's notes and imported files use another service. */
final class CorpusQueries implements AutoCloseable {
    private static final Pattern READ_QUERY = Pattern.compile("^(SELECT|WITH)\\s", Pattern.CASE_INSENSITIVE);
    private final Context context;
    private final String key = UUID.randomUUID().toString();
    private SQLiteConnection db;
    private boolean closed;

    CorpusQueries(Context context) { this.context = context.getApplicationContext(); }

    synchronized String open() throws IOException {
        if (closed) throw new IOException("The offline library has closed.");
        if (db == null) {
            SQLiteConnection connection = new BundledSQLiteDriver().open(OfflineLibrary.ensure(context).getAbsolutePath(), 1);
            try (SQLiteStatement statement = connection.prepare("PRAGMA query_only=ON")) {
                statement.step();
            } catch (RuntimeException ex) {
                connection.close();
                throw ex;
            }
            db = connection;
        }
        return key;
    }

    static boolean matches(Uri url) {
        return "https".equals(url.getScheme()) && "localhost".equals(url.getAuthority())
                && "/_study/corpus".equals(url.getPath());
    }

    synchronized WebResourceResponse serve(WebResourceRequest request) {
        if (!"GET".equals(request.getMethod()) || !key.equals(request.getRequestHeaders().get("X-Study-Key"))) {
            return response(403, "Forbidden", "Unknown library session.");
        }
        if (db == null) return response(503, "Unavailable", "Open the offline library first.");
        try {
            String encoded = request.getRequestHeaders().get("X-Study-Query");
            if (encoded == null) throw new IllegalArgumentException("Missing library query.");
            JSONArray query = new JSONArray(URLDecoder.decode(encoded, "UTF-8"));
            String sql = query.getString(0).trim();
            if (!READ_QUERY.matcher(sql).find()) {
                throw new IllegalArgumentException("Only read-only library queries are supported.");
            }
            JSONArray args = query.getJSONArray(1);
            Object[] values = new Object[args.length()];
            for (int i = 0; i < args.length(); i++) values[i] = args.isNull(i) ? null : args.get(i);
            boolean first = query.getBoolean(2);
            try (SQLiteStatement statement = StudyLibrary.query(db, sql, values)) {
                JSONArray fields = new JSONArray(), rows = new JSONArray();
                int count = statement.getColumnCount();
                for (int i = 0; i < count; i++) fields.put(statement.getColumnName(i));
                while (statement.step()) {
                    JSONArray row = new JSONArray();
                    for (int i = 0; i < count; i++) {
                        switch (statement.getColumnType(i)) {
                            case 1: row.put(statement.getLong(i)); break;
                            case 2: row.put(statement.getDouble(i)); break;
                            case 3: row.put(statement.getText(i)); break;
                            case 5: row.put(JSONObject.NULL); break;
                            default: throw new IllegalArgumentException("Unexpected binary value in the study catalog.");
                        }
                    }
                    rows.put(row);
                    if (first) break;
                }
                return response(200, "OK", new JSONArray().put(fields).put(rows).toString());
            }
        } catch (Exception error) {
            String message = error.getMessage();
            return response(400, "Query failed", message == null ? "Could not read the study library." : message);
        }
    }

    private static WebResourceResponse response(int status, String reason, String body) {
        return new WebResourceResponse(status == 200 ? "application/json" : "text/plain", "UTF-8",
                status, reason, Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }

    @Override public synchronized void close() {
        closed = true;
        if (db != null) db.close();
        db = null;
    }
}
