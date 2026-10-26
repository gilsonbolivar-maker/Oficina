package io.github.gilsonbolivar.sinal;

import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * A mesma cifra da página (sinal/app.js), para o serviço abrir e responder
 * as mensagens sozinho: chave AES-256 derivada da chave do convite por
 * HKDF-SHA256, AES-GCM com IV de 12 bytes, tópicos pelo SHA-256.
 */
final class Cifra {
    static final String PREFIXO = "app-sinal/v2/";
    private static final SecureRandom SORTE = new SecureRandom();

    private Cifra() { }

    static byte[] utf8(String s) { return s.getBytes(StandardCharsets.UTF_8); }

    private static byte[] hmac(byte[] chave, byte[] dados) throws Exception {
        Mac m = Mac.getInstance("HmacSHA256");
        m.init(new SecretKeySpec(chave, "HmacSHA256"));
        return m.doFinal(dados);
    }

    /** HKDF-SHA256 com 32 bytes de saída (um bloco), igual ao WebCrypto. */
    static SecretKey chave(String convite) throws Exception {
        byte[] prk = hmac(utf8("app-sinal/v2"), utf8(convite));
        byte[] info = utf8("aes-gcm");
        byte[] t = new byte[info.length + 1];
        System.arraycopy(info, 0, t, 0, info.length);
        t[info.length] = 1;
        return new SecretKeySpec(hmac(prk, t), "AES");
    }

    static String topico(String uso, String convite) throws Exception {
        byte[] h = MessageDigest.getInstance("SHA-256").digest(utf8(uso + "|" + convite));
        StringBuilder sb = new StringBuilder();
        for (byte b : h) sb.append(String.format("%02x", b & 255));
        return PREFIXO + sb.substring(0, 32);
    }

    /** {"iv","ct"} → a mensagem; null se não abrir com esta chave. */
    static JSONObject abrir(SecretKey chave, byte[] dados) {
        try {
            if (dados.length == 0) return null;
            JSONObject env = new JSONObject(new String(dados, StandardCharsets.UTF_8));
            byte[] iv = Base64.decode(env.getString("iv"), Base64.DEFAULT);
            byte[] ct = Base64.decode(env.getString("ct"), Base64.DEFAULT);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, chave, new GCMParameterSpec(128, iv));
            return new JSONObject(new String(c.doFinal(ct), StandardCharsets.UTF_8));
        } catch (Exception e) {
            return null;
        }
    }

    static byte[] fechar(SecretKey chave, JSONObject msg) throws Exception {
        byte[] iv = new byte[12];
        SORTE.nextBytes(iv);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, chave, new GCMParameterSpec(128, iv));
        byte[] ct = c.doFinal(utf8(msg.toString()));
        JSONObject env = new JSONObject();
        env.put("iv", Base64.encodeToString(iv, Base64.NO_WRAP));
        env.put("ct", Base64.encodeToString(ct, Base64.NO_WRAP));
        return utf8(env.toString());
    }
}
