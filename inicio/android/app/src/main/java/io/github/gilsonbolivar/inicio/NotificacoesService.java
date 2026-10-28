package io.github.gilsonbolivar.inicio;

import android.app.Notification;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

/**
 * Conta as notificações na bandeja, por app, para o Início mostrar o total
 * no mostrador e um número em cima de cada ícone. Só conta; não lê o texto.
 * Só funciona depois que a pessoa liga o "Acesso a notificações" do Início.
 */
public class NotificacoesService extends NotificationListenerService {

    static volatile boolean ligado = false;
    private static volatile Map<String, Integer> porApp = new HashMap<>();
    static volatile Runnable aoMudar;

    @Override
    public void onListenerConnected() {
        ligado = true;
        recontar();
    }

    @Override
    public void onListenerDisconnected() {
        ligado = false;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        recontar();
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        recontar();
    }

    private void recontar() {
        Map<String, Integer> novo = new HashMap<>();
        try {
            StatusBarNotification[] ativas = getActiveNotifications();
            if (ativas != null) {
                for (StatusBarNotification sbn : ativas) {
                    Notification n = sbn.getNotification();
                    // Música tocando, download em andamento e o resumo do grupo não contam.
                    if (sbn.isOngoing() || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) continue;
                    if (sbn.getPackageName().equals(getPackageName())) continue;
                    Integer atual = novo.get(sbn.getPackageName());
                    novo.put(sbn.getPackageName(), atual == null ? 1 : atual + 1);
                }
            }
        } catch (Exception e) { /* serviço ainda não pronto */ }
        porApp = novo;
        Runnable r = aoMudar;
        if (r != null) r.run();
    }

    /** { "permitido": true, "total": 11, "apps": { "com.whatsapp": 9, ... } } */
    static String resumo() {
        JSONObject saida = new JSONObject();
        try {
            int total = 0;
            JSONObject apps = new JSONObject();
            for (Map.Entry<String, Integer> e : porApp.entrySet()) {
                apps.put(e.getKey(), e.getValue());
                total += e.getValue();
            }
            saida.put("permitido", ligado);
            saida.put("total", total);
            saida.put("apps", apps);
        } catch (Exception e) { /* JSON simples, não falha */ }
        return saida.toString();
    }
}
