package org.openbiblestudy.android;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "AndroidUpdater")
public final class AndroidUpdaterPlugin extends Plugin {
    @Override public void load() {
        // Upgrading restarts the process. Reclaim the consumed installer even when
        // automatic update checks are off and Settings is never visited.
        try { AndroidUpdateDownload.get(getContext()); }
        catch (PackageManager.NameNotFoundException e) { Log.w("AndroidUpdater", "Could not read the installed version.", e); }
    }

    @PluginMethod public void getStatus(PluginCall call) {
        try { call.resolve(AndroidUpdateDownload.get(getContext()).status()); }
        catch (Exception e) { call.reject("Could not read Android update status.", e); }
    }

    @PluginMethod public void download(PluginCall call) {
        try { call.resolve(AndroidUpdateDownload.get(getContext()).start(call.getString("url"), call.getString("version"))); }
        catch (Exception e) { call.reject(e.getMessage(), e); }
    }

    @PluginMethod public void install(PluginCall call) {
        try {
            AndroidUpdateDownload transfer = AndroidUpdateDownload.get(getContext());
            transfer.worker.execute(() -> {
                try {
                    File verified = transfer.verifiedFile();
                    getActivity().runOnUiThread(() -> openInstaller(call, verified, transfer));
                } catch (Exception e) { call.reject(e.getMessage(), e); }
            });
        } catch (Exception e) { call.reject("Could not open the Android update.", e); }
    }

    private void openInstaller(PluginCall call, File file, AndroidUpdateDownload transfer) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Return to the app and tap Install update again.");
            return;
        }
        try {
            if (!transfer.canInstall()) {
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName())));
                call.resolve(new JSObject().put("action", "permission"));
                return;
            }
            Uri apk = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", file);
            Intent install = new Intent(Intent.ACTION_INSTALL_PACKAGE)
                .setDataAndType(apk, "application/vnd.android.package-archive");
            install.setClipData(ClipData.newRawUri("Android update", apk));
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(install);
            call.resolve(new JSObject().put("action", "installer"));
        } catch (ActivityNotFoundException | SecurityException e) {
            call.reject("Android could not open installation for this app. Check the device’s install permissions.", e);
        } catch (RuntimeException e) {
            call.reject("Could not open the downloaded update.", e);
        }
    }
}
