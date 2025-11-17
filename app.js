/**
 * =================================================================
 * app.js - Lógica Principal do Gerenciador de Despensa PWA
 * =================================================================
 * Este script controla:
 * 1. A navegação por abas (Scanner e Lista).
 * 2. A inicialização e o controle da câmera (via Html5QrcodeScanner).
 * 3. A comunicação com o backend (Google Apps Script) para:
 * - Adicionar/Remover itens (sendScanData)
 * - Mapear novos códigos (sendMappingData)
 * - Buscar a lista de itens (fetchEstoqueItens)
 * - Sincronizar com o Notion (handleSyncNotionClick)
 * 4. A lógica do modal de mapeamento.
 * 5. A lógica de instalação do PWA.
 */

// Aguarda a página HTML carregar completamente antes de rodar o script
document.addEventListener("DOMContentLoaded", () => {

    // --- CONFIGURAÇÃO ---

    // ! IMPORTANTE: PONTO DE CONFIGURAÇÃO !
    // Cole aqui a URL de implantação (Deploy) do seu script do Backend.
    // O Backend deste projeto foi gerado através do Google App Script.
    const appsScriptUrl = "https://script.google.com/macros/s/AKfycbzMUsAasaYX8a0XKL_hGzPKIQC7Ub_Ep56vGtMGF_FjJPOpE5HPbwdOTBzRwgL3nvZQxg/exec"; 

    // --- VARIÁVEIS DE ESTADO ---
    // Guardam o estado atual da aplicação (em que modo estamos, se uma requisição está em andamento, etc.)
    
    let currentMode = "add"; // "add" ou "remove"
    let isSending = false; // "Trava" para evitar envios duplicados enquanto um está em andamento
    let messageTimer; // Referência para o timer da mensagem de status (para poder cancelá-lo)
    let currentScannedCode = null; // Armazena o último código lido (usado pelo modal de mapeamento)
    let currentActiveTab = "scanner"; // "scanner" ou "lista"
    let html5QrcodeScanner; // A instância da biblioteca do scanner
    let isScannerInitialized = false; // Controla se o .render() da câmera está ativo
    let installPromptEvent = null; // Armazena o evento de instalação do PWA para ser disparado depois

    // --- REFERÊNCIAS AOS ELEMENTOS HTML ---
    // Pega referências dos elementos do DOM para acesso rápido
    
    // Aba Scanner
    const modoBtn = document.getElementById("modo-btn");
    const statusMsg = document.getElementById("status-msg");

    // Senha (Global)
    const passwordInput = document.getElementById("secret-password-input");

    // Modal de Mapeamento
    const mappingModal = document.getElementById("mapping-modal");
    const mappingItemList = document.getElementById("mapping-item-list");
    const mappingBarcode = document.getElementById("mapping-barcode");
    const mappingAssociateBtn = document.getElementById("mapping-associate-btn");
    const mappingCancelBtn = document.getElementById("mapping-cancel-btn");

    // Navegação e Abas
    const navScanner = document.getElementById("nav-scanner");
    const navLista = document.getElementById("nav-lista");
    const secaoScanner = document.getElementById("secao-scanner");
    const secaoLista = document.getElementById("secao-lista");

    // Aba Lista de Compras
    const btnSincronizarNotion = document.getElementById("btn-sincronizar-notion");
    const btnInstalarPWA = document.getElementById("btn-instalar-pwa");

    // --- LÓGICA DE CRIAÇÃO DO SCANNER ---
    // A instância do scanner é criada UMA VEZ quando a página carrega.
    // Isso é mais eficiente. As funções .render() (para ligar a câmera) e .clear() (para desligar)
    // serão chamadas ao trocar de aba, na função showTab().
    html5QrcodeScanner = new Html5QrcodeScanner(
        "leitor", // ID da <div> no HTML onde o scanner será renderizado
        {
            fps: 10, // Frames por segundo para o scan
            qrbox: { width: 250, height: 250 }, // Tamanho da caixa de scan
            rememberLastUsedCamera: true // Lembra a câmera usada (frontal/traseira)
        },
        false // 'verbose' (logs detalhados da biblioteca) = false
    );

    // --- LÓGICA DE NAVEGAÇÃO POR ABAS ---

    /**
     * Função central que controla a exibição das abas ("Scanner" e "Lista").
     * Também gerencia o estado da câmera (ligando e desligando).
     * @param {string} tabName - O nome da aba para exibir ("scanner" ou "lista")
     */
    function showTab(tabName) {
        currentActiveTab = tabName;

        if (tabName === "scanner") {
            // Mostra a seção do scanner
            secaoScanner.classList.remove("hidden");
            secaoLista.classList.add("hidden");
            navScanner.classList.add("active"); // Ativa o botão da aba
            navLista.classList.remove("active");
            showStatusMessage("Aponte para um código de barras");

            // Inicia a câmera do scanner
            // Só chama .render() se ainda não estiver inicializado
            if (!isScannerInitialized) {
                // .render() liga a câmera e define as funções de callback
                html5QrcodeScanner.render(onScanSuccess, onScanFailure);
                isScannerInitialized = true;
            }

        } else if (tabName === "lista") {
            // Mostra a seção da lista
            secaoScanner.classList.add("hidden");
            secaoLista.classList.remove("hidden");
            navScanner.classList.remove("active");
            navLista.classList.add("active"); // Ativa o botão da aba
            showStatusMessage("Pronta para organizar a lista! ✨");

            // Para a câmera do scanner para economizar bateria/recursos
            if (isScannerInitialized) {
                // .clear() desliga a câmera e remove o visor
                html5QrcodeScanner.clear().then(() => {
                    isScannerInitialized = false;
                    console.log("Scanner parado com sucesso.");
                }).catch(err => {
                    console.error("Falha ao parar o scanner.", err);
                    // Força o estado para falso para tentar renderizar da próxima vez
                    isScannerInitialized = false; 
                });
            }
        }
    }

    // Adiciona os eventos de clique nos botões de navegação
    navScanner.addEventListener("click", () => showTab("scanner"));
    navLista.addEventListener("click", () => showTab("lista"));


    // --- LÓGICA DO BOTÃO DE MODO (Aba Scanner) ---
    // Alterna entre os modos "ADICIONAR" e "REMOVER"
    modoBtn.addEventListener("click", () => {
        if (currentMode === "add") {
            currentMode = "remove";
            modoBtn.textContent = "REMOVER";
            modoBtn.classList.remove("add-mode");
            modoBtn.classList.add("remove-mode");
        } else {
            currentMode = "add";
            modoBtn.textContent = "ADICIONAR";
            modoBtn.classList.remove("remove-mode");
            modoBtn.classList.add("add-mode");
        }
    });

    // --- LÓGICA DO SCANNER ---

    /**
     * Callback chamado pela biblioteca html5-qrcode quando um código é lido com sucesso.
     * @param {string} codigoLido - O código de barras lido.
     * @param {object} decodedResult - Objeto com detalhes do scan (não utilizado aqui).
     */
    function onScanSuccess(codigoLido, decodedResult) {
        // Ignora scans se já estiver enviando ou se o usuário trocou de aba
        if (isSending || currentActiveTab !== 'scanner') {
            return;
        }
        isSending = true; // Ativa a "trava"
        currentScannedCode = codigoLido; // Salva o código (usado se o modal abrir)
        
        // Vibra o dispositivo para dar feedback tátil
        if (navigator.vibrate) {
            navigator.vibrate(100);
        }
        
        // Envia os dados para o backend
        sendScanData(codigoLido);
    }

    /**
     * Callback chamado pela biblioteca quando um scan falha (ex: imagem borrada).
     * Apenas ignora e permite que a biblioteca tente novamente.
     */
    function onScanFailure(error) {
        // Apenas ignora falhas de scan (ex: código não focado)
    }

    // --- LÓGICA DE COMUNICAÇÃO (FETCH) ---
    // Contém todas as funções que se comunicam com o Google Apps Script (Backend).

    /**
     * 1. Função chamada pelo SCANNER (Modo: "add" / "remove")
     * Envia o código lido e o modo atual para a planilha.
     */
    async function sendScanData(codigoLido) {
        // Mostra o ícone de espera giratório
        showStatusMessage("<span class='spinning-peach'>🍑</span> Enviando dados...", false);
        
        // Monta o "payload" (carga de dados) para enviar ao Apps Script
        const payload = {
            codigo: codigoLido,
            modo: currentMode,
            senha: passwordInput.value // Pega a senha do input
        };

        try {
            // Envia a requisição e aguarda a resposta
            const result = await sendRequest(payload);
            
            if (result.status === "success") {
                // Sucesso: item encontrado e atualizado
                showStatusMessage(`Atualizado! 🍑 (Total: ${result.novaQuantidade})`, false);
                resetSendingLock(); // Libera a trava
            } else if (result.status === "not_mapped") {
                // Item não encontrado: precisa mapear
                showStatusMessage("❓ Item não reconhecido. Mapear...", true);
                await showMappingModal(codigoLido); // Abre o modal
            } else {
                // Outro erro vindo do backend (ex: senha errada)
                throw new Error(result.message || "Erro desconhecido.");
            }
        } catch (error) {
            // Erro de rede ou na lógica acima
            console.error("Erro em sendScanData:", error);
            showStatusMessage(`❌ Erro: ${error.message}`, true);
            resetSendingLock();
        }
    }

    /**
     * 2. Função chamada pelo MODAL (Modo: "map")
     * Associa um código de barras novo a um item genérico da lista.
     */
    async function sendMappingData() {
        const itemGenerico = mappingItemList.value; // Pega o item selecionado no dropdown
        
        // Validação simples
        if (!itemGenerico) {
            alert("Por favor, selecione um item da lista para associar.");
            return;
        }

        // Mostra o ícone giratório
        showStatusMessage("<span class='spinning-peach'>🍑</span> Mapeando e adicionando...", false);
        hideMappingModal(); // Fecha o modal

        // Monta o payload com o modo "map"
        const payload = {
            codigo: currentScannedCode, // Pega o código salvo no onScanSuccess
            itemGenerico: itemGenerico,
            modo: "map", // Modo especial de mapeamento
            senha: passwordInput.value
        };

        try {
            const result = await sendRequest(payload);
            if (result.status === "success") {
                // Sucesso: item mapeado e adicionado
                showStatusMessage(`Guardado! 🍑 (Total: ${result.novaQuantidade})`, false);
            } else {
                throw new Error(result.message || "Erro ao mapear.");
            }
        } catch (error) {
            console.error("Erro em sendMappingData:", error);
            showStatusMessage(`❌ Erro: ${error.message}`, true);
        } finally {
            // Libera a trava, independentemente de sucesso ou falha
            resetSendingLock();
        }
    }

    /**
     * 3. Função chamada pelo MODAL (Modo: "getItens")
     * Busca a lista de itens genéricos (da aba 'Estoque') para preencher o dropdown.
     */
    async function fetchEstoqueItens() {
        // Mostra o ícone no dropdown enquanto carrega
        mappingItemList.innerHTML = '<option value="">🍑 Carregando...</option>';
        
        // Monta o payload com o modo "getItens"
        const payload = { 
            modo: "getItens",
            senha: passwordInput.value
        };
        
        try {
            const result = await sendRequest(payload);
            
            if (result.status === "success" && result.itens) {
                mappingItemList.innerHTML = ''; // Limpa o "Carregando..."
                
                if (result.itens.length === 0) {
                     mappingItemList.innerHTML = '<option value="">Nenhum item no estoque</option>';
                     return;
                }
                
                // Preenche o <select> (dropdown) com os itens recebidos
                mappingItemList.appendChild(new Option("Selecione uma categoria...", "")); // Opção padrão
                result.itens.forEach(item => {
                    mappingItemList.appendChild(new Option(item, item)); // Adiciona cada item
                });
            } else {
                throw new Error(result.message || "Não foi possível carregar itens.");
            }
        } catch (error) {
            console.error("Erro em fetchEstoqueItens:", error);
            mappingItemList.innerHTML = `<option value="">Erro ao carregar</option>`;
            showStatusMessage(`❌ ${error.message}`, true);
            resetSendingLock();
            hideMappingModal(); // Fecha o modal se a lista falhar
        }
    }

    /**
     * 4. Função chamada pela ABA LISTA (Modo: "syncNotion")
     * Aciona a sincronização da lista de compras (Planilha -> Página da Lista de Compras).
     */
    async function handleSyncNotionClick() {
        if (isSending) return; // Evita cliques duplos
        
        isSending = true;
        // Mostra o ícone giratório
        showStatusMessage("<span class='spinning-peach'>🍑</span> Sincronizando com o Notion...", false);

        const payload = {
            modo: "syncNotion",
            senha: passwordInput.value
        };

        try {
            const result = await sendRequest(payload);
            if (result.status === "success") {
                showStatusMessage(`✅ ${result.message}`, false);
            } else {
                throw new Error(result.message || "Erro ao sincronizar.");
            }
        } catch (error) {
            console.error("Erro em handleSyncNotionClick:", error);
            showStatusMessage(`❌ Erro: ${error.message}`, true);
        } finally {
            resetSendingLock(1000); // Libera a trava com um pequeno delay
        }
    }

    // Adiciona o evento ao botão de Sincronizar
    btnSincronizarNotion.addEventListener("click", handleSyncNotionClick);
    
    // Adiciona o evento ao botão de Instalar PWA
    btnInstalarPWA.addEventListener("click", async () => {
        // Verifica se o evento de instalação foi salvo
        if (!installPromptEvent) {
            alert("Não é possível instalar o app neste momento.");
            return;
        }
        // Mostra o prompt de instalação nativo do navegador
        installPromptEvent.prompt();
        // Aguarda a escolha do usuário
        const { outcome } = await installPromptEvent.userChoice;
        if (outcome === 'accepted') {
            console.log('Usuário aceitou a instalação');
            btnInstalarPWA.style.display = 'none'; // Esconde o botão após instalar
        } else {
            console.log('Usuário recusou a instalação');
        }
        installPromptEvent = null; // O evento só pode ser usado uma vez
    });


    /**
     * 5. Função GENÉRICA que envia a requisição
     * Todas as funções de comunicação (1-4) usam esta função central.
     * @param {object} payload - O objeto de dados a ser enviado como JSON.
     * @returns {Promise<object>} - A resposta JSON do Apps Script.
     */
    async function sendRequest(payload) {
        // Envia a requisição para a URL configurada
        const response = await fetch(appsScriptUrl, {
            method: "POST",
            // O Apps Script espera "text/plain" quando recebe um JSON stringificado
            body: JSON.stringify(payload),
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            redirect: "follow" // Permite que o Apps Script redirecione
        });
        
        if (!response.ok) {
            // Trata erros de rede (ex: 404, 500)
            throw new Error(`Erro de rede: ${response.statusText}`);
        }
        
        // Converte a resposta de texto JSON para um objeto JavaScript
        return await response.json();
    }

    // --- LÓGICA DO MODAL DE MAPEAMENTO ---

    /**
     * Exibe o modal de mapeamento.
     * @param {string} codigoLido - O código que precisa ser mapeado.
     */
    async function showMappingModal(codigoLido) {
        mappingBarcode.textContent = codigoLido; // Mostra o código no modal
        mappingModal.style.display = "flex"; // Exibe o modal
        await fetchEstoqueItens(); // Busca a lista de itens para o dropdown
    }

    /** Oculta o modal de mapeamento. */
    function hideMappingModal() {
        mappingModal.style.display = "none";
    }

    // Evento do botão "Associar" (chama a função de mapeamento)
    mappingAssociateBtn.addEventListener("click", () => {
        sendMappingData();
    });

    // Evento do botão "Cancelar"
    mappingCancelBtn.addEventListener("click", () => {
        hideMappingModal();
        resetSendingLock(); // Libera a trava
        showStatusMessage("Scan cancelado. Aponte para um código.", true);
    });


    // --- FUNÇÕES AUXILIARES ---
    // Funções de utilidade usadas em múltiplos locais.
    
    /**
     * Exibe uma mensagem na área de status (#status-msg).
     * Usa .innerHTML para permitir a animação do ícone (<span>).
     * @param {string} message - A mensagem (pode conter HTML).
     * @param {boolean} isError - Aplica o estilo de erro?
     */
    function showStatusMessage(message, isError = false) {
        clearTimeout(messageTimer); // Cancela qualquer timer anterior
        
        statusMsg.innerHTML = message; // Usa .innerHTML para o pêssego
        statusMsg.classList.remove('success', 'error'); 
        
        if (isError) {
            statusMsg.classList.add('error');
        } else if (message.startsWith('Guardado!') || message.startsWith('✅')) {
             // Aplica estilo de sucesso para mensagens positivas
             statusMsg.classList.add('success');
        }

        // Define um timer para limpar a mensagem após 5 segundos
        messageTimer = setTimeout(() => {
            if (!isSending) { // Só limpa se não houver outra operação em andamento
                if (currentActiveTab === 'scanner') {
                    statusMsg.innerHTML = "Aponte para um código de barras";
                } else {
                    // Mensagem padrão da aba "Lista"
                    statusMsg.innerHTML = "Pronta para organizar a lista! ✨";
                }
                statusMsg.classList.remove('success', 'error');
            }
        }, 5000); // 5 segundos
    }
    
    /**
     * Libera a trava 'isSending' após um delay e reseta a mensagem de status.
     * @param {number} [delay=1000] - Tempo em milissegundos para esperar (padrão: 1s).
     */
    function resetSendingLock(delay = 1000) { 
        setTimeout(() => {
            isSending = false;
            currentScannedCode = null;
            // Reseta a mensagem de status para o padrão da aba atual
            if (currentActiveTab === 'scanner') {
                 statusMsg.innerHTML = "Aponte para um código de barras";
            } else {
                 statusMsg.innerHTML = "Pronta para organizar a lista! ✨";
            }
            statusMsg.classList.remove('success', 'error');
        }, delay);
    }

    // --- INICIALIZAÇÃO DA PÁGINA E PWA ---

    // Exibe a aba "scanner" por padrão e inicia a câmera
    showTab("scanner");

    // Listener para o evento de instalação do PWA
    // O navegador dispara isso se o site for "instalável" (tiver manifest, sw, etc.)
    window.addEventListener('beforeinstallprompt', (event) => {
        // Impede o prompt padrão do navegador
        event.preventDefault(); 
        // Salva o evento para que possamos dispará-lo manualmente pelo nosso botão
        installPromptEvent = event; 
        // Mostra nosso botão personalizado
        btnInstalarPWA.style.display = 'block';
    });

}); // Fecha o 'DOMContentLoaded'