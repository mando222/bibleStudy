package org.openbiblestudy.android;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.net.URI;

import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class UpdateApkTest {
    private static final String ROOT = "https://github.com/mando222/bibleStudy/releases/download/";
    private static final String VERSION = "0.5.0";
    private static final String FILE = "Open-Bible-Study-Android-0.5.0.apk";
    private static final String RELEASE = ROOT + "v0.5.0/" + FILE;

    @Test public void acceptsKnownReleaseNamesAndRequiresMatchingVersions() {
        assertTrue(UpdateApk.isRelease(URI.create(RELEASE), VERSION));
        assertTrue(UpdateApk.isRelease(URI.create(ROOT + "v0.5.0/Open-Bible-Study-Android-test.apk"), VERSION));
        assertTrue(UpdateApk.isRelease(URI.create(ROOT + "android%2Fv0.5.0/app-debug.apk"), VERSION));
        assertTrue(UpdateApk.isRelease(URI.create(ROOT + "android-dev/" + FILE), VERSION));
        assertFalse(UpdateApk.isRelease(URI.create(ROOT + "v0.5.1/" + FILE), VERSION));
        assertFalse(UpdateApk.isRelease(URI.create(RELEASE), "0.5.1"));
        assertFalse(UpdateApk.isRelease(URI.create(ROOT + "v0.5.0/other-app.apk"), VERSION));
    }

    @Test public void confinesDownloadsAndRedirectsToReleaseHosts() {
        for (String invalid : new String[]{
            RELEASE.replace("https:", "http:"), RELEASE.replace("github.com", "github.com.example.org"),
            RELEASE.replace("github.com", "somebody@github.com"), RELEASE.replace("github.com", "github.com:8443"),
            RELEASE.replace("mando222", "somebody"), RELEASE + "?redirect=elsewhere", RELEASE + "#fragment",
            ROOT + "%2e%2e%2fexample/" + FILE, ROOT + "v0.5.0/wrong%2F" + FILE
        }) assertFalse(invalid, UpdateApk.isRelease(URI.create(invalid), VERSION));
        assertTrue(UpdateApk.isAssetRedirect(URI.create("https://release-assets.githubusercontent.com/asset?signature=example"), VERSION));
        assertFalse(UpdateApk.isAssetRedirect(URI.create("http://release-assets.githubusercontent.com/asset"), VERSION));
        assertFalse(UpdateApk.isAssetRedirect(URI.create("https://release-assets.githubusercontent.com.example.org/asset"), VERSION));
        assertFalse(UpdateApk.isAssetRedirect(URI.create("https://github.com/somebody/other-project/releases/download/v0.5.0/" + FILE), VERSION));
    }

    @Test public void ordersStableAndroidReleasesNumerically() {
        assertTrue(UpdateApk.newer("0.10.0", "0.9.99"));
        assertFalse(UpdateApk.newer("1.0.9", "1.0.10"));
        assertFalse(UpdateApk.newer("1.2.3", "1.2.3"));
        assertFalse(UpdateApk.newer("../1.2.3", "1.0.0"));
    }

    @Test public void rejectsForeignApksAndTheInstalledVersion() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File foreign = new File(InstrumentationRegistry.getInstrumentation().getContext().getApplicationInfo().sourceDir);
        File installed = new File(context.getApplicationInfo().sourceDir);
        String current = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
        assertThrows(UpdateApk.Rejected.class, () -> UpdateApk.verify(context, foreign, VERSION));
        assertThrows(UpdateApk.Rejected.class, () -> UpdateApk.verify(context, installed, current));
    }
}
