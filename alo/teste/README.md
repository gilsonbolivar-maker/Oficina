# Testes do Alô

Abrem o app num Chromium de verdade e conferem 38 comportamentos: entrada,
envio, tempo real, não lidas, troca de apelido, telefone e — o mais
importante — que o HTML escrito por outra pessoa aparece como texto, nunca
como marcação.

Não precisam de projeto no Supabase: `mock-supabase.js` responde no lugar
dele, o que também deixa testar os casos ruins (apelido repetido, banco
recusando a mensagem) sem depender da rede.

```sh
cd alo/teste
npm install playwright
npx playwright install chromium   # só na primeira vez
node teste.mjs
```

Se o Chromium já estiver instalado em outro lugar:

```sh
CHROME=/caminho/do/chrome node teste.mjs
```

Ao terminar, sobram `mesa.png` e `telefone.png` com a aparência nos dois
tamanhos.
