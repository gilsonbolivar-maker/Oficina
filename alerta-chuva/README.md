# Alerta de Chuva

PWA que avisa quando a previsão mostra chuva chegando no local escolhido —
som, vibração, tela azul e notificação.

Página estática em HTML, CSS e JavaScript puros — sem build, sem dependências,
sem servidor, sem chave de API. A previsão vem do [Open-Meteo](https://open-meteo.com/).

## Como usar

1. Toque em **Minha localização** (GPS) ou em **Buscar cidade**.
2. Em **Ajustes**, escolha o prazo (1 a 6 h) e a chance mínima (20 a 90%).
3. Toque em **Ligar alerta** e deixe o app aberto.

## Como decide

| Trecho | Fonte | Conta como chuva |
|---|---|---|
| Agora | `current.precipitation` | qualquer valor acima de 0 |
| Próximas 2 h | `minutely_15.precipitation` | ≥ 0,2 mm em 15 min |
| Resto do prazo | `hourly.precipitation_probability` | chance ≥ limite **e** mm > 0 |

Consulta a cada 10 minutos e ao voltar para o app. Avisa **uma vez por chuva**:
só toca de novo depois que a previsão ficar seca.

## Limites

- **Deixe o app aberto.** Um site não roda em segundo plano. No Android, com o app
  instalado pelo Chrome, o service worker usa *Periodic Background Sync* para
  conferir de vez em quando (no mínimo a cada 30 min, quando o sistema quiser) e
  mostra só a notificação.
- **iPhone/iPad:** notificação só com o app adicionado à Tela de Início; sem
  vibração. O som toca por `<audio>`, então sai mesmo no modo silencioso, mas o
  volume de mídia precisa estar alto.
- Previsão é previsão: pancada isolada de verão às vezes escapa.

## Estrutura

```
index.html            tela única: local, previsão, barras por hora, ajustes e alerta
app.css               estilos (tema escuro e claro)
app.js                local, ajustes, consultas, disparo e som
previsao.js           Open-Meteo, regra de decisão e estado compartilhado com o SW
sw.js                 app offline e conferência em segundo plano (Android)
manifest.webmanifest  dados de instalação do PWA
icones/               ícones 180, 192, 512 e maskable
```

## Créditos

Dados de tempo e busca de cidades por [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
