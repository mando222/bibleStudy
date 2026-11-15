package org.openbiblestudy.android;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;

final class SelectionActions {
    private SelectionActions() {}

    static void copy(Context context, String text) {
        ClipboardManager clipboard = context.getSystemService(ClipboardManager.class);
        clipboard.setPrimaryClip(ClipData.newPlainText("Scripture", text));
    }

    static void share(Activity activity, String text) {
        Intent send = new Intent(Intent.ACTION_SEND)
            .setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
        activity.startActivity(Intent.createChooser(send, null));
    }
}
