package io.github.gilsonbolivar.pixelmusic;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Abre o PixelMusic do site numa WebView. A página escolhe a pasta de música e
 * toca tudo sozinha; esta Activity oferece a ponte "PixelMusicNativo", que
 * entrega o estado (faixa, se está tocando) ao PlayerService, para que ele
 * mostre os controles na notificação mesmo com a tela apagada — e também
 * guarda a permissão da pasta escolhida (Storage Access Framework), para que
 * a página não precise pedir a pasta de novo toda vez que o app abre.
 */
public class MainActivity extends Activity {

    static final String ENDERECO = "https://gilsonbolivar-maker.github.io/Oficina/pixelmusic/";
    static final String HOST = "gilsonbolivar-maker.github.io";
    private static final String PREFIXO_NATIVO = "/Oficina/pixelmusic/pixelmusic-nativo/";

    private static final String PREFS = "pixelmusic";
    private static final String CHAVE_PASTA = "pasta_uri";

    private WebView web;
    private ValueCallback<Uri[]> retornoArquivo;
    private static final int PEDIDO_ARQUIVO = 51;
    private static final int PEDIDO_PASTA = 52;

    /** id (string) → documento da pasta (salva ou recém-escolhida). */
    private final Map<String, Uri> arquivosNativos = new ConcurrentHashMap<>();

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
        s.setUserAgentString(s.getUserAgentString() + " PixelMusic-Android/" + BuildConfig.VERSION_NAME);

