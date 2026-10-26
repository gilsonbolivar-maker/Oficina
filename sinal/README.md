# SINAL e PAINEL

Dois apps que se chamam com **alarme em tela cheia** (som, vibração e o recado).

| App | Endereço | Quem usa |
|---|---|---|
| **PAINEL** | `/Oficina/sinal-painel/` | Você: chama uma pessoa por vez e recebe de todas |
| **SINAL** | `/Oficina/sinal/` | Cada pessoa: recebe do PAINEL e responde só para ele |

O código é um só (`sinal/app.js`, que o PAINEL carrega de `../sinal/`); o `data-role` do `<body>` diz qual papel.
As pastas são separadas (e não uma dentro da outra) para o Android instalar os dois sem confundir.

## Como usar

1. No PAINEL: escreva seu nome e, em *Nova pessoa* escreva o nome e
   toque em **Adicionar e mandar convite**.
2. Mande o convite por mensagem. Ele traz primeiro o link para **instalar o SINAL** (o link já leva o
   convite junto) e depois o código para colar, se precisar. A pessoa instala, escreve o nome e toca em **Entrar**
   e **Ligar e escutar**.
3. Escolha a pessoa, escreva o cartão (opcional) e toque num dos quatro toques.
   Quem recebe pode **responder na própria tela do alarme**: *Estou indo*, *Já ligo*, *Agora não posso*,
   *OK, entendi* ou um texto escrito. A resposta aparece num cartão verde para quem chamou, com um toque
   curto, e na linha de envio: *Cida respondeu: "Estou indo"*.
   Embaixo aparece **Enviando… → Chegou ✓ → viu ✓✓** — ou **Não chegou**.

### Recursos

| Recurso | Como funciona |
|---|---|
| **Quem está online** | Bolinha verde ao lado de cada pessoa (e do PAINEL, no SINAL). Cada app anuncia "estou aqui" a cada 30 s; sem notícia há 75 s, aparece *visto há X min*. |
| **Não perder mensagem** | O alarme fica **guardado no servidor** (mensagem retida do MQTT) e repete até chegar: 4 vezes rápido, depois a cada 30 s, por até 1 hora. Quem abre o app depois recebe na hora, com *mandada às HHhMM*. Ao chegar, a cópia guardada é apagada. A resposta também segue assim. |
| **Histórico** | Lista no fim da tela: enviados e recebidos, hora, *chegou / viu / resposta*. Fica só no aparelho (até 200). |
| **Anexo (até 2 MB)** | *📎 Anexar arquivo* junto do alarme, nos dois sentidos. Vai em pedaços de 32 KB, cada um cifrado; quem recebe remonta, confere o SHA-256 e responde *arquivo entregue ✓*. Faltou pedaço (sem sinal, abriu o app depois)? Pede só os que faltam — enquanto o app de quem mandou estiver aberto. Na tela do alarme: prévia de foto, **Abrir com…** e **Salvar**; os 20 últimos ficam no aparelho e abrem pelo histórico. |
| **Todos** | No PAINEL, com 2 pessoas ou mais: chama todas de uma vez e mostra pessoa por pessoa quem já recebeu, viu ou respondeu. |

**A escuta liga sozinha** ao abrir o app (a menos que você tenha tocado em *Parar de escutar*:
aí ele lembra e espera você ligar). O navegador só libera **som e vibração depois do primeiro toque**
na tela — enquanto isso, aparece o aviso *"Toque em qualquer lugar da tela para liberar o som"*.

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
  Sem "chegou", a mensagem fica guardada no servidor e repete até chegar (até 1 hora).
- **Presença**: o "estou aqui" também vai cifrado, num tópico próprio, e fica guardado no
  servidor — quem abre o app já sabe quando o outro foi visto por último.

O convite pelo link usa `#c=…`: o que vem depois do `#` não vai ao servidor do site, e o app
limpa da barra de endereço assim que lê.

## Testes

Com um broker MQTT local (aedes + ws) no lugar dos públicos — `window.SINAL_BROKERS` aponta
para ele. Cobertos: convite pelo link, alarme nos dois sentidos, chegou/viu, o que o servidor
enxerga, alarme falso, pacote repetido, queda de um servidor e pessoa com o app fechado.
