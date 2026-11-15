package org.openbiblestudy.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import com.getcapacitor.JSObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.HttpsURLConnection;

/** A single user-initiated transfer shared by all activity instances. Only a verified,
 * atomically renamed APK can be offered to the system installer. */
final class AndroidUpdateDownload {
    private static final long MAX_BYTES = 2L * 1024 * 1024 * 1024; // GitHub release asset limit
    private static final String INTERRUPTED = "The download was interrupted. Tap Download update to try again.";
    private static AndroidUpdateDownload instance;

    static synchronized AndroidUpdateDownload get(Context context) throws PackageManager.NameNotFoundException {
        if (instance == null) instance = new AndroidUpdateDownload(context.getApplicationContext());
        return instance;
    }

    final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Context context;
    private final File directory;
    private final SharedPreferences saved;
    private final String installedVersion;
    private String version, url, message, phase = "idle";
    private volatile long received, total;

    private AndroidUpdateDownload(Context context) throws PackageManager.NameNotFoundException {
        this.context = context;
        directory = new File(context.getFilesDir(), "android-updates");
        installedVersion = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
        saved = context.getSharedPreferences("android-update-download", Context.MODE_PRIVATE);
        version = saved.getString("version", null);
        url = saved.getString("url", null);
        if (!UpdateApk.newer(version, installedVersion)) {
            version = null;
            url = null;
            if (saved.contains("version")) saved.edit().clear().apply();
        } else if (apk().isFile()) {
            phase = "ready";
            received = total = apk().length();
        } else {
            phase = "failed";
            message = saved.getString("error", INTERRUPTED);
        }
        removeOldFiles("ready".equals(phase) ? apk() : null);
    }

    private File apk() { return new File(directory, "update-" + version + ".apk"); }

    private void removeOldFiles(File keep) {
        File[] files = directory.listFiles();
        if (files != null) for (File file : files) if (!file.equals(keep)) file.delete();
    }

    boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || context.getPackageManager().canRequestPackageInstalls();
    }

    synchronized JSObject status() {
        JSObject result = new JSObject().put("phase", phase).put("canInstall", canInstall());
        if (version != null) result.put("version", version).put("url", url);
        if (message != null) result.put("message", message);
        result.put("received", received);
        if (total > 0) result.put("total", total);
        return result;
    }

    synchronized JSObject start(String address, String requested) throws Exception {
        URI source;
        try { source = URI.create(address == null ? "" : address); }
        catch (IllegalArgumentException e) { throw new UpdateApk.Rejected("Invalid release download address."); }
        if (!UpdateApk.isRelease(source, requested)) throw new UpdateApk.Rejected("Invalid release download address.");
        if (!UpdateApk.newer(requested, installedVersion)) throw new UpdateApk.Rejected("This version is already installed.");
        if (requested.equals(version) && ("downloading".equals(phase) || "ready".equals(phase))) return status();
        if ("downloading".equals(phase)) throw new UpdateApk.Rejected("Another update is downloading.");

        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create update storage.");
        removeOldFiles(null);
        version = requested;
        url = address;
        received = total = 0;
        message = null;
        phase = "downloading";
        saved.edit().putString("version", version).putString("url", url).remove("error").apply();
        worker.execute(() -> download(source, requested));
        return status();
    }

    private void download(URI source, String requested) {
        File temporary = new File(directory, "downloading.apk");
        try {
            HttpsURLConnection connection = connect(source, requested);
            try {
                long expected = connection.getContentLengthLong();
                if (expected == 0 || expected > MAX_BYTES) throw new UpdateApk.Rejected("The release download has an invalid size.");
                if (expected > directory.getUsableSpace()) throw new UpdateApk.Rejected("Make more space on this device and try the update again.");
                total = expected;
                try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(temporary)) {
                    byte[] buffer = new byte[128 * 1024];
                    int count;
                    while ((count = in.read(buffer)) != -1) {
                        long next = received + count;
                        if (next > MAX_BYTES || (expected > 0 && next > expected))
                            throw new UpdateApk.Rejected("The download exceeded its expected size.");
                        out.write(buffer, 0, count);
                        received = next;
                    }
                    out.getFD().sync();
                }
                if (received == 0 || (expected > 0 && received != expected)) throw new UpdateApk.Rejected(INTERRUPTED);
            } finally { connection.disconnect(); }
            UpdateApk.verify(context, temporary, requested);
            synchronized (this) {
                if (!temporary.renameTo(apk())) throw new IOException("Cannot save the verified APK.");
                phase = "ready";
                total = received;
            }
        } catch (Exception e) {
            temporary.delete();
            fail(e instanceof UpdateApk.Rejected ? e.getMessage() :
                "Could not download the update. Check your connection and available storage, then try again.");
        }
    }

    private synchronized void fail(String reason) {
        phase = "failed";
        message = reason;
        saved.edit().putString("error", reason).apply();
    }

    private static HttpsURLConnection connect(URI source, String version) throws IOException {
        URI current = source;
        for (int hops = 0; hops <= 5; hops++) {
            HttpsURLConnection connection = (HttpsURLConnection) current.toURL().openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("Accept-Encoding", "identity");
            boolean keep = false;
            try {
                int code = connection.getResponseCode();
                if (code == 200) {
                    keep = true;
                    return connection;
                }
                if (code != 301 && code != 302 && code != 303 && code != 307 && code != 308)
                    throw new UpdateApk.Rejected("The release download returned HTTP " + code + ". Try checking for updates again.");
                String location = connection.getHeaderField("Location");
                if (location == null) throw new UpdateApk.Rejected("GitHub did not return a release asset address.");
                current = current.resolve(location);
                if (!UpdateApk.isAssetRedirect(current, version)) throw new UpdateApk.Rejected("Unexpected release download redirect.");
            } finally { if (!keep) connection.disconnect(); }
        }
        throw new UpdateApk.Rejected("Too many redirects while downloading the update.");
    }

    synchronized File verifiedFile() throws Exception {
        if (!"ready".equals(phase)) throw new UpdateApk.Rejected("Download the update before installing it.");
        File file = apk();
        try {
            UpdateApk.verify(context, file, version);
        } catch (Exception e) {
            file.delete();
            fail(e instanceof UpdateApk.Rejected ? e.getMessage() : "Could not verify the update. Download it again.");
            throw new UpdateApk.Rejected(message);
        }
        return file;
    }
}
