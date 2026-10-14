package io.github.gilsonbolivar.alarmegps;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Abre o Alarme GPS do site numa WebView e oferece à página a ponte
 * "AlarmeNativo": com ela, a vigilância passa para o VigiaService, que segue
 * o GPS e toca o alarme mesmo com a tela apagada.
 */
public class MainActivity extends Activity {

    static final String ENDERECO = "https://gilsonbolivar-maker.github.io/Oficina/alarme-gps/";
    static final String HOST = "gilsonbolivar-maker.github.io";
    private static final int PEDIDO_PERMISSOES = 1;

    private WebView web;
    private String origemPendente;
    private GeolocationPermissions.Callback retornoPendente;

    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        acenderSeAlarme(getIntent());
        getWindow().setStatusBarColor(Color.parseColor("#0b1220"));
        getWindow().setNavigationBarColor(Color.parseColor("#0b1220"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0b1220"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " AlarmeGPS-Android/" + BuildConfig.VERSION_NAME);

        web.addJavascriptInterface(new Ponte(), "AlarmeNativo");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest pedido) {
                Uri u = pedido.getUrl();
                if (HOST.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/Oficina/alarme-gps")) {
                    return false;
                }
                // Link para fora (mapa, site do OpenStreetMap…): abre no navegador.
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* sem navegador */ }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origem, GeolocationPermissions.Callback retorno) {
                if (temLocalizacao()) {
                    retorno.invoke(origem, true, false);
                } else {
                    origemPendente = origem;
                    retornoPendente = retorno;
                    pedirPermissoes();
                }
            }
        });

        setContentView(web);
        if (salvo != null) web.restoreState(salvo);
        else web.loadUrl(ENDERECO);

        pedirPermissoes();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        acenderSeAlarme(intent);
    }

    /** Vindo da notificação do alarme: mostra por cima da tela de bloqueio. */
    private void acenderSeAlarme(Intent intent) {
        if (intent == null || !intent.getBooleanExtra("alarme", false)) return;
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Avisa a página: o alarme pode ter sido parado pela notificação.
        if (web != null) web.evaluateJavascript(
            "window.aoVoltarDoNativo && window.aoVoltarDoNativo()", null);
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

    boolean temLocalizacao() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void pedirPermissoes() {
        List<String> faltam = new ArrayList<>();
        if (!temLocalizacao()) {
            faltam.add(Manifest.permission.ACCESS_FINE_LOCATION);
            faltam.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            faltam.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!faltam.isEmpty()) requestPermissions(faltam.toArray(new String[0]), PEDIDO_PERMISSOES);
    }

    @Override
    public void onRequestPermissionsResult(int codigo, String[] permissoes, int[] resultados) {
        super.onRequestPermissionsResult(codigo, permissoes, resultados);
        if (retornoPendente != null) {
            retornoPendente.invoke(origemPendente, temLocalizacao(), false);
            retornoPendente = null;
            origemPendente = null;
        }
    }

    /** O que a página enxerga como window.AlarmeNativo. */
    class Ponte {
        /** Começa a vigiar. Recebe {lat, lon, raio, nome, som, vibrar, aviso}. */
        @JavascriptInterface
        public boolean vigiar(String json) {
            if (!temLocalizacao()) {
                runOnUiThread(MainActivity.this::pedirPermissoes);
                return false;
            }
            try {
                JSONObject o = new JSONObject(json);
                Intent i = new Intent(MainActivity.this, VigiaService.class)
                    .setAction(VigiaService.ACAO_VIGIAR)
                    .putExtra("lat", o.getDouble("lat"))
                    .putExtra("lon", o.getDouble("lon"))
                    .putExtra("raio", o.getDouble("raio"))
                    .putExtra("nome", o.optString("nome", "ponto"))
                    .putExtra("som", o.optBoolean("som", true))
                    .putExtra("vibrar", o.optBoolean("vibrar", true))
                    .putExtra("aviso", o.optBoolean("aviso", true));
                if (Build.VERSION.SDK_INT >= 26) startForegroundService(i);
                else startService(i);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Para a vigilância e o alarme, se estiver tocando. */
        @JavascriptInterface
        public void parar() {
            Intent i = new Intent(MainActivity.this, VigiaService.class).setAction(VigiaService.ACAO_PARAR);
            try { startService(i); } catch (Exception e) { /* serviço já parado */ }
        }

        /** Só silencia o alarme; a página decide o resto. */
        @JavascriptInterface
        public void silenciar() {
            parar();
        }

        @JavascriptInterface
        public boolean ativo() { return VigiaService.ativo; }

        @JavascriptInterface
        public boolean disparado() { return VigiaService.disparado; }

        @JavascriptInterface
        public String versao() { return BuildConfig.VERSION_NAME; }
    }
}
