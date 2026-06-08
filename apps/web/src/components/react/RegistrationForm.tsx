import React, { useState, useEffect } from 'react';

interface Category {
  id: string;
  name: string;
  gender: string;
  availableSlots: number;
}

interface Batch {
  id: string;
  name: string;
  price: string;
  active: boolean;
}

interface RegistrationFormProps {
  eventId: string;
  eventTitle: string;
  categories: Category[];
  batches: Batch[];
}

export default function RegistrationForm({ eventId, eventTitle, categories, batches }: RegistrationFormProps) {
  const [step, setStep] = useState(1);
  
  // Passo 1: Categoria e Lote
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id || '');
  const activeBatch = batches.find(b => b.active);

  // Passo 2: Dados do Atleta
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [shirtSize, setShirtSize] = useState('M');

  // Passo 3: Cupom e Revisao
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [couponSuccess, setCouponSuccess] = useState('');

  // Estados de Carregamento e Erro
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const [registrationId, setRegistrationId] = useState('');

  // Passo 4: Pagamento PIX e Polling
  const [paymentStatus, setPaymentStatus] = useState('PENDING');
  const [pixQrCode, setPixQrCode] = useState('');
  const [pixExpiration, setPixExpiration] = useState('');
  const [amount, setAmount] = useState(0);
  const [pollingAttempts, setPollingAttempts] = useState(0);
  const [copySuccess, setCopySuccess] = useState(false);

  // Formatar preço
  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const basePrice = activeBatch ? Number(activeBatch.price) : 0;
  const finalPrice = Math.max(0, basePrice - (basePrice * (couponDiscount / 100)));

  // Obter token JWT do Clerk
  const getClerkToken = async () => {
    const clerk = (window as any).Clerk;
    if (!clerk || !clerk.session) {
      throw new Error('Sessão do Clerk não iniciada ou expirada. Faça login novamente.');
    }
    return await clerk.session.getToken();
  };

  // Validar Cupom de Desconto de forma reativa na API ou simular localmente
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setIsApplyingCoupon(true);
    setCouponError('');
    setCouponSuccess('');

    try {
      // Como o cupom é processado na criacao, podemos validar as regras basicas
      // Vamos simular um retorno baseado no cupom 'RIO10' ou 'OFF20' que cadastramos no seed
      const code = couponCode.trim().toUpperCase();
      if (code === 'RIO10') {
        setCouponDiscount(10);
        setCouponSuccess('Cupom RIO10 aplicado: 10% de desconto!');
      } else if (code === 'TRAIL20') {
        setCouponDiscount(20);
        setCouponSuccess('Cupom TRAIL20 aplicado: 20% de desconto!');
      } else {
        setCouponError('Cupom inválido ou expirado.');
        setCouponDiscount(0);
      }
    } catch (err) {
      setCouponError('Erro ao validar cupom.');
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  // Submeter a Inscricao para a API NestJS
  const handleSubmitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmissionError('');

    try {
      const token = await getClerkToken();
      
      const payload = {
        eventId,
        categoryId: selectedCategoryId,
        batchId: activeBatch?.id,
        couponCode: couponCode ? couponCode.trim().toUpperCase() : undefined,
        complementaryData: {
          cpf,
          phone,
          shirtSize,
        },
      };

      const response = await fetch('http://localhost:3001/registrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: 'Falha ao registrar' }));
        const errMsg = Array.isArray(errData.message) ? errData.message[0] : errData.message;
        throw new Error(errMsg);
      }

      const data = await response.json();
      setRegistrationId(data.id);
      
      // Inicia Passo 4 (Pagamento)
      setStep(4);
    } catch (err: any) {
      setSubmissionError(err.message || 'Erro de rede ao submeter inscrição.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Polling para acompanhar processamento da fila de reserva e geracao do PIX
  useEffect(() => {
    if (step !== 4 || !registrationId) return;

    let timer: NodeJS.Timeout;

    const pollStatus = async () => {
      try {
        const token = await getClerkToken();
        const response = await fetch(`http://localhost:3001/registrations/${registrationId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) return;

        const data = await response.json();
        
        setPaymentStatus(data.paymentStatus);
        setAmount(Number(data.amountPaid));

        // Se o pagamento for gerado (PIX) e ainda pendente, preencher dados do QR Code
        if (data.payment && data.payment.pixQrCode) {
          setPixQrCode(data.payment.pixQrCode);
          setPixExpiration(data.payment.pixExpiration);
        }

        // Se a inscricao foi confirmada/paga ou cancelada, parar o polling
        if (data.paymentStatus === 'PAID' || data.status === 'CONFIRMED') {
          setPaymentStatus('PAID');
          return;
        }

        if (data.status === 'CANCELLED' || data.status === 'EXPIRED') {
          setPaymentStatus('FAILED');
          return;
        }

        // Continuar polling a cada 3 segundos
        setPollingAttempts(prev => prev + 1);
        timer = setTimeout(pollStatus, 3000);
      } catch (err) {
        console.error('Erro no polling:', err);
        timer = setTimeout(pollStatus, 4000); // Tentar novamente um pouco mais tarde
      }
    };

    pollStatus();

    return () => clearTimeout(timer);
  }, [step, registrationId]);

  // Copiar código do PIX
  const handleCopyPix = () => {
    if (!pixQrCode) return;
    navigator.clipboard.writeText(pixQrCode);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div class="w-full bg-[#15171f] border border-zinc-800 p-6 md:p-8 relative">
      {/* Canto decorativo HUD */}
      <div class="absolute top-0 right-0 w-12 h-12 border-t border-r border-zinc-700 pointer-events-none"></div>

      {/* Barra de Progresso HUD */}
      <div class="mb-8 font-mono text-[10px] tracking-widest text-zinc-500 flex items-center justify-between border-b border-zinc-800/60 pb-4">
        <div class="flex items-center gap-6">
          <span class={step === 1 ? 'text-emerald-400 font-bold' : 'text-zinc-600'}>01 // CATEGORIA</span>
          <span class={step === 2 ? 'text-emerald-400 font-bold' : 'text-zinc-600'}>02 // DADOS ATLETA</span>
          <span class={step === 3 ? 'text-emerald-400 font-bold' : 'text-zinc-600'}>03 // REVISÃO</span>
          <span class={step === 4 ? 'text-emerald-400 font-bold' : 'text-zinc-600'}>04 // CHECKOUT</span>
        </div>
        <div class="text-zinc-400">PASSO {step} DE 4</div>
      </div>

      {submissionError && (
        <div class="bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono p-4 mb-6 uppercase flex items-center gap-2">
          <span class="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>
          {submissionError}
        </div>
      )}

      {/* ETAPA 1: SELEÇÃO DE CATEGORIA */}
      {step === 1 && (
        <div class="space-y-6">
          <div>
            <h2 class="font-heading text-xl font-bold text-white uppercase tracking-wider">{eventTitle}</h2>
            <p class="text-zinc-400 text-xs mt-1">Selecione a modalidade/categoria oficial em que deseja competir.</p>
          </div>

          <div class="space-y-3">
            {categories.map((cat) => (
              <label
                key={cat.id}
                class={`flex items-center gap-4 bg-[#0d0e12] border p-4 cursor-pointer transition-all duration-200 ${
                  selectedCategoryId === cat.id ? 'border-emerald-500/60 bg-emerald-500/[0.02]' : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  value={cat.id}
                  checked={selectedCategoryId === cat.id}
                  onChange={() => setSelectedCategoryId(cat.id)}
                  class="accent-emerald-500 w-4 h-4 bg-zinc-950 border-zinc-800"
                />
                <div class="flex-grow font-sans text-xs">
                  <div class="text-zinc-100 font-bold uppercase tracking-wide text-sm">{cat.name}</div>
                  <div class="text-[10px] text-zinc-500 font-mono mt-1">GÊNERO: {cat.gender} | VAGAS RESTANTES: {cat.availableSlots}</div>
                </div>
              </label>
            ))}
          </div>

          <div class="pt-6 border-t border-zinc-800/60 flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!selectedCategoryId}
              class="bg-emerald-500 hover:bg-emerald-600 text-black font-mono text-xs uppercase px-8 py-3.5 tracking-widest font-extrabold transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              Próximo Passo &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 2: DADOS DO ATLETA */}
      {step === 2 && (
        <div class="space-y-6">
          <div>
            <h2 class="font-heading text-xl font-bold text-white uppercase tracking-wider">Identificação do Atleta</h2>
            <p class="text-zinc-400 text-xs mt-1">Precisamos do seu CPF e telefone para faturamento do PIX e emissão da vaga.</p>
          </div>

          <div class="space-y-4 font-mono text-xs">
            <div class="space-y-2">
              <label htmlFor="cpf" class="text-[10px] uppercase text-zinc-400 block tracking-wider">CPF do Participante</label>
              <input
                type="text"
                id="cpf"
                required
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                class="w-full bg-[#0d0e12] border border-zinc-800 text-zinc-300 px-4 py-3 outline-none focus:border-emerald-500 transition-colors uppercase placeholder:text-zinc-800"
              />
            </div>

            <div class="space-y-2">
              <label htmlFor="phone" class="text-[10px] uppercase text-zinc-400 block tracking-wider">Celular / WhatsApp</label>
              <input
                type="text"
                id="phone"
                required
                placeholder="(21) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                class="w-full bg-[#0d0e12] border border-zinc-800 text-zinc-300 px-4 py-3 outline-none focus:border-emerald-500 transition-colors uppercase placeholder:text-zinc-800"
              />
            </div>

            <div class="space-y-2">
              <label htmlFor="shirt" class="text-[10px] uppercase text-zinc-400 block tracking-wider">Tamanho da Camiseta do Kit</label>
              <select
                id="shirt"
                value={shirtSize}
                onChange={(e) => setShirtSize(e.target.value)}
                class="w-full bg-[#0d0e12] border border-zinc-800 text-zinc-300 px-4 py-3 outline-none focus:border-emerald-500 transition-colors"
              >
                <option value="P">P — PEQUENO</option>
                <option value="M">M — MÉDIO</option>
                <option value="G">G — GRANDE</option>
                <option value="GG">GG — EXTRA GRANDE</option>
              </select>
            </div>
          </div>

          <div class="pt-6 border-t border-zinc-800/60 flex items-center justify-between font-mono">
            <button
              onClick={() => setStep(1)}
              class="border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white text-xs uppercase px-6 py-3 tracking-widest font-semibold transition-all duration-200"
            >
              &larr; Voltar
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!cpf.trim() || !phone.trim()}
              class="bg-emerald-500 hover:bg-emerald-600 text-black text-xs uppercase px-8 py-3.5 tracking-widest font-extrabold transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              Próximo Passo &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 3: REVISÃO E CUPOM */}
      {step === 3 && (
        <form onSubmit={handleSubmitRegistration} class="space-y-6">
          <div>
            <h2 class="font-heading text-xl font-bold text-white uppercase tracking-wider">Revisão do Pedido</h2>
            <p class="text-zinc-400 text-xs mt-1">Revise suas escolhas e aplique cupons promocionais se houver.</p>
          </div>

          <div class="bg-[#0d0e12] border border-zinc-800 p-4 font-mono text-xs space-y-4">
            <div class="flex justify-between border-b border-zinc-800/50 pb-2">
              <span class="text-zinc-500 uppercase">Evento</span>
              <span class="text-zinc-200 font-bold">{eventTitle}</span>
            </div>
            <div class="flex justify-between border-b border-zinc-800/50 pb-2">
              <span class="text-zinc-500 uppercase">Categoria</span>
              <span class="text-zinc-200">
                {categories.find(c => c.id === selectedCategoryId)?.name}
              </span>
            </div>
            <div class="flex justify-between border-b border-zinc-800/50 pb-2">
              <span class="text-zinc-500 uppercase">Camiseta</span>
              <span class="text-zinc-200">Camiseta Oficial (Tamanho {shirtSize})</span>
            </div>
            <div class="flex justify-between pb-1 text-sm pt-2">
              <span class="text-zinc-400 uppercase font-semibold">Valor da Inscrição</span>
              <span class="text-zinc-200 font-bold">{formatPrice(basePrice)}</span>
            </div>

            {couponDiscount > 0 && (
              <div class="flex justify-between pb-1 text-xs text-emerald-400 border-t border-zinc-900 pt-2">
                <span>Desconto Cupom ({couponDiscount}%)</span>
                <span>-{formatPrice(basePrice * (couponDiscount / 100))}</span>
              </div>
            )}

            <div class="flex justify-between pb-1 text-base font-bold border-t border-zinc-800 pt-4 text-white">
              <span class="uppercase">TOTAL A PAGAR</span>
              <span class="text-emerald-400">{formatPrice(finalPrice)}</span>
            </div>
          </div>

          {/* Seção do Cupom */}
          <div class="border border-zinc-800 p-4 space-y-3 font-mono">
            <label htmlFor="coupon" class="text-[10px] uppercase text-zinc-400 block tracking-wider">Possui Cupom de Desconto?</label>
            <div class="flex gap-2">
              <input
                type="text"
                id="coupon"
                placeholder="EX: RIO10"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                class="bg-[#0d0e12] border border-zinc-800 text-zinc-300 text-xs px-3 py-2 flex-grow outline-none focus:border-emerald-500 transition-colors uppercase placeholder:text-zinc-800"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={isApplyingCoupon || !couponCode.trim()}
                class="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs uppercase px-4 py-2 hover:bg-zinc-800 transition-all cursor-pointer disabled:opacity-50"
              >
                {isApplyingCoupon ? 'VALIDANDO...' : 'APLICAR'}
              </button>
            </div>
            {couponError && <p class="text-[10px] text-red-500 uppercase">{couponError}</p>}
            {couponSuccess && <p class="text-[10px] text-emerald-400 uppercase">{couponSuccess}</p>}
          </div>

          <label class="flex gap-3 items-start select-none cursor-pointer font-sans text-[11px] text-zinc-500 leading-tight">
            <input
              type="checkbox"
              required
              class="accent-emerald-500 w-3.5 h-3.5 mt-0.5 bg-zinc-950 border-zinc-800"
            />
            <span>Declaro que aceito as regras oficiais da competição e concordo em prosseguir com o pagamento PIX no valor de {formatPrice(finalPrice)}.</span>
          </label>

          <div class="pt-6 border-t border-zinc-800/60 flex items-center justify-between font-mono">
            <button
              type="button"
              onClick={() => setStep(2)}
              class="border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white text-xs uppercase px-6 py-3 tracking-widest font-semibold transition-all duration-200"
            >
              &larr; Voltar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              class="bg-emerald-500 hover:bg-emerald-600 text-black text-xs uppercase px-8 py-3.5 tracking-widest font-extrabold transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'PROCESSANDO INSCRIÇÃO...' : 'FINALIZAR INSCRIÇÃO & GERAR PIX'}
            </button>
          </div>
        </form>
      )}

      {/* ETAPA 4: PAGAMENTO PIX & POLLING */}
      {step === 4 && (
        <div class="space-y-8 text-center font-mono">
          {paymentStatus === 'PENDING' && (
            <div class="space-y-6">
              <div>
                <h2 class="font-heading text-xl font-bold text-white uppercase tracking-wider">Inscrição Reservada com Sucesso!</h2>
                <p class="text-zinc-500 text-xs mt-1">Sua vaga está garantida por tempo limitado. Realize o pagamento do PIX abaixo.</p>
              </div>

              {/* QR Code Container */}
              <div class="max-w-[200px] mx-auto bg-white p-3 aspect-square flex items-center justify-center border border-zinc-800">
                {pixQrCode ? (
                  // Usando uma imagem publica para gerar QR Code do valor copia e cola
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pixQrCode)}`}
                    alt="QR Code PIX para pagamento"
                    class="w-full h-full object-contain"
                  />
                ) : (
                  <div class="text-zinc-400 text-[10px] uppercase flex flex-col items-center gap-2">
                    <span class="w-5 h-5 border-2 border-zinc-400 border-t-transparent animate-spin rounded-full"></span>
                    Gerando QR Code...
                  </div>
                )}
              </div>

              {/* Pix Copia e Cola */}
              {pixQrCode && (
                <div class="space-y-2 text-left max-w-md mx-auto">
                  <label htmlFor="pixCode" class="text-[10px] uppercase text-zinc-500 block tracking-wider">PIX Copia e Cola</label>
                  <div class="flex">
                    <input
                      type="text"
                      id="pixCode"
                      readOnly
                      value={pixQrCode}
                      class="bg-[#0d0e12] border border-zinc-800 text-zinc-400 text-xs px-3 py-2.5 outline-none flex-grow font-mono truncate"
                    />
                    <button
                      onClick={handleCopyPix}
                      class="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs px-4 py-2 hover:text-white transition-all cursor-pointer"
                    >
                      {copySuccess ? 'COPIADO!' : 'COPIAR'}
                    </button>
                  </div>
                </div>
              )}

              {/* Loading Status */}
              <div class="border-t border-zinc-800/60 pt-6 flex flex-col items-center gap-2 text-xs">
                <span class="text-emerald-400 flex items-center gap-2">
                  <span class="w-2 h-2 bg-emerald-400 rounded-full animate-ping"></span>
                  AGUARDANDO CONFIRMAÇÃO DE PAGAMENTO...
                </span>
                <span class="text-[10px] text-zinc-600 uppercase">Consultando gateway (Tentativa {pollingAttempts})</span>
              </div>
            </div>
          )}

          {paymentStatus === 'PAID' && (
            <div class="py-8 space-y-6 flex flex-col items-center">
              {/* Animacao / Feedback de sucesso */}
              <div class="w-16 h-16 bg-emerald-500/10 border border-emerald-500 rounded-full flex items-center justify-center text-emerald-400 text-2xl font-bold animate-bounce">
                ✓
              </div>

              <div>
                <h2 class="font-heading text-2xl font-bold text-white uppercase tracking-wider">Inscrição Confirmada!</h2>
                <p class="text-zinc-400 text-xs mt-2 max-w-sm mx-auto leading-relaxed">
                  Seu pagamento foi aprovado pelo gateway Asaas. Sua vaga está garantida e o kit (tamanho {shirtSize}) foi reservado.
                </p>
              </div>

              <div class="bg-[#0d0e12] border border-zinc-800/80 p-4 text-xs max-w-sm w-full text-left space-y-2">
                <div class="flex justify-between text-zinc-500"><span class="uppercase">Inscrição ID</span><span class="text-zinc-300 font-bold">{registrationId.substring(0, 13)}...</span></div>
                <div class="flex justify-between text-zinc-500"><span class="uppercase">Valor Pago</span><span class="text-emerald-400 font-bold">{formatPrice(amount || finalPrice)}</span></div>
                <div class="flex justify-between text-zinc-500"><span class="uppercase">Status</span><span class="text-emerald-400 font-bold uppercase">Aprovado (PIX)</span></div>
              </div>

              <div class="pt-4">
                <a
                  href="/painel"
                  class="bg-emerald-500 hover:bg-emerald-600 text-black text-xs uppercase px-8 py-3.5 tracking-widest font-extrabold transition-all duration-200 inline-block"
                >
                  Ir para Meu Painel
                </a>
              </div>
            </div>
          )}

          {paymentStatus === 'FAILED' && (
            <div class="py-8 space-y-6 flex flex-col items-center">
              <div class="w-16 h-16 bg-red-500/10 border border-red-500 rounded-full flex items-center justify-center text-red-500 text-2xl font-bold">
                ✕
              </div>

              <div>
                <h2 class="font-heading text-2xl font-bold text-white uppercase tracking-wider">Tempo Esgotado!</h2>
                <p class="text-red-400 text-xs mt-2 max-w-sm mx-auto leading-relaxed">
                  O tempo limite para pagamento do PIX desta vaga expirou ou a inscrição foi cancelada pelo sistema.
                </p>
              </div>

              <div class="pt-4">
                <button
                  onClick={() => setStep(3)}
                  class="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs uppercase px-8 py-3.5 tracking-widest font-bold transition-all duration-200 inline-block cursor-pointer"
                >
                  Tentar Novamente
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
