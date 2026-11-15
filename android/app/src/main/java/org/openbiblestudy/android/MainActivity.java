package org.openbiblestudy.android;

import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private CorpusQueries corpus;

    @Override public void onCreate(Bundle savedInstanceState) {
        corpus = new CorpusQueries(this);
        registerPlugin(StudyPlugin.class);
        registerPlugin(PersonalPlugin.class);
        registerPlugin(AndroidUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge != null) {
            bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
                @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    if (CorpusQueries.matches(request.getUrl())) return corpus.serve(request);
                    return super.shouldInterceptRequest(view, request);
                }
            });
        }
    }

    CorpusQueries corpus() { return corpus; }

    @Override public void onDestroy() {
        super.onDestroy();
        corpus.close();
    }
}
