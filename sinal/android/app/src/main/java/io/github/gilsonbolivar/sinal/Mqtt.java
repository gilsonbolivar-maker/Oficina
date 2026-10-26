package io.github.gilsonbolivar.sinal;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.List;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * MQTT 3.1.1 mínimo sobre TLS (porta 8883), numa linha de execução própria.
 * Liga, inscreve nos tópicos, entrega o que chega e religa sozinho quando cai.
 */
final class Mqtt {
    interface Ouvinte {
        void mensagem(String topico, byte[] dados);
        void estado();
    }

    private final String host;
    private final int porta;
    private final List<String> topicos;
    private final Ouvinte ouvinte;
    private volatile boolean parado = false;
    private volatile SSLSocket sock;
    private volatile OutputStream saida;
    private Thread fio;

    Mqtt(String host, int porta, List<String> topicos, Ouvinte ouvinte) {
        this.host = host;
        this.porta = porta;
        this.topicos = topicos;
        this.ouvinte = ouvinte;
    }

    void iniciar() {
        fio = new Thread(this::laco, "mqtt-" + host);
        fio.setDaemon(true);
        fio.start();
    }

    void parar() {
        parado = true;
        fecharSocket();
        if (fio != null) fio.interrupt();
    }

    boolean ligado() { return saida != null; }

    private void laco() {
        long espera = 2000;
        while (!parado) {
            try {
                SSLSocket s = (SSLSocket) SSLSocketFactory.getDefault().createSocket(host, porta);
                s.setSoTimeout(100_000);
                s.startHandshake();
                // O SSLSocket não confere o nome do servidor sozinho: confere aqui.
                if (!HttpsURLConnection.getDefaultHostnameVerifier().verify(host, s.getSession())) {
                    s.close();
                    throw new IOException("certificado não confere com " + host);
                }
                sock = s;
                InputStream in = new BufferedInputStream(s.getInputStream());
                OutputStream o = s.getOutputStream();

                ByteArrayOutputStream c = new ByteArrayOutputStream();
                str(c, "MQTT");
                c.write(4); c.write(2); c.write(0); c.write(60);   // 3.1.1, sessão limpa, 60 s
                str(c, "sinal-apk-" + aleatorio());
                o.write(pacote(0x10, c.toByteArray()));
                o.flush();

                int[] cab = new int[1];
                byte[] ack = ler(in, cab);
                if ((cab[0] >> 4) != 2 || ack.length < 2 || ack[1] != 0) throw new IOException("recusado");
                saida = o;

                if (!topicos.isEmpty()) {
                    ByteArrayOutputStream sb = new ByteArrayOutputStream();
                    sb.write(0); sb.write(1);
                    for (String t : topicos) { str(sb, t); sb.write(0); }
                    enviar(pacote(0x82, sb.toByteArray()));
                }
                espera = 2000;
                ouvinte.estado();

                while (!parado) {
                    byte[] corpo = ler(in, cab);
                    if ((cab[0] >> 4) == 3) {
                        int flags = cab[0] & 15;
                        int tl = ((corpo[0] & 255) << 8) | (corpo[1] & 255);
                        String topico = new String(corpo, 2, tl, StandardCharsets.UTF_8);
                        int ini = 2 + tl + ((((flags >> 1) & 3) > 0) ? 2 : 0);
                        ouvinte.mensagem(topico, Arrays.copyOfRange(corpo, ini, corpo.length));
                    }
                }
            } catch (Exception e) {
                // cai para religar
            }
            fecharSocket();
            ouvinte.estado();
            if (parado) break;
            try { Thread.sleep(espera); } catch (InterruptedException ie) { break; }
            espera = Math.min(espera * 2, 60_000);
        }
    }

    boolean publicar(String topico, byte[] dados, boolean reter) {
        try {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            str(b, topico);
            b.write(dados);
            return enviar(pacote(reter ? 0x31 : 0x30, b.toByteArray()));
        } catch (IOException e) {
            return false;
        }
    }

    boolean ping() { return enviar(new byte[]{(byte) 0xC0, 0}); }

    private synchronized boolean enviar(byte[] p) {
        OutputStream o = saida;
        if (o == null) return false;
        try {
            o.write(p);
            o.flush();
            return true;
        } catch (IOException e) {
            fecharSocket();
            return false;
        }
    }

    private void fecharSocket() {
        saida = null;
        try { if (sock != null) sock.close(); } catch (IOException e) { /* já fechado */ }
        sock = null;
    }

    private static byte[] ler(InputStream in, int[] cab) throws IOException {
        int b = in.read();
        if (b < 0) throw new EOFException();
        cab[0] = b;
        int mul = 1, len = 0, d;
        do {
            d = in.read();
            if (d < 0) throw new EOFException();
            len += (d & 127) * mul;
            mul *= 128;
        } while ((d & 128) != 0);
        byte[] corpo = new byte[len];
        int lido = 0;
        while (lido < len) {
            int n = in.read(corpo, lido, len - lido);
            if (n < 0) throw new EOFException();
            lido += n;
        }
        return corpo;
    }

    private static void str(ByteArrayOutputStream o, String s) {
        byte[] b = s.getBytes(StandardCharsets.UTF_8);
        o.write(b.length >> 8);
        o.write(b.length & 255);
        o.write(b, 0, b.length);
    }

    private static byte[] pacote(int primeiro, byte[] corpo) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.write(primeiro);
        int n = corpo.length;
        do {
            int d = n % 128;
            n /= 128;
            if (n > 0) d |= 128;
            o.write(d);
        } while (n > 0);
        o.write(corpo, 0, corpo.length);
        return o.toByteArray();
    }

    private static String aleatorio() {
        byte[] b = new byte[6];
        new SecureRandom().nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x & 255));
        return sb.toString();
    }
}
