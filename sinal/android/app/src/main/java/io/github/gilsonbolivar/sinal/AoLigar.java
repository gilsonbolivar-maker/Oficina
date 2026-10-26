package io.github.gilsonbolivar.sinal;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Celular ligou de novo: volta a escutar, se estava escutando. */
public class AoLigar extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(i.getAction())) return;
        if (!EscutaService.prefs(c).getBoolean("escutar", false)) return;
        try { EscutaService.iniciar(c, EscutaService.ACAO_ATUALIZAR); } catch (Exception e) { /* o sistema não deixou */ }
    }
}
