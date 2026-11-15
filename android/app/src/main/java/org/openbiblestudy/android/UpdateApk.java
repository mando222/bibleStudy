package org.openbiblestudy.android;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class UpdateApk {
    static final class Rejected extends IOException {
        Rejected(String message) { super(message); }
    }

    private static final String VERSION = "([0-9]{1,4}\\.[0-9]{1,3}\\.[0-9]{1,3})";
    private static final Pattern SHARED_TAG = Pattern.compile("v" + VERSION);
    private static final Pattern ANDROID_TAG = Pattern.compile("android[-/]v?" + VERSION, Pattern.CASE_INSENSITIVE);
    private static final Pattern NAMED_APK = Pattern.compile(
        "open[- ]?bible[- ]?study[- ](?:android[- ])?v?" + VERSION + "(?:[- ](?:android|universal|test))*\\.apk",
        Pattern.CASE_INSENSITIVE);
    private static final String RELEASE_PATH = "/mando222/bibleStudy/releases/download/";

    static boolean isRelease(URI uri, String version) {
        if (version == null || !version.matches(VERSION) || !https(uri) ||
                !"github.com".equalsIgnoreCase(uri.getHost()) || uri.getRawQuery() != null) return false;
        String path = uri.getRawPath();
        if (!path.startsWith(RELEASE_PATH)) return false;
        String[] parts = path.substring(RELEASE_PATH.length()).split("/", -1);
        if (parts.length != 2) return false;
        String tag = Uri.decode(parts[0]), filename = Uri.decode(parts[1]);
        Matcher shared = SHARED_TAG.matcher(tag), android = ANDROID_TAG.matcher(tag), named = NAMED_APK.matcher(filename);
        boolean sharedTag = shared.matches(), androidTag = android.matches();
        if (!androidTag && (!tag.matches("[A-Za-z0-9._-]+") || tag.equals(".") || tag.equals(".."))) return false;
        if (!filename.matches("(?i)[a-z0-9 _.-]+\\.apk") ||
                (sharedTag && !version.equals(shared.group(1))) || (androidTag && !version.equals(android.group(1)))) return false;
        if (named.matches()) return version.equals(named.group(1));
        return androidTag || (sharedTag && filename.equals("Open-Bible-Study-Android-test.apk"));
    }

    static boolean isAssetRedirect(URI uri, String version) {
        if (!https(uri)) return false;
        String host = uri.getHost();
        return isRelease(uri, version) || "release-assets.githubusercontent.com".equalsIgnoreCase(host) ||
            "objects.githubusercontent.com".equalsIgnoreCase(host) || "github-releases.githubusercontent.com".equalsIgnoreCase(host);
    }

    private static boolean https(URI uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null &&
            uri.getRawUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getRawFragment() == null;
    }

    static boolean newer(String version, String current) {
        if (version == null || current == null || !version.matches(VERSION) || !current.matches(VERSION)) return false;
        String[] available = version.split("\\."), installed = current.split("\\.");
        for (int i = 0; i < available.length; i++) {
            int compare = Integer.compare(Integer.parseInt(available[i]), Integer.parseInt(installed[i]));
            if (compare != 0) return compare > 0;
        }
        return false;
    }

    @SuppressWarnings("deprecation")
    static void verify(Context context, File file, String version) throws Exception {
        PackageManager pm = context.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo installed = pm.getPackageInfo(context.getPackageName(), flags);
        PackageInfo candidate = pm.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        if (candidate == null || !installed.packageName.equals(candidate.packageName) || !version.equals(candidate.versionName))
            throw new Rejected("This download does not match the selected Open Bible Study release.");
        long installedCode = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
        long candidateCode = Build.VERSION.SDK_INT >= 28 ? candidate.getLongVersionCode() : candidate.versionCode;
        if (!newer(version, installed.versionName) || candidateCode <= installedCode)
            throw new Rejected("The downloaded APK is not a newer version of this app.");
        Signature[] oldKeys = signers(installed), newKeys = signers(candidate);
        if (oldKeys == null || newKeys == null || oldKeys.length == 0 || newKeys.length != oldKeys.length ||
                !new HashSet<>(Arrays.asList(oldKeys)).equals(new HashSet<>(Arrays.asList(newKeys))))
            throw new Rejected("The update has a different signing certificate from the installed app.");
        if (candidate.applicationInfo == null || candidate.applicationInfo.minSdkVersion > Build.VERSION.SDK_INT)
            throw new Rejected("This update needs a newer version of Android.");
    }

    @SuppressWarnings("deprecation")
    private static Signature[] signers(PackageInfo info) {
        if (Build.VERSION.SDK_INT < 28) return info.signatures;
        return info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
    }

    private UpdateApk() {}
}
