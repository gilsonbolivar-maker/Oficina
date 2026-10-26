package io.github.gilsonbolivar.sinal;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import javax.crypto.SecretKey;

/**
 * Escuta em primeiro plano, com a tela apagada: liga nos servidores MQTT
 * (os mesmos da página), abre as mensagens com as chaves dos convites e,
 * quando chega um alarme, acende a tela e toca o alarme do aparelho.
 *
 * Responde "chegou" sozinho e anuncia "estou aqui" — assim quem chamou sabe
 * que tocou, mesmo com o app no bolso. O resto (mandar, responder, anexos)
 * fica com a página.
 */
public class EscutaService extends Service implements Mqtt.Ouvinte {

    static final String ACAO_ATUALIZAR = "atualizar";
    static final String ACAO_PARAR_ALARME = "parar-alarme";
    static final String PREFS = "sinal";

    private static final String CANAL_ESCUTA = "escuta";
    private static final String CANAL_ALARME = "alarme";
    private static final String CANAL_AVISO = "aviso";
    private static final int NOTIF_ESCUTA = 1;
    private static final int NOTIF_ALARME = 2;
    private static final int NOTIF_AVISO = 3;
    private static final long VALIDADE_MS = 60 * 60 * 1000L;
    // A mesma lista da página: hivemq e emqx, aqui pela porta MQTT com TLS.
    private static final String[][] SERVIDORES = {{"broker.hivemq.com", "8883"}, {"broker.emqx.io", "8883"}};

    static volatile EscutaService atual;

    /** Uma pessoa (no PAINEL) ou o PAINEL (no SINAL): a chave e os caminhos. */
    private static final class Contato {
        String nome;
        SecretKey aes;
        String entra;      // onde chegam as mensagens para mim
        String volta;      // por onde respondo
        String presenca;   // onde anuncio "estou aqui"
    }

