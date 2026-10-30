package io.github.gilsonbolivar.pixelmusic;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.webkit.WebView;

/**
 * Mostra os controles do PixelMusic na notificação (e na tela de bloqueio),
 * mesmo com a tela apagada ou o app em segundo plano. Quem decodifica e toca
 * o áudio continua sendo a página, no <audio> dela; este serviço só espelha
 * o estado dela com android.media.session.MediaSession e repassa os
 * comandos de volta via window.pixelmusicComando(...) na WebView.
 */
public class PlayerService extends Service {

    static final String ACAO_ATUALIZAR = "atualizar";
    static final String ACAO_PARAR = "parar";
    private static final String ACAO_PLAY = "play";
    private static final String ACAO_PAUSE = "pause";
    private static final String ACAO_ANTERIOR = "anterior";
    private static final String ACAO_PROXIMA = "proxima";

    private static final String CANAL = "pixelmusic";
    private static final int NOTIF = 1;

    /** Definida pela MainActivity enquanto ela existe; o serviço só comanda a página por aqui. */
    static volatile WebView webView;

    private MediaSession sessao;
    private final Handler naTela = new Handler(Looper.getMainLooper());

    private String titulo = "";
    private boolean tocando = false;

    @Override
    public void onCreate() {
        super.onCreate();
        sessao = new MediaSession(this, "PixelMusic");
        sessao.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { comandar(ACAO_PLAY); }
            @Override public void onPause() { comandar(ACAO_PAUSE); }
            @Override public void onSkipToNext() { comandar(ACAO_PROXIMA); }
            @Override public void onSkipToPrevious() { comandar(ACAO_ANTERIOR); }
        }, naTela);
        sessao.setActive(true);
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String acao = intent == null ? null : intent.getAction();
        if (ACAO_PARAR.equals(acao)) {
            pararTudo();
            return START_NOT_STICKY;
        }
        if (ACAO_PLAY.equals(acao) || ACAO_PAUSE.equals(acao) || ACAO_ANTERIOR.equals(acao) || ACAO_PROXIMA.equals(acao)) {
            comandar(acao);
            return START_STICKY;
        }

        titulo = intent.getStringExtra("titulo");
        if (titulo == null || titulo.isEmpty()) titulo = "PixelMusic";
        tocando = intent.getBooleanExtra("tocando", false);

        criarCanal();
        atualizarSessao();
        Notification n = notificacao();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIF, n);
        }
        return START_STICKY;
    }

    /** Pede à página que troque de faixa ou de estado (play/pausa). */
    private void comandar(String acao) {
        WebView w = webView;
        if (w != null) {
            naTela.post(() -> w.evaluateJavascript(
                "window.pixelmusicComando && window.pixelmusicComando('" + acao + "')", null));
        }
        if (ACAO_PLAY.equals(acao)) tocando = true;
        else if (ACAO_PAUSE.equals(acao)) tocando = false;
        if (!ACAO_ANTERIOR.equals(acao) && !ACAO_PROXIMA.equals(acao)) {
            atualizarSessao();
            gerente().notify(NOTIF, notificacao());
        }
    }

    private void atualizarSessao() {
        PlaybackState.Builder b = new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE |
                PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS)
            .setState(tocando ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, 0, 1f);
        sessao.setPlaybackState(b.build());
        android.media.MediaMetadata m = new android.media.MediaMetadata.Builder()
            .putString(android.media.MediaMetadata.METADATA_KEY_TITLE, titulo)
            .putString(android.media.MediaMetadata.METADATA_KEY_ARTIST, "PixelMusic")
            .build();
        sessao.setMetadata(m);
    }

    private void pararTudo() {
        sessao.setActive(false);
        sessao.release();
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (sessao != null) { sessao.setActive(false); sessao.release(); }
        super.onDestroy();
    }

    /* ——— notificação ——— */

    private NotificationManager gerente() {
        return (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private void criarCanal() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel c = new NotificationChannel(CANAL, "Tocando agora", NotificationManager.IMPORTANCE_LOW);
        c.setDescription("Controles da música que está tocando.");
        gerente().createNotificationChannel(c);
    }

    private Notification notificacao() {
        Intent abrir = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pAbrir = PendingIntent.getActivity(this, 0, abrir,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Action anterior = acao(ACAO_ANTERIOR, "Anterior", R.drawable.ic_anterior);
        Notification.Action tocarPausar = tocando
            ? acao(ACAO_PAUSE, "Pausar", R.drawable.ic_pausar)
            : acao(ACAO_PLAY, "Tocar", R.drawable.ic_tocar);
        Notification.Action proxima = acao(ACAO_PROXIMA, "Próxima", R.drawable.ic_proxima);

        Notification.Builder b = (Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CANAL)
            : new Notification.Builder(this))
            .setSmallIcon(R.drawable.ic_notificacao)
            .setContentTitle(titulo)
            .setContentText("PixelMusic")
            .setOngoing(tocando)
            .setOnlyAlertOnce(true)
            .setContentIntent(pAbrir)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(anterior)
            .addAction(tocarPausar)
            .addAction(proxima)
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(sessao.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));
        return b.build();
    }

    private Notification.Action acao(String tipoAcao, String rotulo, int icone) {
        Intent i = new Intent(this, PlayerService.class).setAction(tipoAcao);
        PendingIntent p = PendingIntent.getService(this, tipoAcao.hashCode(), i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Action.Builder(Icon.createWithResource(this, icone), rotulo, p).build();
    }
}
