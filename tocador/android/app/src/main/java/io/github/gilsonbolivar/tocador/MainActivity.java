package io.github.gilsonbolivar.tocador;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

/**
 * Abre o Tocador do site numa WebView. A página escolhe a pasta de música e
 * toca tudo sozinha; esta Activity só oferece a ponte "TocadorNativo", que
 * entrega o estado (faixa, se está tocando) ao PlayerService, para que ele
 * mostre os controles na notificação mesmo com a tela apagada.
 */
public class MainActivity extends Activity {

    static final String ENDERECO = "https://gilsonbolivar-maker.github.io/Oficina/tocador/";
    static final String HOST = "gilsonbolivar-maker.github.io";

    private WebView web;
    private ValueCallback<Uri[]> retornoArquivo;
    private static final int PEDIDO_ARQUIVO = 51;

    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        getWindow().setStatusBarColor(Color.parseColor("#170f2e"));
        getWindow().setNavigationBarColor(Color.parseColor("#170f2e"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#170f2e"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " Tocador-Android/" + BuildConfig.VERSION_NAME);

        web.addJavascriptInterface(new Ponte(), "TocadorNativo");
        PlayerService.webView = web;

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest pedido) {
                Uri u = pedido.getUrl();
                if (HOST.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/Oficina/tocador")) {
                    return false;
                }
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* sem navegador */ }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> retorno, FileChooserParams params) {
                if (retornoArquivo != null) retornoArquivo.onReceiveValue(null);
                retornoArquivo = retorno;
                try {
                    startActivityForResult(params.createIntent(), PEDIDO_ARQUIVO);
                } catch (Exception e) {
                    retornoArquivo = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(web);
        if (salvo != null) web.restoreState(salvo);
        else web.loadUrl(ENDERECO);
    }

    @Override
    protected void onActivityResult(int codigo, int resultado, Intent dados) {
        if (codigo == PEDIDO_ARQUIVO) {
            if (retornoArquivo == null) return;
            retornoArquivo.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultado, dados));
            retornoArquivo = null;
            return;
        }
        super.onActivityResult(codigo, resultado, dados);
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (PlayerService.webView == web) PlayerService.webView = null;
        super.onDestroy();
    }

    /** O que a página enxerga como window.TocadorNativo. */
    class Ponte {
        /** A página chama a cada mudança: {titulo, tocando, duracao, posicao}. */
        @JavascriptInterface
        public void atualizar(String json) {
            try {
                JSONObject o = new JSONObject(json);
                Intent i = new Intent(MainActivity.this, PlayerService.class)
                    .setAction(PlayerService.ACAO_ATUALIZAR)
                    .putExtra("titulo", o.optString("titulo", ""))
                    .putExtra("tocando", o.optBoolean("tocando", false))
                    .putExtra("duracao", o.optDouble("duracao", 0))
                    .putExtra("posicao", o.optDouble("posicao", 0));
                startForegroundService(i);
            } catch (Exception e) { /* ignora estado inválido */ }
        }

        /** Chamada quando não há mais nada para tocar: tira a notificação. */
        @JavascriptInterface
        public void parar() {
            Intent i = new Intent(MainActivity.this, PlayerService.class).setAction(PlayerService.ACAO_PARAR);
            try { startService(i); } catch (Exception e) { /* serviço já parado */ }
        }
    }
}
