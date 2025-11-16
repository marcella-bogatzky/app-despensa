// Aguarda a página HTML carregar completamente antes de rodar o script
document.addEventListener("DOMContentLoaded", () => {

    // --- CONFIGURAÇÃO ---
    
    // URL gerada no Google Apps Script
    const appsScriptUrl = "https://script.google.com/macros/s/AKfycbzMUsAasaYX8a0XKL_hGzPKIQC7Ub_Ep56vGtMGF_FjJPOpE5HPbwdOTBzRwgL3nvZQxg/exec"; 


    // --- VARIÁVEIS DE ESTADO ---
    
    let currentMode = "add";    // "add" ou "remove"
    let isSending = false;      // "Trava" para evitar scans duplicados
    let messageTimer;           // Usado para limpar mensagens de status
    
    // --- REFERÊNCIAS AOS ELEMENTOS HTML ---
    
    const modoBtn = document.getElementById("modo-btn");
    const statusMsg = document.getElementById("status-msg");

    // Referência do campo de senha
    const passwordInput = document.getElementById("secret-password-input");


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


    // --- LÓGICA DE COMUNICAÇÃO (FETCH) ---

    // Função que "conversa" com a planilha do Google
    async function sendDataToSheet(codigoLido) {
    
        // 1. Mostra feedback imediato
        statusMsg.textContent = "Enviando dados...";

        // Feedback utilizando as classes de CSS
        statusMsg.classList.remove('success', 'error');
        
        // 2. Prepara os dados para enviar (código, modo e senha)
        const payload = {
            codigo: codigoLido,
            modo: currentMode,
            senha: passwordInput.value
        };

        // 3. Bloco try/catch para lidar com erros de rede
        try {
            // 4. Envia os dados para a URL do Google
            const response = await fetch(appsScriptUrl, {
                method: "POST",
                body: JSON.stringify(payload),
                headers: {
                    "Content-Type": "text/plain;charset=utf-8" 
                },
                // O 'redirect' é necessário para o Apps Script
                redirect: "follow" 
            });

            // 5. Pega a resposta do Google (JSON no Apps Script)
            const result = await response.json();

            // 6. Mostra a mensagem de sucesso ou retorno de "Senha incorreta."
            if (result.status === "success") {
                showStatusMessage(`✅ ${result.message} (Total: ${result.novaQuantidade})`, false);
            } else {
                showStatusMessage(`❌ Erro: ${result.message}`, true);
            }

        } catch (error) {
            // 7. Mostra uma mensagem de erro de rede
            console.error("Erro ao enviar 'fetch':", error);
            showStatusMessage("❌ Erro de conexão com a planilha.", true);
        } finally {
            // 8. "Destrava" o scanner para permitir o próximo scan
            // Depois de 1.5 segundos para evitar scans múltiplos
            setTimeout(() => {
                isSending = false;
                // Limpa a mensagem se não houver mais scans
                if (!isSending) {
                    showStatusMessage("Aponte para um código de barras");
                }
            }, 1500);
        }
    }


    // --- FUNÇÃO DE FEEDBACK ---
    
    // Atualizada para usar as classes de CSS do novo layout
    function showStatusMessage(message, isError = false) {
        clearTimeout(messageTimer);
        
        statusMsg.textContent = message;
        statusMsg.classList.remove('success', 'error'); // Limpa classes
        if (isError) {
            statusMsg.classList.add('error');
        } else {
            statusMsg.classList.add('success');
        }

        messageTimer = setTimeout(() => {
            if (!isSending) { 
                statusMsg.textContent = "Aponte para um código de barras";
                statusMsg.classList.remove('success', 'error');
            }
        }, 5000);
    }


    // --- LÓGICA DO SCANNER ---

    // Limpa a mensagem se não houver mais scans
    function onScanSuccess(codigoLido, decodedResult) {
        // Se já estamos enviando um item, ignore este scan
        if (isSending) {
            return;
        }

        // 1. "Trava" o scanner para evitar scans duplicados
        isSending = true;
        
        // 2. Vibra o celular para dar feedback
        if (navigator.vibrate) {
            navigator.vibrate(100);  // Vibra por 100ms
        }

        // 3. Chama a função que envia os dados para a planilha
        sendDataToSheet(codigoLido);
    }

    // Função chamada se o scan falhar (apenas ignoramos)
    function onScanFailure(error) {
        // console.warn(`Scan falhou: ${error}`);
    }

    // --- INICIALIZAÇÃO ---

    // Cria uma nova instância do leitor de código de barras
    const html5QrcodeScanner = new Html5QrcodeScanner(
        "leitor", // ID da <div> no HTML
        {
            fps: 10, // Frames por segundo
            qrbox: { width: 250, height: 250 }, // Tamanho da "caixa" de scan
            rememberLastUsedCamera: true // Tamanho da "caixa" de scan
        },
        false // 'false' para verbosidade
    );

    // 'false' para verbosidade
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
    showStatusMessage("Scanner iniciado. Pronto!");

});