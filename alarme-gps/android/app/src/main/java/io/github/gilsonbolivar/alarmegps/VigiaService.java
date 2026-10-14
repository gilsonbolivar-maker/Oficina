package io.github.gilsonbolivar.alarmegps;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;

import java.util.Locale;

/**
 * Vigia o GPS em primeiro plano (com notificação fixa), mesmo com a tela
 * apagada, e toca o alarme do aparelho ao entrar no raio do ponto.
 */
public class VigiaService extends Service implements LocationListener {

    static final String ACAO_VIGIAR = "vigiar";
    static final String ACAO_PARAR = "parar";

    static volatile boolean ativo = false;
    static volatile boolean disparado = false;

    private static final String CANAL_VIGIA = "vigia";
    private static final String CANAL_ALARME = "alarme";
    private static final int NOTIF_VIGIA = 1;
    private static final int NOTIF_ALARME = 2;

    private double lat, lon, raio;
    private String nome;
    private boolean som, vibrar, aviso;
    private boolean avisou = false;
    private long ultimaNotif = 0;

    private LocationManager gps;
    private PowerManager.WakeLock trava;
    private MediaPlayer tocador;
    private Vibrator vibrador;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACAO_PARAR.equals(intent.getAction())) {
            pararTudo();
            return START_NOT_STICKY;
        }

        pararSom();
        lat = intent.getDoubleExtra("lat", 0);
        lon = intent.getDoubleExtra("lon", 0);
        raio = intent.getDoubleExtra("raio", 300);
        nome = intent.getStringExtra("nome");
        som = intent.getBooleanExtra("som", true);
        vibrar = intent.getBooleanExtra("vibrar", true);
        aviso = intent.getBooleanExtra("aviso", true);
        avisou = false;
        disparado = false;

        criarCanais();
        Notification n = notificacaoVigia("Procurando o GPS…");
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_VIGIA, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIF_VIGIA, n);
        }
        ativo = true;

        if (trava == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            trava = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AlarmeGPS:vigia");
            trava.setReferenceCounted(false);
        }
        trava.acquire(12 * 60 * 60 * 1000L);   // no máximo 12 h

        gps = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        try {
            gps.removeUpdates(this);
            if (gps.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                gps.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000, 0, this, Looper.getMainLooper());
            }
            if (gps.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                gps.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000, 0, this, Looper.getMainLooper());
            }
        } catch (SecurityException e) {
            pararTudo();
        }
        return START_REDELIVER_INTENT;
    }

    @Override
    public void onLocationChanged(Location pos) {
        if (!ativo || disparado) return;
        float[] r = new float[1];
        Location.distanceBetween(pos.getLatitude(), pos.getLongitude(), lat, lon, r);
        double d = r[0];

        if (d <= raio) {
            disparar(d);
            return;
        }
        if (aviso && !avisou && d <= raio * 2) {
            avisou = true;
            bipe();
        } else if (d > raio * 2.5) {
            avisou = false;
        }

        long agora = SystemClock.elapsedRealtime();
        if (agora - ultimaNotif > 5000) {
            ultimaNotif = agora;
            String precisao = pos.hasAccuracy() ? " (±" + Math.round(pos.getAccuracy()) + " m)" : "";
            gerente().notify(NOTIF_VIGIA, notificacaoVigia("Faltam " + distancia(d) + precisao));
        }
    }

    @Override public void onStatusChanged(String p, int s, Bundle b) { }
    @Override public void onProviderEnabled(String p) { }
    @Override public void onProviderDisabled(String p) { }

    private void disparar(double d) {
        disparado = true;
        if (gps != null) gps.removeUpdates(this);

        Intent abrir = new Intent(this, MainActivity.class)
            .putExtra("alarme", true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pAbrir = PendingIntent.getActivity(this, 1, abrir,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = construtor(CANAL_ALARME)
            .setContentTitle("Chegou: " + nome)
            .setContentText("Você está a " + distancia(d) + " do ponto.")
            .setCategory(Notification.CATEGORY_ALARM)
            .setPriority(Notification.PRIORITY_MAX)
            .setOngoing(true)
            .setContentIntent(pAbrir)
            .setFullScreenIntent(pAbrir, true)
            .addAction(new Notification.Action.Builder(null, "Parar alarme", acaoParar()).build());
        gerente().notify(NOTIF_ALARME, b.build());

        if (som) tocar();
        if (vibrar) vibrarSempre();
    }

    private void tocar() {
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
        long[] padrao = {0, 800, 400, 800, 400};
        if (Build.VERSION.SDK_INT >= 26) vibrador.vibrate(VibrationEffect.createWaveform(padrao, 0));
        else vibrador.vibrate(padrao, 0);
    }

    private void bipe() {
        try {
            ToneGenerator t = new ToneGenerator(AudioManager.STREAM_ALARM, 90);
            t.startTone(ToneGenerator.TONE_PROP_BEEP2, 600);
        } catch (Exception e) { /* sem som */ }
        if (vibrar) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(300, 255));
        }
    }

    private void pararSom() {
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

    private void pararTudo() {
        ativo = false;
        disparado = false;
        pararSom();
        if (gps != null) gps.removeUpdates(this);
        if (trava != null && trava.isHeld()) trava.release();
        gerente().cancel(NOTIF_ALARME);
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        ativo = false;
        pararSom();
        if (gps != null) gps.removeUpdates(this);
        if (trava != null && trava.isHeld()) trava.release();
        super.onDestroy();
    }

    /* ——— notificações ——— */

    private NotificationManager gerente() {
        return (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private void criarCanais() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel vigia = new NotificationChannel(CANAL_VIGIA, "Vigiando", NotificationManager.IMPORTANCE_LOW);
        vigia.setDescription("Mostra quanto falta enquanto o app vigia o ponto.");
        NotificationChannel alarme = new NotificationChannel(CANAL_ALARME, "Alarme de chegada", NotificationManager.IMPORTANCE_HIGH);
        alarme.setDescription("Toca ao chegar no ponto.");
        alarme.setSound(null, null);          // o som é o alarme tocado pelo próprio serviço
        alarme.enableVibration(false);
        alarme.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        gerente().createNotificationChannel(vigia);
        gerente().createNotificationChannel(alarme);
    }

    private Notification.Builder construtor(String canal) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, canal)
            : new Notification.Builder(this);
        return b.setSmallIcon(R.drawable.ic_notificacao).setVisibility(Notification.VISIBILITY_PUBLIC);
    }

    private PendingIntent acaoParar() {
        Intent parar = new Intent(this, VigiaService.class).setAction(ACAO_PARAR);
        return PendingIntent.getService(this, 2, parar,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification notificacaoVigia(String texto) {
        Intent abrir = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pAbrir = PendingIntent.getActivity(this, 0, abrir,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return construtor(CANAL_VIGIA)
            .setContentTitle("Vigiando: " + nome)
            .setContentText(texto)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pAbrir)
            .addAction(new Notification.Action.Builder(null, "Parar", acaoParar()).build())
            .build();
    }

    private static String distancia(double m) {
        if (m < 1000) return Math.round(m) + " m";
        return String.format(new Locale("pt", "BR"), "%.1f km", m / 1000);
    }
}
