package org.openbiblestudy.android;

import android.content.Context;
import android.content.res.AssetManager;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.zip.GZIPInputStream;

/** Installs a verified snapshot of the bundled library before opening it read-only. */
final class OfflineLibrary {
    private OfflineLibrary() {}

    static synchronized File ensure(Context context) throws IOException {
        AssetManager assets = context.getAssets();
        String hash;
        long expectedBytes;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                assets.open("library/manifest"), StandardCharsets.UTF_8))) {
            hash = reader.readLine();
            if (hash == null || !hash.matches("[a-f0-9]{64}")) {
                throw new IOException("Invalid offline library fingerprint.");
            }
            try {
                expectedBytes = Long.parseLong(reader.readLine());
            } catch (NumberFormatException e) {
                throw new IOException("Invalid offline library size.", e);
            }
            if (expectedBytes <= 0) throw new IOException("Empty offline library.");
        }

        File directory = new File(context.getNoBackupFilesDir(), "scripture");
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new IOException("Cannot create the offline library folder.");
        }
        File database = new File(directory, hash + ".sqlite");
        if (database.isFile() && database.length() == expectedBytes) {
            removeOlderSnapshots(directory, database);
            return database;
        }

        // A fixed staging name bounds storage use even if Android kills the process mid-copy.
        File staging = new File(directory, "installing.tmp");
        if (staging.exists() && !staging.delete()) throw new IOException("Cannot restart the offline library installation.");
        long available = directory.getUsableSpace();
        if (available < expectedBytes) {
            long mib = 1024 * 1024;
            throw new IOException("Installing the offline library requires " + ((expectedBytes + mib - 1) / mib)
                + " MiB of free storage. " + (available / mib) + " MiB is available. Free up space, then retry.");
        }
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new AssertionError(e);
        }
        try {
            try (GZIPInputStream input = new GZIPInputStream(assets.open("library/bible.pack"), 131072);
                 FileOutputStream output = new FileOutputStream(staging)) {
                byte[] buffer = new byte[131072];
                long written = 0;
                int count;
                while ((count = input.read(buffer)) != -1) {
                    written += count;
                    if (written > expectedBytes) throw new IOException("Offline library exceeds the expected size.");
                    output.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                }
                if (written != expectedBytes || !MessageDigest.isEqual(digest.digest(), decodeHash(hash))) {
                    throw new IOException("The bundled offline library failed verification.");
                }
                output.getFD().sync();
            }
            if (!staging.renameTo(database)) throw new IOException("Cannot install the offline library.");
        } finally {
            if (staging.exists()) staging.delete();
        }

        removeOlderSnapshots(directory, database);
        return database;
    }

    private static void removeOlderSnapshots(File directory, File database) {
        // Updating the APK restarts its process; no reader can hold an older snapshot.
        File[] older = directory.listFiles((dir, name) ->
            name.matches("[a-f0-9]{64}\\.sqlite") && !name.equals(database.getName()));
        if (older != null) for (File file : older) file.delete();
    }

    private static byte[] decodeHash(String hex) {
        byte[] bytes = new byte[hex.length() / 2];
        for (int i = 0; i < bytes.length; i++) {
            bytes[i] = (byte) Integer.parseInt(hex.substring(2 * i, 2 * i + 2), 16);
        }
        return bytes;
    }
}
