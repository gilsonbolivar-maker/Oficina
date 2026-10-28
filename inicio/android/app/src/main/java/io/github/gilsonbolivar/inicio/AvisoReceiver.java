package io.github.gilsonbolivar.inicio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;

/**
 * Fim do bloco de foco: notifica com som e vibração. Sem permissão de
 * notificação, ao menos vibra e toca o som de notificação do celular.
 */
public class AvisoReceiver extends BroadcastReceiver {

    static final String CANAL = "bloco-de-foco";
    private static final long[] VIBRACAO = { 0, 400, 200, 400, 200, 400 };

    /** O mesmo intento serve para agendar e para cancelar (o texto não entra na comparação). */
    static PendingIntent intento(Context c, String tarefa) {
        Intent i = new Intent(c, AvisoReceiver.class).putExtra("tarefa", tarefa == null ? "" : tarefa);
        return PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context c, Intent i) {
        String tarefa = i.getStringExtra("tarefa");
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null && nm.areNotificationsEnabled()) notificar(c, nm, tarefa);
        else vibrarETocar(c);
    }

    private void notificar(Context c, NotificationManager nm, String tarefa) {
        Uri som = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        NotificationChannel canal = new NotificationChannel(CANAL, "Bloco de foco", NotificationManager.IMPORTANCE_HIGH);
        canal.setDescription("Avisa quando o bloco de foco termina.");
        canal.enableVibration(true);
        canal.setVibrationPattern(VIBRACAO);
        canal.setSound(som, new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build());
        nm.createNotificationChannel(canal);

        PendingIntent abrir = PendingIntent.getActivity(c, 0,
            new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE);
        String texto = tarefa == null || tarefa.isEmpty() ? "Respire. Um passo de cada vez." : tarefa;
        Notification n = new Notification.Builder(c, CANAL)
            .setSmallIcon(R.drawable.ic_notificacao)
            .setContentTitle("Bloco de foco terminado")
            .setContentText(texto)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setContentIntent(abrir)
            .setAutoCancel(true)
            .build();
        nm.notify(1, n);
    }

    private void vibrarETocar(Context c) {
        Vibrator v = c.getSystemService(Vibrator.class);
        if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createWaveform(VIBRACAO, -1));
        Ringtone r = RingtoneManager.getRingtone(c, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
        if (r != null) r.play();
    }
}
