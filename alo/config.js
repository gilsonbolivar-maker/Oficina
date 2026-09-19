/* ————————————————————————————————————————————————————————————
   Onde fica o banco do Alô.

   Preencha os dois campos abaixo com os dados do seu projeto no
   Supabase (Project Settings → Data API). Enquanto estiverem vazios,
   o próprio app abre uma tela pedindo os dados e guarda no navegador,
   então dá para testar antes de mexer aqui.

   A chave "anon" é pública de propósito — ela não dá acesso a nada
   sozinha. Quem controla o que cada pessoa pode ler e escrever são as
   regras de RLS do supabase.sql, aplicadas pelo Postgres. Por isso ela
   pode ficar no repositório sem problema.

   A chave que NUNCA pode vir para cá é a `service_role`.
   ———————————————————————————————————————————————————————————— */
'use strict';

globalThis.ALO_CONFIG = {
  url: '',
  anonKey: ''
};
