# SINAL e PAINEL

Dois apps que se chamam com **alarme em tela cheia** (som, vibração e o recado).

| App | Endereço | Quem usa |
|---|---|---|
| **PAINEL** | `/Oficina/sinal-painel/` | Você: chama uma pessoa por vez e recebe de todas |
| **SINAL** | `/Oficina/sinal/` | Cada pessoa: recebe do PAINEL e responde só para ele |

O código é um só (`sinal/app.js`, que o PAINEL carrega de `../sinal/`); o `data-role` do `<body>` diz qual papel.
As pastas são separadas (e não uma dentro da outra) para o Android instalar os dois sem confundir.

## Como usar

1. No PAINEL: escreva seu nome, **Ligar e escutar**, e em *Nova pessoa* escreva o nome e
   toque em **Adicionar e mandar convite**.
2. Mande o convite por mensagem. Ele traz primeiro o link para **instalar o SINAL** (o link já leva o
   convite junto) e depois o código para colar, se precisar. A pessoa instala, escreve o nome e toca em **Entrar**
   e **Ligar e escutar**.
3. Escolha a pessoa, escreva o cartão (opcional) e toque num dos quatro toques.
   Embaixo aparece **Enviando… → Chegou ✓ → viu ✓✓** — ou **Não chegou**.

Deixe o app aberto e a tela acesa: com o celular bloqueado, o navegador não toca.

## Como a mensagem viaja

```
PAINEL ──cifrada──► broker.hivemq.com ─┐
       ──cifrada──► broker.emqx.io ────┴──► SINAL  (fica com a 1ª que chegar)
       ◄──────────── "chegou" / "viu" ─────────┘
```

- **Cifra**: cada pessoa tem uma chave de 26 letras (130 bits) só dela com o PAINEL, que vai
  no convite. AES-GCM com chave derivada por HKDF. O servidor vê só texto embaralhado.
- **Tópico**: também sai da chave (hash) — o servidor não vê nome, código nem recado.
- **Alarme falso**: o que não abre com a chave é descartado. Mensagem com mais de 15 min
  e repetição do mesmo pacote também.
- **Dois servidores ao mesmo tempo**: publica e escuta nos dois; basta um funcionar.
- **Confirmação**: quem recebe responde "chegou" na hora e "viu" ao tocar em Entendi.
  Sem "chegou", repete a cada 4 s, até 4 vezes, e então avisa que não chegou.

O convite pelo link usa `#c=…`: o que vem depois do `#` não vai ao servidor do site, e o app
limpa da barra de endereço assim que lê.

## Testes

Com um broker MQTT local (aedes + ws) no lugar dos públicos — `window.SINAL_BROKERS` aponta
para ele. Cobertos: convite pelo link, alarme nos dois sentidos, chegou/viu, o que o servidor
enxerga, alarme falso, pacote repetido, queda de um servidor e pessoa com o app fechado.
