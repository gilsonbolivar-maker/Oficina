# Câmera Medida

Câmera que **lança linhas** sobre o objeto para avaliar **dimensão** e **distância**.
Funciona sem internet; nenhuma foto sai do aparelho.

- Publicado em: <https://gilsonbolivar-maker.github.io/Oficina/camera-medida/>

## Como funciona

```
 Câmera ao vivo ── grade (perspectiva / quadriculado / nenhuma) + mira + nível
      │ fotografar (ou Foto da galeria)
      ▼
 Foto congelada
   1 · Referência  → linha sobre algo de tamanho conhecido = escala (cm/pixel)
   2 · Linha       → comprimento
   3 · Retângulo   → largura × altura e área
   Salvar foto     → a imagem com as linhas e as medidas
```

| Conta | Fórmula |
|---|---|
| Escala | tamanho da referência ÷ pixels da linha de referência |
| Medida | pixels × escala |
| Distância até a câmera | referência × (metade do lado maior da foto) ÷ (pixels da referência × tan(ângulo de visão ÷ 2)) |

Referências prontas: cartão (8,56 cm), folha A4 (29,7 / 21 cm), moeda de R$ 1 (2,7 cm)
ou um tamanho digitado. O ângulo de visão (padrão 67°) fica em ⚙ Ajustes.

## Limites

- O navegador **não lê o LiDAR**. A medida vale para o que está **no mesmo plano** da
  referência, fotografado **de frente** (o nível ajuda). Objeto inclinado ou mais longe
  que a referência dá número errado.
- A distância é estimativa: depende do ângulo de visão da lente.
- No iPhone/iPad com LiDAR, o app **Medida** da Apple mede com o sensor de profundidade.

Tema **Escuro** / **Claro** em ⚙ Ajustes (o visor continua escuro).
