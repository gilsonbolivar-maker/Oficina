package io.github.gilsonbolivar.inicio;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
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
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.StatFs;
import android.os.SystemClock;
import android.provider.Settings;
import android.telephony.SignalStrength;
import android.telephony.TelephonyManager;
import android.util.Base64;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
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
 * vem dentro do APK, para a tela inicial nunca ficar em branco. A ponte também
 * dá ao mostrador a bateria, o armazenamento, a rede e as notificações.
 */
public class MainActivity extends Activity {

    static final String ENDERECO = "https://gilsonbolivar-maker.github.io/Oficina/inicio/";
    static final String HOST = "gilsonbolivar-maker.github.io";
    static final String RESERVA = "file:///android_asset/sem-rede.html";
    private static final int TAMANHO_ICONE = 144;
    private static final int PEDIDO_LOCALIZACAO = 2;

    /** NetworkCapabilities.TRANSPORT_SATELLITE, do Android 15 (API 35); o SDK 34 ainda não tem o nome. */
    private static final int TRANSPORTE_SATELITE = 10;

    private WebView web;
    private ConnectivityManager.NetworkCallback mudouRede;
    private String origemPendente;
    private GeolocationPermissions.Callback retornoPendente;

    private final BroadcastReceiver mudouApp = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            chamarPagina("window.aoVoltar && window.aoVoltar()");
        }
    };

    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        getWindow().setStatusBarColor(Color.parseColor("#14042a"));
        getWindow().setNavigationBarColor(Color.parseColor("#14042a"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#14042a"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
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

        // Clima do mostrador: a página pede a localização (aproximada basta).
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origem, GeolocationPermissions.Callback retorno) {
                if (temLocalizacao()) {
                    retorno.invoke(origem, true, false);
                } else {
                    origemPendente = origem;
                    retornoPendente = retorno;
                    requestPermissions(new String[] { Manifest.permission.ACCESS_COARSE_LOCATION }, PEDIDO_LOCALIZACAO);
                }
            }
        });

        setContentView(web);
        web.loadUrl(ENDERECO);

        NotificacoesService.aoMudar = () ->
            chamarPagina("window.aoMudarNotificacoes && window.aoMudarNotificacoes()");

        // Rede mudou (Wi-Fi, dados, satélite): o mostrador redesenha as bolhas na hora.
        mudouRede = new ConnectivityManager.NetworkCallback() {
            @Override public void onCapabilitiesChanged(Network n, NetworkCapabilities c) { avisarRede(); }
            @Override public void onLost(Network n) { avisarRede(); }
        };
        try { getSystemService(ConnectivityManager.class).registerDefaultNetworkCallback(mudouRede); } catch (Exception e) { mudouRede = null; }

        IntentFilter filtro = new IntentFilter();
        filtro.addAction(Intent.ACTION_PACKAGE_ADDED);
        filtro.addAction(Intent.ACTION_PACKAGE_REMOVED);
        filtro.addAction(Intent.ACTION_PACKAGE_CHANGED);
        filtro.addDataScheme("package");
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(mudouApp, filtro, Context.RECEIVER_EXPORTED);
        else registerReceiver(mudouApp, filtro);
    }

    boolean temLocalizacao() {
        return checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int codigo, String[] permissoes, int[] resultados) {
        super.onRequestPermissionsResult(codigo, permissoes, resultados);
        if (codigo == PEDIDO_LOCALIZACAO && retornoPendente != null) {
            retornoPendente.invoke(origemPendente, temLocalizacao(), false);
            retornoPendente = null;
            origemPendente = null;
        }
    }

    private void avisarRede() {
        chamarPagina("window.aoMudarRede && window.aoMudarRede()");
    }

    @Override
    protected void onDestroy() {
        NotificacoesService.aoMudar = null;
        if (mudouRede != null) {
            try { getSystemService(ConnectivityManager.class).unregisterNetworkCallback(mudouRede); } catch (Exception e) { /* já saiu */ }
        }
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

        /** Bloco de foco: vibra, toca e notifica daqui a tantos segundos. */
        @JavascriptInterface
        public void avisarEm(int segundos, String tarefa) {
            AlarmManager am = getSystemService(AlarmManager.class);
            PendingIntent aviso = AvisoReceiver.intento(MainActivity.this, tarefa);
            long quando = System.currentTimeMillis() + Math.max(1, segundos) * 1000L;
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quando, aviso);
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quando, aviso);
            }
            if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1));
            }
        }

        @JavascriptInterface
        public void cancelarAviso() {
            getSystemService(AlarmManager.class).cancel(AvisoReceiver.intento(MainActivity.this, ""));
        }

        /** { "nivel": 87, "carregando": true, "temperatura": 31.2 } */
        @JavascriptInterface
        public String bateria() {
            JSONObject saida = new JSONObject();
            try {
                Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (b != null) {
                    int nivel = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                    int escala = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
                    int estado = b.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                    saida.put("nivel", Math.round(nivel * 100f / Math.max(1, escala)));
                    saida.put("carregando", estado == BatteryManager.BATTERY_STATUS_CHARGING || estado == BatteryManager.BATTERY_STATUS_FULL);
                    saida.put("temperatura", b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10.0);
                }
            } catch (Exception e) { /* sem dado */ }
            return saida.toString();
        }

        /** Espaço do aparelho, em bytes, e há quanto tempo está ligado. */
        @JavascriptInterface
        public String armazenamento() {
            JSONObject saida = new JSONObject();
            try {
                StatFs fs = new StatFs(Environment.getDataDirectory().getPath());
                saida.put("livre", fs.getAvailableBytes());
                saida.put("total", fs.getTotalBytes());
                saida.put("ligadoMs", SystemClock.elapsedRealtime());
            } catch (Exception e) { /* sem dado */ }
            return saida.toString();
        }

        /**
         * { "tipo": "wifi" | "movel" | "satelite" | "nenhuma", "nivel": 0..4,
         *   "operadora": "Vivo", "satelite": true, "pelo": "transporte" | "nome" }
         * Satélite: a rede ativa diz que é satélite (Android 15+), ou o nome da
         * operadora fala em Starlink/satélite (a Vivo usa "VIVO STARLINK").
         */
        @JavascriptInterface
        public String rede() {
            JSONObject saida = new JSONObject();
            try {
                ConnectivityManager cm = getSystemService(ConnectivityManager.class);
                NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
                String tipo = "nenhuma";
                int nivel = -1;
                if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    tipo = "wifi";
                    WifiManager wm = getApplicationContext().getSystemService(WifiManager.class);
                    nivel = WifiManager.calculateSignalLevel(wm.getConnectionInfo().getRssi(), 5);
                } else if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                    tipo = "movel";
                    if (Build.VERSION.SDK_INT >= 28) {
                        SignalStrength sinal = getSystemService(TelephonyManager.class).getSignalStrength();
                        if (sinal != null) nivel = sinal.getLevel();
                    }
                }
                String operadora = "";
                try { operadora = String.valueOf(getSystemService(TelephonyManager.class).getNetworkOperatorName()); } catch (Exception e) { /* sem chip */ }
                String nome = operadora.toLowerCase(java.util.Locale.ROOT);
                boolean pelaRede = Build.VERSION.SDK_INT >= 35 && caps != null && caps.hasTransport(TRANSPORTE_SATELITE);
                boolean peloNome = nome.contains("starlink") || nome.contains("satélite") || nome.contains("satelite") || nome.contains("sat mode");
                if (pelaRede) tipo = "satelite";
                saida.put("tipo", tipo);
                saida.put("nivel", nivel);
                saida.put("operadora", operadora);
                saida.put("satelite", pelaRede || peloNome);
                if (pelaRede || peloNome) saida.put("pelo", pelaRede ? "transporte" : "nome");
            } catch (Exception e) { /* sem dado */ }
            return saida.toString();
        }

        @JavascriptInterface
        public String notificacoes() {
            return NotificacoesService.resumo();
        }

        /** Pinta as barras do Android com a cor do tema (ex.: "#0e1418"). */
        @JavascriptInterface
        public void corDasBarras(String hex) {
            final int cor;
            try { cor = Color.parseColor(hex); } catch (Exception e) { return; }
            runOnUiThread(() -> {
                getWindow().setStatusBarColor(cor);
                getWindow().setNavigationBarColor(cor);
                if (web != null) web.setBackgroundColor(cor);
            });
        }

        /** Abre o "Acesso a notificações", onde a pessoa liga o Início. */
        @JavascriptInterface
        public void pedirNotificacoes() {
            try {
                startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception e) { /* sem a tela */ }
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
