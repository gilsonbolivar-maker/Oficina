package io.github.gilsonbolivar.sinal;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Abre o SINAL (ou o PAINEL) do site numa WebView. A ponte "SinalNativo" dá
 * à página o que o navegador não tem: a escuta com a tela apagada (serviço
 * EscutaService), o alarme do aparelho por cima do bloqueio, salvar anexos em
 * Downloads e compartilhar o convite.
 */
public class MainActivity extends Activity {

    private static final int PEDIDO_ARQUIVO = 10;
    private static final int PEDIDO_PERMISSOES = 11;

    private WebView web;
    private ValueCallback<Uri[]> retornoArquivo;

    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        getWindow().setStatusBarColor(Color.parseColor("#141210"));
        getWindow().setNavigationBarColor(Color.parseColor("#141210"));
        acenderSeAlarme(getIntent());

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#141210"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // O som do alarme da página toca sem precisar tocar na tela antes.
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " SinalAPK/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new Ponte(), "SinalNativo");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest pedido) {
                Uri u = pedido.getUrl();
                if (u.toString().startsWith(BuildConfig.ENDERECO)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* sem navegador */ }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> retorno, FileChooserParams params) {
                if (retornoArquivo != null) retornoArquivo.onReceiveValue(null);
                retornoArquivo = retorno;
                // Qualquer tipo: quem confere é o app (regra da Oficina).
                Intent i = new Intent(Intent.ACTION_GET_CONTENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "Escolher arquivo"), PEDIDO_ARQUIVO);
                } catch (Exception e) {
                    retornoArquivo = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(web);
        if (salvo != null) web.restoreState(salvo);
        else web.loadUrl(enderecoInicial(getIntent()));

        pedirPermissoes();
    }

    /** Aberto por um link do convite (…/sinal/#c=…): carrega o link. */
    private String enderecoInicial(Intent intent) {
        Uri u = intent != null ? intent.getData() : null;
        if (u != null && u.toString().startsWith(BuildConfig.ENDERECO)) return u.toString();
        return BuildConfig.ENDERECO;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        acenderSeAlarme(intent);
        Uri u = intent.getData();
        if (u != null && u.toString().startsWith(BuildConfig.ENDERECO)) web.loadUrl(u.toString());
    }

    /** Vindo do alarme: aparece por cima da tela de bloqueio e acende a tela. */
    private void acenderSeAlarme(Intent intent) {
        boolean alarme = intent != null && intent.getBooleanExtra("alarme", false);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(alarme);
            setTurnScreenOn(alarme);
        }
    }

    @Override
    protected void onActivityResult(int codigo, int resultado, Intent dados) {
        super.onActivityResult(codigo, resultado, dados);
        if (codigo != PEDIDO_ARQUIVO || retornoArquivo == null) return;
        Uri[] escolhidos = null;
        if (resultado == RESULT_OK && dados != null && dados.getData() != null) escolhidos = new Uri[]{dados.getData()};
        retornoArquivo.onReceiveValue(escolhidos);
        retornoArquivo = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    @Override
    public void onBackPressed() {
        // Voltar não fecha a escuta: só manda o app para trás.
        if (web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    /* ——— permissões: notificação, bateria e tela cheia ——— */

    private void pedirPermissoes() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, PEDIDO_PERMISSOES);
        }
    }

    /** Pede uma vez: tirar da economia de bateria e liberar o alarme em tela cheia. */
    private void pedirLiberacoes() {
        SharedPreferences p = EscutaService.prefs(this);
        if (!p.getBoolean("pediu-bateria", false)) {
            p.edit().putBoolean("pediu-bateria", true).apply();
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (Build.VERSION.SDK_INT >= 23 && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                try {
                    startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + getPackageName())));
                    return;
                } catch (Exception e) { /* aparelho sem a tela */ }
            }
        }
        if (Build.VERSION.SDK_INT >= 34 && !p.getBoolean("pediu-tela-cheia", false)) {
            p.edit().putBoolean("pediu-tela-cheia", true).apply();
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (!nm.canUseFullScreenIntent()) {
                Toast.makeText(this, "Libere \"alarme em tela cheia\" para o app acender a tela.", Toast.LENGTH_LONG).show();
                try {
                    startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                        Uri.parse("package:" + getPackageName())));
                } catch (Exception e) { /* sem a tela */ }
            }
        }
    }

    /* ——— salvar e compartilhar ——— */

    /** Grava em Downloads e devolve o endereço do arquivo, para abrir/enviar. */
    private Uri gravarEmDownloads(String nome, String tipo, byte[] dados) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, nome);
            v.put(MediaStore.MediaColumns.MIME_TYPE, tipo);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new Exception("sem lugar em Downloads");
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                out.write(dados);
            }
            return uri;
        }
        File pasta = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        pasta.mkdirs();
        try (FileOutputStream out = new FileOutputStream(new File(pasta, nome))) {
            out.write(dados);
        }
        return null;
    }

    /** O que a página enxerga como window.SinalNativo. */
    class Ponte {
        /**
         * A página diz com quem conversa: {escutar, papel, contatos:[{chave, nome}]}.
         * Liga, atualiza ou desliga a escuta com a tela apagada.
         */
        @JavascriptInterface
        public void configurar(String json) {
            try {
                JSONObject o = new JSONObject(json);
                boolean escutar = o.optBoolean("escutar", false);
                EscutaService.prefs(MainActivity.this).edit()
                    .putBoolean("escutar", escutar)
                    .putString("config", o.toString())
                    .apply();
                if (escutar) {
                    EscutaService.iniciar(MainActivity.this, EscutaService.ACAO_ATUALIZAR);
                    runOnUiThread(MainActivity.this::pedirLiberacoes);
                } else if (EscutaService.atual != null) {
                    EscutaService.iniciar(MainActivity.this, EscutaService.ACAO_ATUALIZAR);
                }
            } catch (Exception e) { /* config inválida: ignora */ }
        }

        /** A página recebeu um alarme: toca o do aparelho (se o serviço ainda não tocou). */
        @JavascriptInterface
        public void tocarAlarme(String id, String titulo, String texto) {
            if (!EscutaService.marcarVisto(MainActivity.this, id)) return;
            EscutaService s = EscutaService.atual;
            if (s != null) runOnUiThread(() -> s.tocar(id, titulo, texto));
        }

        @JavascriptInterface
        public void pararAlarme() {
            EscutaService s = EscutaService.atual;
            if (s != null) runOnUiThread(s::pararAlarme);
            runOnUiThread(() -> acenderSeAlarme(null));
        }

        @JavascriptInterface
        public void notificar(String titulo, String texto) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, titulo + ": " + texto, Toast.LENGTH_LONG).show());
        }

        /** Recebe o arquivo em base64, grava em Downloads e, se pedir, oferece abrir. */
        @JavascriptInterface
        public boolean salvar(String nome, String tipo, String base64, boolean abrir) {
            try {
                byte[] dados = Base64.decode(base64, Base64.DEFAULT);
                String mime = (tipo == null || tipo.isEmpty()) ? "application/octet-stream" : tipo.split(";")[0];
                Uri uri = gravarEmDownloads(nome, mime, dados);
                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, nome + " salvo em Downloads", Toast.LENGTH_LONG).show();
                    if (abrir && uri != null) {
                        Intent ver = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        try { startActivity(Intent.createChooser(ver, "Abrir " + nome)); } catch (Exception e) { /* nada abre */ }
                    }
                });
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void compartilhar(String texto) {
            Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, texto);
            runOnUiThread(() -> {
                try { startActivity(Intent.createChooser(i, "Mandar")); } catch (Exception e) { /* nada */ }
            });
        }

        @JavascriptInterface
        public String versao() { return BuildConfig.VERSION_NAME; }
    }
}
