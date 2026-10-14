package io.github.gilsonbolivar.britagem;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Abre o Britagem do site numa WebView. A ponte "BritagemNativo" faz o que a
 * WebView não faz sozinha: salvar o PDF e a planilha em Downloads (e oferecer
 * para enviar) e copiar o relatório. O seletor de arquivo carrega as áreas.
 */
public class MainActivity extends Activity {

    static final String ENDERECO = "https://gilsonbolivar-maker.github.io/Oficina/britagem/";
    static final String HOST = "gilsonbolivar-maker.github.io";
    private static final int PEDIDO_ARQUIVO = 10;
    private static final int PEDIDO_GRAVAR = 11;

    private WebView web;
    private ValueCallback<Uri[]> retornoArquivo;

    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        getWindow().setStatusBarColor(Color.parseColor("#0b1220"));
        getWindow().setNavigationBarColor(Color.parseColor("#0b1220"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0b1220"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " Britagem-Android/" + BuildConfig.VERSION_NAME);

        web.addJavascriptInterface(new Ponte(), "BritagemNativo");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest pedido) {
                Uri u = pedido.getUrl();
                if (HOST.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/Oficina/britagem")) {
                    return false;
                }
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* sem navegador */ }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> retorno, FileChooserParams params) {
                if (retornoArquivo != null) retornoArquivo.onReceiveValue(null);
                retornoArquivo = retorno;
                // Qualquer tipo: quem confere o conteúdo é o app (regra da Oficina).
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
        else web.loadUrl(ENDERECO);

        if (Build.VERSION.SDK_INT <= 28 &&
            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, PEDIDO_GRAVAR);
        }
    }

    @Override
    protected void onActivityResult(int codigo, int resultado, Intent dados) {
        super.onActivityResult(codigo, resultado, dados);
        if (codigo != PEDIDO_ARQUIVO || retornoArquivo == null) return;
        Uri[] escolhidos = null;
        if (resultado == RESULT_OK && dados != null && dados.getData() != null) {
            escolhidos = new Uri[]{dados.getData()};
        }
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
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /** Grava em Downloads e devolve o endereço do arquivo, para enviar. */
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
        File arq = new File(pasta, nome);
        try (FileOutputStream out = new FileOutputStream(arq)) {
            out.write(dados);
        }
        return null;   // Android antigo: fica só salvo em Downloads
    }

    /** O que a página enxerga como window.BritagemNativo. */
    class Ponte {
        /** Recebe o arquivo em base64, grava em Downloads e oferece para enviar. */
        @JavascriptInterface
        public boolean salvar(String nome, String tipo, String base64) {
            try {
                byte[] dados = Base64.decode(base64, Base64.DEFAULT);
                String mime = (tipo == null || tipo.isEmpty()) ? "application/octet-stream" : tipo.split(";")[0];
                Uri uri = gravarEmDownloads(nome, mime, dados);
                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, nome + " salvo em Downloads", Toast.LENGTH_LONG).show();
                    if (uri != null) {
                        Intent enviar = new Intent(Intent.ACTION_SEND)
                            .setType(mime)
                            .putExtra(Intent.EXTRA_STREAM, uri)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        try { startActivity(Intent.createChooser(enviar, "Enviar " + nome)); } catch (Exception e) { /* nada */ }
                    }
                });
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean copiar(String texto) {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("Relatório Britagem", texto));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String versao() { return BuildConfig.VERSION_NAME; }
    }
}