    private final Map<String, Contato> porTopico = new HashMap<>();
    private final List<Contato> contatos = new ArrayList<>();
    private final List<Mqtt> conexoes = new ArrayList<>();
    private String assinatura = "";
    private ScheduledExecutorService relogio;
    private PowerManager.WakeLock trava;
    private WifiManager.WifiLock travaWifi;
    private MediaPlayer tocador;
    private Vibrator vibrador;
    private final Handler principal = new Handler(Looper.getMainLooper());

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void iniciar(Context c, String acao) {
        Intent i = new Intent(c, EscutaService.class).setAction(acao);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        atual = this;
        criarCanais();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = notificacaoEscuta("Escutando…");
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ESCUTA, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING);
        } else {
            startForeground(NOTIF_ESCUTA, n);
        }
        if (intent != null && ACAO_PARAR_ALARME.equals(intent.getAction())) {
            pararAlarme();
            return START_STICKY;
        }
        SharedPreferences p = prefs(this);
        if (!p.getBoolean("escutar", false)) {
            pararTudo();
            return START_NOT_STICKY;
        }
        travar();
        reconfigurar(p.getString("config", "{}"));
        return START_STICKY;
    }

    /* ——— ligação ——— */

    private synchronized void reconfigurar(String json) {
        if (json.equals(assinatura) && !conexoes.isEmpty()) return;
        assinatura = json;
        for (Mqtt m : conexoes) m.parar();
        conexoes.clear();
        porTopico.clear();
        contatos.clear();
        try {
            JSONObject cfg = new JSONObject(json);
            boolean painel = "painel".equals(cfg.optString("papel"));
            JSONArray lista = cfg.optJSONArray("contatos");
            for (int i = 0; lista != null && i < lista.length(); i++) {
                JSONObject o = lista.getJSONObject(i);
                String chave = o.getString("chave");
                Contato c = new Contato();
                c.nome = o.optString("nome", painel ? "Alguém" : "PAINEL");
                c.aes = Cifra.chave(chave);
                c.entra = Cifra.topico(painel ? "para-painel" : "para-sinal", chave);
                c.volta = Cifra.topico(painel ? "para-sinal" : "para-painel", chave);
                c.presenca = Cifra.topico(painel ? "presenca-painel" : "presenca-sinal", chave);
                contatos.add(c);
                porTopico.put(c.entra, c);
            }
        } catch (Exception e) {
            return;
        }
        List<String> topicos = new ArrayList<>(porTopico.keySet());
        for (String[] s : SERVIDORES) {
            Mqtt m = new Mqtt(s[0], Integer.parseInt(s[1]), topicos, this);
            conexoes.add(m);
            m.iniciar();
        }
        if (relogio == null) {
            relogio = Executors.newSingleThreadScheduledExecutor();
            relogio.scheduleWithFixedDelay(this::aCada30s, 30, 30, TimeUnit.SECONDS);
        }
    }

    private void aCada30s() {
        for (Mqtt m : new ArrayList<>(conexoes)) m.ping();
        anunciar();
    }

    /** "Estou aqui", guardado no servidor — igual ao da página. */
    private void anunciar() {
        for (Contato c : new ArrayList<>(contatos)) {
            try {
                JSONObject m = new JSONObject();
                m.put("kind", "presenca");
                m.put("online", true);
                m.put("id", UUID.randomUUID().toString());
                m.put("ts", System.currentTimeMillis());
                byte[] dados = Cifra.fechar(c.aes, m);
                for (Mqtt x : new ArrayList<>(conexoes)) x.publicar(c.presenca, dados, true);
            } catch (Exception e) { /* tenta na próxima */ }
        }
    }

    @Override
    public void estado() {
        int n = 0;
        for (Mqtt m : new ArrayList<>(conexoes)) if (m.ligado()) n++;
        final String texto = n > 0 ? "Escutando (" + n + " de " + conexoes.size() + " servidores)" : "Sem ligação. Tentando de novo…";
        principal.post(() -> gerente().notify(NOTIF_ESCUTA, notificacaoEscuta(texto)));
        if (n > 0) anunciar();
    }

    @Override
    public void mensagem(String topico, byte[] dados) {
        Contato c = porTopico.get(topico);
        if (c == null) return;
        JSONObject m = Cifra.abrir(c.aes, dados);
        if (m == null) return;
        String tipo = m.optString("kind");
        String id = m.optString("id");
        long ts = m.optLong("ts", 0);
        if (id.isEmpty() || Math.abs(System.currentTimeMillis() - ts) > VALIDADE_MS) return;

        // Só alarme e resposta interessam aqui (pedaços de anexo e confirmações ficam com a página).
        if (!"alarme".equals(tipo) && !"resposta".equals(tipo)) return;
        responderChegou(c, id);
        if (!marcarVisto(id)) return;

        // No PAINEL, o nome vem da lista; no SINAL, do que o PAINEL mandou.
        String q = "painel".equals(papel()) ? c.nome : m.optString("who", "");
        final String quem = q.isEmpty() ? c.nome : q;
        if ("alarme".equals(tipo)) {
            String recado = m.optString("note", "");
            final String texto = recado.isEmpty() ? nomeDoToque(m.optString("tone")) : recado;
            principal.post(() -> tocar(id, "De " + quem, texto));
        } else {
            final String texto = m.optString("texto", "");
            principal.post(() -> aviso("Resposta de " + quem, texto));
        }
    }

    private String papel() {
        try { return new JSONObject(assinatura).optString("papel"); } catch (Exception e) { return ""; }
    }

    private void responderChegou(Contato c, String ref) {
        try {
            JSONObject m = new JSONObject();
            m.put("kind", "chegou");
            m.put("ref", ref);
            m.put("id", UUID.randomUUID().toString());
            m.put("ts", System.currentTimeMillis());
            byte[] dados = Cifra.fechar(c.aes, m);
            for (Mqtt x : new ArrayList<>(conexoes)) x.publicar(c.volta, dados, false);
        } catch (Exception e) { /* a página confirma quando abrir */ }
    }

    /** Guarda os últimos 300 ids: a mensagem guardada no servidor chega de novo a cada ligação. */
    static synchronized boolean marcarVisto(Context ctx, String id) {
        SharedPreferences p = prefs(ctx);
        LinkedHashSet<String> vistos = new LinkedHashSet<>();
        try {
            JSONArray a = new JSONArray(p.getString("vistos", "[]"));
            for (int i = 0; i < a.length(); i++) vistos.add(a.getString(i));
        } catch (Exception e) { /* começa vazio */ }
        if (vistos.contains(id)) return false;
        vistos.add(id);
        List<String> l = new ArrayList<>(vistos);
        if (l.size() > 300) l = l.subList(l.size() - 300, l.size());
        p.edit().putString("vistos", new JSONArray(l).toString()).apply();
        return true;
    }

    private boolean marcarVisto(String id) { return marcarVisto(this, id); }

    private static String nomeDoToque(String t) {
        switch (t) {
            case "liga": return "Me liga";
            case "preciso": return "Compareça";
            case "olha": return "Olha aqui";
            default: return "É urgente";
        }
    }

    /* ——— alarme ——— */

    /** Acende a tela por cima do bloqueio, toca o alarme do aparelho e vibra. */
    void tocar(String id, String titulo, String texto) {
        Intent abrir = new Intent(this, MainActivity.class)
            .putExtra("alarme", true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pAbrir = PendingIntent.getActivity(this, 1, abrir,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent parar = new Intent(this, EscutaService.class).setAction(ACAO_PARAR_ALARME);
        PendingIntent pParar = PendingIntent.getService(this, 2, parar,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = construtor(CANAL_ALARME)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setStyle(new Notification.BigTextStyle().bigText(texto))
            .setCategory(Notification.CATEGORY_ALARM)
            .setPriority(Notification.PRIORITY_MAX)
            .setOngoing(true)
            .setContentIntent(pAbrir)
            .setFullScreenIntent(pAbrir, true)
            .addAction(new Notification.Action.Builder(null, "Parar", pParar).build());
        gerente().notify(NOTIF_ALARME, b.build());

        tocarSom();
        vibrarSempre();
        // Sem ninguém parar, cala sozinho em 3 minutos (a notificação fica).
        principal.removeCallbacks(calar);
        principal.postDelayed(calar, 3 * 60 * 1000L);
    }

    private final Runnable calar = this::pararSom;

    void pararAlarme() {
        pararSom();
        gerente().cancel(NOTIF_ALARME);
    }

    private void aviso(String titulo, String texto) {
        Intent abrir = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pAbrir = PendingIntent.getActivity(this, 3, abrir,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        gerente().notify(NOTIF_AVISO, construtor(CANAL_AVISO)
            .setContentTitle(titulo).setContentText(texto)
            .setAutoCancel(true).setContentIntent(pAbrir).build());
    }

    private void tocarSom() {
        pararSom();
        Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (uri == null) return;
        try {
            tocador = new MediaPlayer();
            tocador.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            tocador.setDataSource(this, uri);
            tocador.setLooping(true);
            tocador.prepare();
            tocador.start();
        } catch (Exception e) {
            tocador = null;
        }
    }

    private void vibrarSempre() {
        vibrador = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrador == null) return;
        long[] padrao = {0, 700, 300, 700, 300};
        if (Build.VERSION.SDK_INT >= 26) vibrador.vibrate(VibrationEffect.createWaveform(padrao, 0));
        else vibrador.vibrate(padrao, 0);
    }

    private void pararSom() {
        principal.removeCallbacks(calar);
        if (tocador != null) {
            try { tocador.stop(); } catch (Exception e) { /* já parado */ }
            tocador.release();
            tocador = null;
        }
        if (vibrador != null) {
            vibrador.cancel();
            vibrador = null;
        }
    }

    /* ——— vida do serviço ——— */

    private void travar() {
        if (trava == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            trava = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Sinal:escuta");
            trava.setReferenceCounted(false);
            trava.acquire();
        }
        if (travaWifi == null) {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                travaWifi = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Sinal:wifi");
                travaWifi.setReferenceCounted(false);
                travaWifi.acquire();
            }
        }
    }

    private void pararTudo() {
        pararAlarme();
        for (Mqtt m : conexoes) m.parar();
        conexoes.clear();
        assinatura = "";
        if (relogio != null) { relogio.shutdownNow(); relogio = null; }
        if (trava != null && trava.isHeld()) trava.release();
        trava = null;
        if (travaWifi != null && travaWifi.isHeld()) travaWifi.release();
        travaWifi = null;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        atual = null;
        pararSom();
        for (Mqtt m : conexoes) m.parar();
        if (relogio != null) relogio.shutdownNow();
        if (trava != null && trava.isHeld()) trava.release();
        if (travaWifi != null && travaWifi.isHeld()) travaWifi.release();
        super.onDestroy();
    }

    /* ——— notificações ——— */

    private NotificationManager gerente() {
        return (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private void criarCanais() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel escuta = new NotificationChannel(CANAL_ESCUTA, "Escutando", NotificationManager.IMPORTANCE_LOW);
        escuta.setDescription("Fica fixa enquanto o app escuta com a tela apagada.");
        NotificationChannel alarme = new NotificationChannel(CANAL_ALARME, "Alarme", NotificationManager.IMPORTANCE_HIGH);
        alarme.setDescription("Toca quando alguém chama.");
        alarme.setSound(null, null);          // o som é o alarme tocado pelo próprio serviço
        alarme.enableVibration(false);
        alarme.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        alarme.setBypassDnd(true);
        NotificationChannel aviso = new NotificationChannel(CANAL_AVISO, "Respostas", NotificationManager.IMPORTANCE_HIGH);
        aviso.setDescription("Quando alguém responde.");
        gerente().createNotificationChannel(escuta);
        gerente().createNotificationChannel(alarme);
        gerente().createNotificationChannel(aviso);
    }

    private Notification.Builder construtor(String canal) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, canal)
            : new Notification.Builder(this);
        return b.setSmallIcon(R.drawable.ic_notificacao).setVisibility(Notification.VISIBILITY_PUBLIC);
    }

    private Notification notificacaoEscuta(String texto) {
        Intent abrir = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pAbrir = PendingIntent.getActivity(this, 0, abrir,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return construtor(CANAL_ESCUTA)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(texto)
            .setOngoing(true)
            .setContentIntent(pAbrir)
            .build();
    }
}
