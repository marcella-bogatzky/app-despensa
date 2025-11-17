/**
 * =================================================================
 * serviceworker.js - O PWA
 * =================================================================
 * Este script roda em segundo plano, separado da página web.
 * Ele permite que o aplicativo funcione offline ao interceptar
 * requisições de rede e responder com arquivos salvos em cache.
 *
 * Ciclo de Vida:
 * 1. install: Salva os arquivos essenciais (app shell) no cache.
 * 2. fetch: Intercepta requisições. Responde com o cache (se tiver) ou busca na rede.
 * 3. activate: Limpa caches antigos quando uma nova versão do service worker é ativada.
 */


// ! IMPORTANTE: PONTO DE CONFIGURAÇÃO E ATUALIZAÇÃO !
// Se você fizer qualquer alteração nos arquivos do app (ex: app.js ou index.html),
// você DEVE alterar o nome deste cache (ex: 'despensa-cache-v3').
// Isso força o navegador a rodar o evento 'install' novamente e
// baixar os arquivos novos, e depois o 'activate' para limpar o cache antigo (v2).
const CACHE_NAME = 'despensa-cache-v3';

// Lista de arquivos essenciais ("App Shell") que farão o app funcionar offline.
// Todos esses arquivos serão baixados durante a etapa 'install'.
const urlsToCache = [
  './', // A própria raiz do site (geralmente serve o index.html)
  './index.html', // O HTML principal
  './app.js', // O JavaScript principal
  './manifest.webmanifest', // O manifesto do PWA
  './icon-192.png', // Ícones para a tela inicial
  './icon-512.png',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js' // A biblioteca externa do scanner
];

/**
 * Evento 'install':
 * Disparado quando o Service Worker é registrado pela primeira vez
 * ou quando uma nova versão (com nome de cache diferente) é detectada.
 */
self.addEventListener('install', event => {
  console.log('Evento "install" do Service Worker... Tentando cachear:', CACHE_NAME);
  
  // event.waitUntil() espera a Promise (caches.open...) ser resolvida.
  // Isso garante que o SW só seja considerado "instalado" após
  // o cache ser aberto e os arquivos serem salvos com sucesso.
  event.waitUntil(
    caches.open(CACHE_NAME) // Abre o cache com o nome que definimos
      .then(cache => {
        console.log('Cache v2 aberto');
        // Adiciona todos os arquivos da nossa lista (urlsToCache) ao cache.
        // Se UM arquivo falhar (ex: 404), a instalação inteira falha.
        return cache.addAll(urlsToCache);
      })
  );
});

/**
 * Evento 'fetch':
 * Disparado CADA VEZ que a página faz uma requisição de rede
 * (seja para um .css, .js, uma imagem, ou um fetch() para a API).
 * Esta é a estratégia "Cache First".
 */
self.addEventListener('fetch', event => {
  
  // event.respondWith() intercepta a requisição e nos deixa "responder"
  // com nossos próprios dados (do cache ou da rede).
  event.respondWith(
    // Tenta encontrar uma resposta para a requisição no nosso cache.
    caches.match(event.request)
      .then(response => {
        
        // Se 'response' for encontrado (não for nulo), o item está no cache!
        if (response) {
          // Retorna o arquivo salvo no cache. O app carrega instantaneamente.
          console.log('Respondendo com cache para:', event.request.url);
          return response;
        }
        
        // Se 'response' for nulo, o item não está no cache.
        // Deixa a requisição continuar para a rede (internet).
        console.log('Buscando da rede (não estava em cache):', event.request.url);
        return fetch(event.request);
      }
    )
  );
});

/**
 * Evento 'activate':
 * Disparado DEPOIS do 'install' e quando o novo
 * Service Worker está pronto para assumir o controle da página.
 * É o momento ideal para limpar caches antigos.
 */
self.addEventListener('activate', event => {
  console.log('Evento "activate" do Service Worker... Limpando caches antigos.');

  // Lista de caches que queremos MANTER.
  // Apenas o cache da versão atual (definido em CACHE_NAME).
  const cacheWhitelist = [CACHE_NAME]; 
  
  event.waitUntil(
    caches.keys().then(cacheNames => { // Pega o nome de TODOS os caches.
      return Promise.all(
        // .map() cria um array de promessas de exclusão.
        cacheNames.map(cacheName => {
          // Se o nome do cache NÃO ESTÁ na nossa whitelist...
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            // ...então é um cache antigo (ex: 'despensa-cache-v1') e deve ser deletado.
            console.log('Limpando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});