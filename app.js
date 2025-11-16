// Aguarda a página HTML carregar completamente antes de rodar o script
document.addEventListener("DOMContentLoaded", () => {

    // --- CONFIGURAÇÃO ---
    
    // URL gerada no Google Apps Script
    const appsScriptUrl = "https://script.google.com/macros/s/AKfycbzMUsAasaYX8a0XKL_hGzPKIQC7Ub_Ep56vGtMGF_FjJPOpE5HPbwdOTBzRwgL3nvZQxg/exec"; 


    // --- VARIÁVEIS DE ESTADO ---
    
    let currentMode = "add";    // "add" ou "remove"
    let isSending = false;      // "Trava" para evitar scans/cliques duplicados
    let messageTimer;           // Usado para limpar mensagens de status
    let currentScannedCode = null; // Guarda o último código não mapeado
    
    // --- REFERÊNCIAS AOS ELEMENTOS HTML ---
    
    const modoBtn = document.getElementById("modo-btn");
    const statusMsg = document.getElementById("status-msg");

    // Referência do campo de senha
    const passwordInput = document.getElementById("secret-password-input");

    // Referências do Modal
    const mappingModal = document.getElementById("mapping-modal");
    const mappingItemList = document.getElementById("mapping-item-list");
    const mappingBarcode = document.getElementById("mapping-barcode");
    const mappingAssociateBtn = document.getElementById("mapping-associate-btn");
    const mappingCancelBtn = document.getElementById("mapping-cancel-btn");


    // --- LÓGICA DO BOTÃO DE MODO ---
    
    modoBtn.addEventListener("click", () => {
        if (currentMode === "add") {
            // Muda para o modo REMOVER
            currentMode = "remove";
            modoBtn.textContent = "REMOVER";
            modoBtn.classList.remove("add-mode");
            modoBtn.classList.add("remove-mode");
        } else {
            // Muda para o modo ADICIONAR
            currentMode = "add";
            modoBtn.textContent = "ADICIONAR";
            modoBtn.classList.remove("remove-mode");
            modoBtn.classList.add("add-mode");
        }
    });

        // --- LÓGICA DO SCANNER ---

        // Limpa a mensagem se não houver mais scans
        function onScanSuccess(codigoLido, decodedResult) {
        // Se já estamos enviando um item, ignore este scan
        if (isSending) {
            return;
        }

        isSending = true; // "Trava" o scanner para evitar scans duplicados
        currentScannedCode = codigoLido; // Armazena o código lido
        
        // 2. Vibra o celular para dar feedback
        if (navigator.vibrate) {
            navigator.vibrate(100);  // Vibra por 100ms
        }

        // Chama a função principal que tenta adicionar/remover
        sendScanData(codigoLido);
    }

    // Função chamada se o scan falhar (apenas ignora a falha)
    function onScanFailure(error) {
        // console.warn(`Scan falhou: ${error}`);
    }

    // --- LÓGICA DE COMUNICAÇÃO (FETCH) ---

    // Função chamada pelo SCANNER ("conversa" com a planilha do Google)
    async function sendScanData(codigoLido) {
    
        // 1. Mostra feedback imediato
        showStatusMessage("Enviando dados...", false);
        
        // 2. Prepara os dados para enviar (código, modo e senha)
        const payload = {
            codigo: codigoLido,
            modo: currentMode,
            senha: passwordInput.value
        };

        // 3. Bloco try para lidar os possíveis retornos
        try {
            const result = await sendRequest(payload);

            if (result.status === "success") {
                // Cenário A: Sucesso!
                showStatusMessage(`✅ ${result.item} ${currentMode === 'add' ? 'adicionado' : 'removido'} (Total: ${result.novaQuantidade})`, false);
                resetSendingLock(); // Destrava
            
            } else if (result.status === "not_mapped") {
                // Cenário B: Item não conhecido!
                showStatusMessage("❓ Item não reconhecido. Mapear...", true);
                // Chama a função que abre o pop-up
                await showMappingModal(codigoLido);
                // O 'isSending' continua 'true' até o usuário fechar o modal
            
            } else {
                // Outros erros (ex: Senha incorreta)
                throw new Error(result.message || "Erro desconhecido.");
            }

        } catch (error) {
            console.error("Erro em sendScanData:", error);
            showStatusMessage(`❌ Erro: ${error.message}`, true);
            resetSendingLock(); // Destrava em caso de erro
        }
    }

    // 2. Função chamada pelo MODAL (Modo: "map")
    async function sendMappingData() {
        
        const itemGenerico = mappingItemList.value;
        const codigoLido = currentScannedCode;

        if (!itemGenerico) {
            alert("Por favor, selecione um item da lista.");
            return;
        }

        showStatusMessage("Mapeando e adicionando...", false);
        hideMappingModal(); // Esconde o modal imediatamente

        const payload = {
            codigo: codigoLido,
            modo: "map",
            itemGenerico: itemGenerico,
            senha: passwordInput.value
        };
        try {
            const result = await sendRequest(payload);

            if (result.status === "success") {
                showStatusMessage(`✅ ${result.item} mapeado e adicionado! (Total: ${result.novaQuantidade})`, false);
            } else {
                throw new Error(result.message || "Erro ao mapear.");
            }

        } catch (error) {
            // 7. Mostra uma mensagem de erro de rede
            console.error("Erro em sendMappingData:", error);
            showStatusMessage(`❌ Erro: ${error.message}`, true);
        } finally {
            resetSendingLock(); // Destrava o scanner
        }
    }

    // 3. Função chamada pelo MODAL (Modo: "getItens")
    async function fetchEstoqueItens() {
        
        mappingItemList.innerHTML = '<option value="">Carregando...</option>'; // Limpa e avisa
        
        const payload = {
            modo: "getItens",
            senha: passwordInput.value
        };
        
        try {
            const result = await sendRequest(payload);
            
            if (result.status === "success" && result.itens) {
                mappingItemList.innerHTML = ''; // Limpa "Carregando"
                
                if (result.itens.length === 0) {
                     mappingItemList.innerHTML = '<option value="">Nenhum item no estoque</option>';
                     return;
                }

                // Adiciona uma opção vazia
                mappingItemList.appendChild(new Option("Selecione uma categoria...", ""));
                // Preenche a lista 
                result.itens.forEach(item => {
                    mappingItemList.appendChild(new Option(item, item));
                });

            } else {
                throw new Error(result.message || "Não foi possível carregar itens.");
            }
        } catch (error) {
            console.error("Erro em fetchEstoqueItens:", error);
            mappingItemList.innerHTML = `<option value="">Erro ao carregar</option>`;
            showStatusMessage(`❌ ${error.message}`, true);
            // Se falhar em buscar itens, destrava o scanner para tentar de novo
            resetSendingLock();
            hideMappingModal();
        }
    }

    // 4. Função GENÉRICA que envia a requisição
    async function sendRequest(payload) {
        const response = await fetch(appsScriptUrl, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            redirect: "follow" 
        });
        
        if (!response.ok) {
            throw new Error(`Erro de rede: ${response.statusText}`);
        }
        
        return await response.json();
    }

    // --- LÓGICA DO MODAL DE MAPEAMENTO ---

    async function showMappingModal(codigoLido) {
        mappingBarcode.textContent = codigoLido;
        mappingModal.style.display = "flex"; // Mostra o modal
        
        // Busca a lista de itens da planilha
        await fetchEstoqueItens(); 
    }

    function hideMappingModal() {
        mappingModal.style.display = "none";
    }

    // Botão "Associar" do modal
    mappingAssociateBtn.addEventListener("click", () => {
        sendMappingData();
    });

    // Botão "Cancelar" do modal
    mappingCancelBtn.addEventListener("click", () => {
        hideMappingModal();
        resetSendingLock(); // Destrava o scanner
        showStatusMessage("Scan cancelado. Aponte para um código.", true);
    });


    // --- FUNÇÕES AUXILIARES ---
    
    // Atualiza a mensagem de status
    function showStatusMessage(message, isError = false) {
        clearTimeout(messageTimer);
        
        statusMsg.textContent = message;
        statusMsg.classList.remove('success', 'error'); 
        if (isError) {
            statusMsg.classList.add('error');
        } else if (message) { // Não adiciona 'success' para mensagens neutras
             statusMsg.classList.add('success');
        }

        // Limpa a mensagem após 5 segundos
        messageTimer = setTimeout(() => {
            if (!isSending) { 
                statusMsg.textContent = "Aponte para um código de barras";
                statusMsg.classList.remove('success', 'error');
            }
        }, 5000);
    }
    
    // Destrava o scanner após um pequeno atraso
    function resetSendingLock(delay = 1000) {
        setTimeout(() => {
            isSending = false;
            currentScannedCode = null;
            // Limpa a mensagem se não houver mais scans pendentes
            if (!isSending) {
                showStatusMessage("Aponte para um código de barras");
            }
        }, delay);
    }

    // --- INICIALIZAÇÃO DO SCANNER ---
    // Cria uma nova instância do leitor de código de barras
    const html5QrcodeScanner = new Html5QrcodeScanner(
        "leitor", // ID da <div> no HTML
        {
            fps: 10, // Frames por segundo
            qrbox: { width: 250, height: 250 }, // Tamanho da "caixa" de scan
            rememberLastUsedCamera: true // Lembra a última câmera usada 
        },
        false // verbosidade
    );

    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
    showStatusMessage("Scanner iniciado. Pronto!");

});