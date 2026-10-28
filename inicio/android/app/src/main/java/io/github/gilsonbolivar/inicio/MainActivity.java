package io.github.gilsonbolivar.inicio;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.List;

/**
 * Tela inicial do Android. Abre o Início do site numa WebView e oferece à
 * página a ponte "InicioNativo": listar os apps do celular, pegar o ícone de
 * cada um e abri-los. Sem rede e sem cache, mostra a página de reserva que
 * vem dentro do APK, para a tela inicial nunca ficar em branco.
 */
public class MainActivity extends Activity {

    static final String ENDERECO = "https://gilsonbolivar-maker.github.io/Oficina/inicio/";
    static final String HOST = "gilsonbolivar-maker.github.io";
    static final String RESERVA = "file:///android_asset/sem-rede.html";
    private static final int TAMANHO_ICONE = 144;

    private WebView web;

    private final BroadcastReceiver mudouApp = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            chamarPagina("window.aoVoltar && window.aoVoltar()");
        }
    };

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
        s.setUserAgentString(s.getUserAgentString() + " Inicio-Android/" + BuildConfig.VERSION_NAME);

        web.addJavascriptInterface(new Ponte(), "InicioNativo");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest pedido) {
                Uri u = pedido.getUrl();
                if (HOST.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/Oficina/inicio")) {
                    return false;
                }
                abrirNoNavegador(u);
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest pedido, WebResourceError erro) {
                if (pedido.isForMainFrame() && !RESERVA.equals(v.getUrl())) v.loadUrl(RESERVA);
            }
        });

        setContentView(web);
        web.loadUrl(ENDERECO);

        IntentFilter filtro = new IntentFilter();
        filtro.addAction(Intent.ACTION_PACKAGE_ADDED);
        filtro.addAction(Intent.ACTION_PACKAGE_REMOVED);
        filtro.addAction(Intent.ACTION_PACKAGE_CHANGED);
        filtro.addDataScheme("package");
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(mudouApp, filtro, Context.RECEIVER_EXPORTED);
        else registerReceiver(mudouApp, filtro);
    }

    @Override
    protected void onDestroy() {
        unregisterReceiver(mudouApp);
        web.destroy();
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.hasCategory(Intent.CATEGORY_HOME)) {
            chamarPagina("window.aoApertarInicio && window.aoApertarInicio()");
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        chamarPagina("window.aoVoltar && window.aoVoltar()");
    }

    /** A tela inicial não fecha: o voltar só limpa a busca ou fecha o menu. */
    @Override
    public void onBackPressed() {
        chamarPagina("window.aoVoltarBotao && window.aoVoltarBotao()");
    }

    void chamarPagina(String js) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); });
    }

    void abrirNoNavegador(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) { /* sem navegador */ }
    }

    /** O que a página do Início pode pedir ao Android. */
    class Ponte {

        @JavascriptInterface
        public String versao() {
            return BuildConfig.VERSION_NAME;
        }

        /** Apps da gaveta: [{ id: "pacote/atividade", nome, pacote }]. */
        @JavascriptInterface
        public String apps() {
            PackageManager pm = getPackageManager();
            Intent gaveta = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> lista = pm.queryIntentActivities(gaveta, 0);
            JSONArray saida = new JSONArray();
            for (ResolveInfo ri : lista) {
                String pacote = ri.activityInfo.packageName;
                if (pacote.equals(getPackageName())) continue;
                try {
                    JSONObject app = new JSONObject();
                    app.put("id", new ComponentName(pacote, ri.activityInfo.name).flattenToString());
                    app.put("nome", String.valueOf(ri.loadLabel(pm)));
                    app.put("pacote", pacote);
                    saida.put(app);
                } catch (Exception e) { /* pula este */ }
            }
            return saida.toString();
        }

        /** Ícone do app como data URL PNG; vazio se não der. */
        @JavascriptInterface
        public String icone(String id) {
            ComponentName c = ComponentName.unflattenFromString(id);
            if (c == null) return "";
            try {
                Drawable d = getPackageManager().getActivityIcon(c);
                Bitmap b = Bitmap.createBitmap(TAMANHO_ICONE, TAMANHO_ICONE, Bitmap.Config.ARGB_8888);
                d.setBounds(0, 0, TAMANHO_ICONE, TAMANHO_ICONE);
                d.draw(new Canvas(b));
                ByteArrayOutputStream saida = new ByteArrayOutputStream();
                b.compress(Bitmap.CompressFormat.PNG, 100, saida);
                b.recycle();
                return "data:image/png;base64," + Base64.encodeToString(saida.toByteArray(), Base64.NO_WRAP);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean abrir(String id) {
            ComponentName c = ComponentName.unflattenFromString(id);
            if (c == null) return false;
            Intent i = new Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .setComponent(c)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            try {
                startActivity(i);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Tela de informações do app (desinstalar, permissões…). */
        @JavascriptInterface
        public void info(String id) {
            ComponentName c = ComponentName.unflattenFromString(id);
            if (c == null) return;
            try {
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", c.getPackageName(), null))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception e) { /* sem a tela */ }
        }

        /** Link para fora (apps da Oficina no site): abre no navegador. */
        @JavascriptInterface
        public void abrirLink(String url) {
            Uri u = Uri.parse(url);
            if ("https".equals(u.getScheme())) abrirNoNavegador(u);
        }

        @JavascriptInterface
        public boolean ehInicio() {
            Intent casa = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            ResolveInfo r = getPackageManager().resolveActivity(casa, PackageManager.MATCH_DEFAULT_ONLY);
            return r != null && getPackageName().equals(r.activityInfo.packageName);
        }

        /** Ajustes onde se escolhe a tela inicial (no Redmi: Apps padrão › Tela inicial). */
        @JavascriptInterface
        public void escolherInicio() {
            String[] telas = { Settings.ACTION_HOME_SETTINGS, Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS, Settings.ACTION_SETTINGS };
            for (String tela : telas) {
                try {
                    startActivity(new Intent(tela).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    return;
                } catch (Exception e) { /* tenta a próxima */ }
            }
        }
    }
}
