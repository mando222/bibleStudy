package org.openbiblestudy.android;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.Rect;
import android.util.AttributeSet;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import com.getcapacitor.CapacitorWebView;
import org.json.JSONException;
import org.json.JSONTokener;

/** Uses published verse wording for the native selection toolbar, including restored spans. */
public final class StudyWebView extends CapacitorWebView {
    public StudyWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override public ActionMode startActionMode(ActionMode.Callback callback, int type) {
        return super.startActionMode(new SelectionCallback(callback), type);
    }

    private final class SelectionCallback extends ActionMode.Callback2 {
        private final ActionMode.Callback standard;
        private boolean ended;

        SelectionCallback(ActionMode.Callback standard) {
            this.standard = standard;
        }

        // The web function returns null outside scripture, so notes retain Android's usual edit menu.
        private void readSelection(android.webkit.ValueCallback<String> action) {
            evaluateJavascript("typeof window.studyPublishedSelection === 'function' ? window.studyPublishedSelection() : null",
                encoded -> {
                    if (ended || encoded == null) return;
                    try {
                        Object value = new JSONTokener(encoded).nextValue();
                        action.onReceiveValue(value instanceof String ? (String) value : null);
                    } catch (JSONException ignored) {
                        // If a web selection cannot be decoded, do not export it.
                    }
                });
        }

        private void updateMenu(ActionMode mode, Menu menu) {
            readSelection(text -> {
                if (text == null || menu.findItem(R.id.copy_published) != null) return;
                menu.clear();
                menu.add(Menu.NONE, R.id.copy_published, 0, android.R.string.copy)
                    .setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM | MenuItem.SHOW_AS_ACTION_WITH_TEXT);
                menu.add(Menu.NONE, R.id.share_published, 1, R.string.share)
                    .setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM | MenuItem.SHOW_AS_ACTION_WITH_TEXT);
                mode.invalidateContentRect();
            });
        }

        @Override public boolean onCreateActionMode(ActionMode mode, Menu menu) {
            boolean created = standard.onCreateActionMode(mode, menu);
            if (created) updateMenu(mode, menu);
            return created;
        }

        @Override public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
            boolean changed = standard.onPrepareActionMode(mode, menu);
            updateMenu(mode, menu);
            return changed;
        }

        @Override public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
            readSelection(text -> {
                if (text == null) {
                    standard.onActionItemClicked(mode, item);
                    return;
                }
                // Android's process-text services can forward rendered words outside the WebView.
                // Refresh if the user managed to tap a system item before the menu was replaced.
                if (item.getItemId() == R.id.copy_published) {
                    if (!text.isEmpty()) SelectionActions.copy(getContext(), text);
                } else if (item.getItemId() == R.id.share_published) {
                    Context context = getContext();
                    while (context instanceof ContextWrapper && !(context instanceof Activity)) {
                        context = ((ContextWrapper) context).getBaseContext();
                    }
                    if (context instanceof Activity && !text.isEmpty()) SelectionActions.share((Activity) context, text);
                } else {
                    updateMenu(mode, mode.getMenu());
                    return;
                }
                mode.finish();
            });
            return true;
        }

        @Override public void onDestroyActionMode(ActionMode mode) {
            ended = true;
            standard.onDestroyActionMode(mode);
        }

        @Override public void onGetContentRect(ActionMode mode, View view, Rect rect) {
            if (standard instanceof ActionMode.Callback2 callback) callback.onGetContentRect(mode, view, rect);
            else super.onGetContentRect(mode, view, rect);
        }
    }
}