        web.addJavascriptInterface(new Ponte(), "PixelMusicNativo");
        PlayerService.webView = web;

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest pedido) {
                Uri u = pedido.getUrl();
                if (HOST.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/Oficina/pixelmusic")) {
                    return false;
                }
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* sem navegador */ }
                return true;
            }

            /** Serve as faixas da pasta salva direto do SAF, sem passar pela rede. */
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith(PREFIXO_NATIVO)) {
                    String id = u.getPath().substring(PREFIXO_NATIVO.length());
                    return responderArquivoNativo(id, request.getRequestHeaders().get("Range"));
                }
                return super.shouldInterceptRequest(view, request);
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
            if (resultado == RESULT_OK && dados != null && dados.getData() != null) {
                salvarPastaEscolhida(dados.getData());
            }
            if (retornoArquivo != null) {
                retornoArquivo.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultado, dados));
                retornoArquivo = null;
            }
            return;
        }
        if (codigo == PEDIDO_PASTA) {
            tratarPastaEscolhida(resultado, dados);
            return;
        }
        super.onActivityResult(codigo, resultado, dados);
    }

    /**
     * Resultado do seletor de pasta nativo do Android (chamado por
     * Ponte.escolherPasta()). Diferente do seletor da WebView — que no
     * WebView do Android não abre um seletor de pasta de verdade, só um de
     * arquivo —, este sempre deixa escolher a pasta inteira.
     */
    private void tratarPastaEscolhida(int resultado, Intent dados) {
        if (resultado != RESULT_OK || dados == null || dados.getData() == null) {
            web.evaluateJavascript("window.pixelmusicPastaEscolhida && window.pixelmusicPastaEscolhida(null)", null);
            return;
        }
        Uri pastaUri = dados.getData();
        salvarPastaEscolhida(pastaUri);
        new Thread(() -> {
            arquivosNativos.clear();
            JSONArray saida = new JSONArray();
            listarRecursivo(pastaUri, DocumentsContract.getTreeDocumentId(pastaUri), saida, new AtomicInteger(0), 0);
            String json = saida.toString();
            runOnUiThread(() -> web.evaluateJavascript(
                "window.pixelmusicPastaEscolhida && window.pixelmusicPastaEscolhida(" + json + ")", null));
        }).start();
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

    /* ——— pasta salva (Storage Access Framework) ——— */

    private void salvarPastaEscolhida(Uri pastaUri) {
        try {
            Uri antiga = carregarUriSalva();
            if (antiga != null && !antiga.equals(pastaUri)) {
                try {
                    getContentResolver().releasePersistableUriPermission(antiga, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception e) { /* permissão já solta */ }
            }
            getContentResolver().takePersistableUriPermission(pastaUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(CHAVE_PASTA, pastaUri.toString()).apply();
        } catch (Exception e) { /* sem permissão persistente: só funciona nesta sessão, como no navegador */ }
    }

    private Uri carregarUriSalva() {
        String s = getSharedPreferences(PREFS, MODE_PRIVATE).getString(CHAVE_PASTA, null);
        return s == null ? null : Uri.parse(s);
    }

    private void listarRecursivo(Uri pastaUri, String idDocumento, JSONArray saida, AtomicInteger contador, int profundidade) {
        if (profundidade > 8 || contador.get() > 3000) return;
        Uri filhos = DocumentsContract.buildChildDocumentsUriUsingTree(pastaUri, idDocumento);
        try (Cursor c = getContentResolver().query(filhos, new String[]{
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE
        }, null, null, null)) {
            if (c == null) return;
            while (c.moveToNext()) {
                String docId = c.getString(0);
                String nome = c.getString(1);
                String mime = c.getString(2);
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    listarRecursivo(pastaUri, docId, saida, contador, profundidade + 1);
                } else if (ehAudio(mime, nome)) {
                    Uri docUri = DocumentsContract.buildDocumentUriUsingTree(pastaUri, docId);
                    String id = String.valueOf(contador.incrementAndGet());
                    arquivosNativos.put(id, docUri);
                    try {
                        JSONObject o = new JSONObject();
                        o.put("id", id);
                        o.put("nome", nome);
                        saida.put(o);
                    } catch (Exception e) { /* item ignorado */ }
                }
            }
        } catch (Exception e) { /* pasta ilegível: para por aqui */ }
    }

    private static boolean ehAudio(String mime, String nome) {
        if (mime != null && mime.startsWith("audio/")) return true;
        return nome != null && nome.matches("(?i).*\\.(mp3|m4a|aac|flac|ogg|oga|opus|wav|wma)$");
    }

    private WebResourceResponse responderArquivoNativo(String id, String cabecalhoRange) {
        Uri docUri = arquivosNativos.get(id);
        if (docUri == null) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Não encontrado", null,
                new ByteArrayInputStream(new byte[0]));
        }
        try {
            String mime = getContentResolver().getType(docUri);
            if (mime == null) mime = "audio/*";
            long tamanho = tamanhoDoDocumento(docUri);

            long inicio = 0;
            boolean parcial = false;
            if (cabecalhoRange != null && cabecalhoRange.startsWith("bytes=")) {
                String faixa = cabecalhoRange.substring(6);
                int tra = faixa.indexOf('-');
                String ini = tra >= 0 ? faixa.substring(0, tra) : faixa;
                if (!ini.isEmpty()) { inicio = Long.parseLong(ini); parcial = true; }
            }

            ParcelFileDescriptor pfd = getContentResolver().openFileDescriptor(docUri, "r");
            if (pfd == null) throw new IllegalStateException("sem descritor de arquivo");
            FileInputStream fluxo = new FileInputStream(pfd.getFileDescriptor());
            if (inicio > 0) fluxo.getChannel().position(inicio);

            Map<String, String> cabecalhos = new HashMap<>();
            cabecalhos.put("Accept-Ranges", "bytes");
            if (tamanho > 0) {
                cabecalhos.put("Content-Length", String.valueOf(tamanho - inicio));
                if (parcial) cabecalhos.put("Content-Range", "bytes " + inicio + "-" + (tamanho - 1) + "/" + tamanho);
            }
            int codigo = parcial ? 206 : 200;
            String motivo = parcial ? "Partial Content" : "OK";
            return new WebResourceResponse(mime, null, codigo, motivo, cabecalhos, fluxo);
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 500, "Erro ao ler o arquivo", null,
                new ByteArrayInputStream(new byte[0]));
        }
    }

    private long tamanhoDoDocumento(Uri docUri) {
        try (Cursor c = getContentResolver().query(docUri,
                new String[]{DocumentsContract.Document.COLUMN_SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getLong(0);
        } catch (Exception e) { /* tamanho desconhecido */ }
        return -1;
    }

    /** O que a página enxerga como window.PixelMusicNativo. */
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

        /**
         * Chamada pelo botão "Escolher pasta de música": abre o seletor de
         * pasta nativo do Android (não o da WebView, que só deixa escolher
         * um arquivo de cada vez). O resultado chega em
         * window.pixelmusicPastaEscolhida(lista) — null se o usuário cancelou.
         */
        @JavascriptInterface
        public void escolherPasta() {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            runOnUiThread(() -> {
                try {
                    startActivityForResult(i, PEDIDO_PASTA);
                } catch (Exception e) {
                    web.evaluateJavascript("window.pixelmusicPastaEscolhida && window.pixelmusicPastaEscolhida(null)", null);
                }
            });
        }

        /**
         * Chamada ao abrir a página: se há uma pasta salva de uma vez anterior,
         * lista as músicas dela (recursivamente) e devolve
         * [{id, nome}, …] em JSON. Lista vazia "[]" se não há pasta salva ou
         * a permissão não vale mais.
         */
        @JavascriptInterface
        public String listarPastaSalva() {
            Uri pastaUri = carregarUriSalva();
            if (pastaUri == null) return "[]";
            try {
                getContentResolver().takePersistableUriPermission(pastaUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                arquivosNativos.clear();
                JSONArray saida = new JSONArray();
                listarRecursivo(pastaUri, DocumentsContract.getTreeDocumentId(pastaUri), saida, new AtomicInteger(0), 0);
                return saida.toString();
            } catch (Exception e) {
                return "[]";
            }
        }
    }
}
