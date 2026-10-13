# pdf.js 4.10.38 (build "legacy")

Cópia de `pdfjs-dist@4.10.38/legacy/build`, da Mozilla, licença Apache 2.0
(veja `LICENSE`). Fica aqui, e não num CDN, para a importação dos PDFs
funcionar sem internet — e para nenhum documento sair do aparelho.

A build "legacy" roda também em Safari mais antigo do iPad. Para atualizar:
`npm pack pdfjs-dist@<versão>` e copiar `legacy/build/pdf.min.mjs` e
`legacy/build/pdf.worker.min.mjs`.
