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
  commissionRate?: number;
}

export default function RegistrationForm({ eventId, eventTitle, categories, batches, commissionRate = 10 }: RegistrationFormProps) {
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

  // Métodos de Pagamento e Cartão
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT_CARD'>('PIX');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolderName, setCardHolderName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCcv, setCardCcv] = useState('');
  const [sameAsParticipant, setSameAsParticipant] = useState(true);
  const [cardHolderCpf, setCardHolderCpf] = useState('');
  const [cardHolderZipCode, setCardHolderZipCode] = useState('');

  // Máscaras de entrada
  const formatCardNumber = (value: string) => {
    const v = value.replace(/\D/g, '').substring(0, 16);
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length > 0) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/\D/g, '').substring(0, 4);
    if (v.length >= 2) {
      return `${v.substring(0, 2)}/${v.substring(2)}`;
    }
    return v;
  };

  const formatZipCode = (value: string) => {
    const v = value.replace(/\D/g, '').substring(0, 8);
    if (v.length >= 5) {
      return `${v.substring(0, 5)}-${v.substring(5)}`;
    }
    return v;
  };

  // Algoritmo de Luhn para validação de cartão de crédito
  const validateLuhn = (numberStr: string): boolean => {
    const digits = numberStr.replace(/\D/g, '');

    // Exceções para testes locais e desenvolvimento no Sandbox do Asaas
    const localTestCards = [
      '4444444444444444', // Cartão válido para simulação de sucesso
      '5184019740373151', // Cartão Mastercard para simulação de erro
      '4916561358240741'  // Cartão Visa para simulação de erro
    ];
    if (localTestCards.includes(digits)) {
      return true;
    }

    if (!digits || digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  };

  const validateCardExpiry = (expiry: string): boolean => {
    const parts = expiry.split('/');
    if (parts.length !== 2) return false;
    const month = parseInt(parts[0], 10);
    const year = parseInt(parts[1], 10);
    if (isNaN(month) || isNaN(year) || month < 1 || month > 12) return false;

    const currentYear = new Date().getFullYear() % 100;
    const currentMonth = new Date().getMonth() + 1;
    if (year < currentYear) return false;
    if (year === currentYear && month < currentMonth) return false;
    return true;
  };

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
  const discountValue = basePrice * (couponDiscount / 100);
  const subtotal = Math.max(0, basePrice - discountValue);
  const adminFee = (subtotal * (commissionRate / 100));
  const finalPrice = subtotal + adminFee;

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

  const handleSubmitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmissionError('');

    try {
      // Validações do Cartão de Crédito
      if (paymentMethod === 'CREDIT_CARD') {
        if (!cardHolderName.trim()) {
          throw new Error('O nome impresso no cartão é obrigatório.');
        }

        const cleanCardNumber = cardNumber.replace(/\D/g, '');
        if (!cleanCardNumber || cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
          throw new Error('Número do cartão de crédito inválido.');
        }
        if (!validateLuhn(cleanCardNumber)) {
          throw new Error('Número do cartão de crédito inválido (Algoritmo de Luhn).');
        }

        if (!validateCardExpiry(cardExpiry)) {
          throw new Error('Data de validade do cartão inválida ou expirada. Use o formato MM/AA.');
        }

        const cleanCcv = cardCcv.replace(/\D/g, '');
        if (!cleanCcv || cleanCcv.length < 3 || cleanCcv.length > 4) {
          throw new Error('Código de segurança (CVV) inválido.');
        }

        const cleanZipCode = cardHolderZipCode.replace(/\D/g, '');
        if (!cleanZipCode || cleanZipCode.length !== 8) {
          throw new Error('CEP do titular inválido.');
        }

        if (!sameAsParticipant) {
          const cleanCpf = cardHolderCpf.replace(/\D/g, '');
          if (!cleanCpf || cleanCpf.length !== 11) {
            throw new Error('CPF do titular inválido.');
          }
        }
      }

      const token = await getClerkToken();

      const payload: any = {
        eventId,
        categoryId: selectedCategoryId,
        batchId: activeBatch?.id,
        couponCode: couponCode ? couponCode.trim().toUpperCase() : undefined,
        complementaryData: {
          cpf,
          phone,
          shirtSize,
        },
        paymentMethod,
      };

      if (paymentMethod === 'CREDIT_CARD') {
        const parts = cardExpiry.split('/');
        payload.cardDetails = {
          holderName: cardHolderName.trim().toUpperCase(),
          number: cardNumber.replace(/\D/g, ''),
          expiryMonth: parts[0],
          expiryYear: `20${parts[1]}`, // assume 20XX
          ccv: cardCcv.replace(/\D/g, ''),
          holderCpf: sameAsParticipant ? cpf.replace(/\D/g, '') : cardHolderCpf.replace(/\D/g, ''),
          holderZipCode: cardHolderZipCode.replace(/\D/g, ''),
        };
      }

      const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/registrations`, {
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
        const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';
        const response = await fetch(`${apiUrl}/api/registrations/${registrationId}`, {
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
    <div className="w-full bg-surface-alt border border-ink-muted/20 shadow-sm p-6 md:p-8 relative">
      {/* Canto decorativo HUD */}
      <div className="absolute top-0 right-0 w-12 h-12 border-t border-r border-ink-muted/30 pointer-events-none"></div>

      {/* Barra de Progresso HUD */}
      <div className="mb-8 font-mono text-xs md:text-sm tracking-widest text-ink-muted flex items-center justify-between border-b border-ink-muted/20 pb-4">
        <div className="flex items-center gap-4 md:gap-6 flex-wrap">
          <span className={step === 1 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-ink-muted/60'}>01 // CATEGORIA</span>
          <span className={step === 2 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-ink-muted/60'}>02 // DADOS ATLETA</span>
          <span className={step === 3 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-ink-muted/60'}>03 // REVISÃO</span>
          <span className={step === 4 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-ink-muted/60'}>04 // CHECKOUT</span>
        </div>
        <div className="text-ink-muted font-bold">PASSO {step} DE 4</div>
      </div>

      {submissionError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-500 dark:text-red-400 text-sm font-mono p-4 mb-6 uppercase flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>
          {submissionError}
        </div>
      )}

      {/* ETAPA 1: SELEÇÃO DE CATEGORIA */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="font-heading text-xl md:text-2xl font-bold text-ink uppercase tracking-wider">{eventTitle}</h2>
            <p className="text-ink-muted text-sm mt-1">Selecione a modalidade/categoria oficial em que deseja competir.</p>
          </div>

          <div className="space-y-3">
            {categories.map((cat) => (
              <label
                key={cat.id}
                className={`flex items-center gap-4 bg-surface border p-4 md:p-5 cursor-pointer transition-all duration-200 ${selectedCategoryId === cat.id ? 'border-emerald-500/60 bg-emerald-500/[0.05]' : 'border-ink-muted/20 hover:border-ink-muted/40'
                  }`}
              >
                <input
                  type="radio"
                  name="category"
                  value={cat.id}
                  checked={selectedCategoryId === cat.id}
                  onChange={() => setSelectedCategoryId(cat.id)}
                  className="accent-emerald-500 w-5 h-5 bg-surface border-ink-muted/30 cursor-pointer"
                />
                <div className="flex-grow font-sans">
                  <div className="text-ink font-bold uppercase tracking-wide text-base">{cat.name}</div>
                  <div className="text-xs text-ink-muted font-mono mt-1">GÊNERO: {cat.gender} | VAGAS RESTANTES: {cat.availableSlots}</div>
                </div>
              </label>
            ))}
          </div>

          <div className="pt-6 border-t border-ink-muted/20 flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!selectedCategoryId}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-mono text-sm uppercase px-8 py-4 tracking-widest font-extrabold transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              Próximo Passo &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 2: DADOS DO ATLETA */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="font-heading text-xl md:text-2xl font-bold text-ink uppercase tracking-wider">Identificação do Atleta</h2>
            <p className="text-ink-muted text-sm mt-1">Precisamos do seu CPF e telefone para faturamento do PIX e emissão da vaga.</p>
          </div>

          <div className="space-y-5 font-mono">
            <div className="space-y-2">
              <label htmlFor="cpf" className="text-xs md:text-sm uppercase text-ink font-semibold block tracking-wider">CPF do Participante</label>
              <input
                type="text"
                id="cpf"
                required
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                className="w-full bg-surface border border-ink-muted/30 text-ink text-base px-4 py-3.5 outline-none focus:border-emerald-500 transition-colors uppercase placeholder:text-ink-muted/50"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="phone" className="text-xs md:text-sm uppercase text-ink font-semibold block tracking-wider">Celular / WhatsApp</label>
              <input
                type="text"
                id="phone"
                required
                placeholder="(21) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-surface border border-ink-muted/30 text-ink text-base px-4 py-3.5 outline-none focus:border-emerald-500 transition-colors uppercase placeholder:text-ink-muted/50"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="shirt" className="text-xs md:text-sm uppercase text-ink font-semibold block tracking-wider">Tamanho da Camiseta do Kit</label>
              <select
                id="shirt"
                value={shirtSize}
                onChange={(e) => setShirtSize(e.target.value)}
                className="w-full bg-surface border border-ink-muted/30 text-ink text-base px-4 py-3.5 outline-none focus:border-emerald-500 transition-colors cursor-pointer"
              >
                <option value="P">P — PEQUENO</option>
                <option value="M">M — MÉDIO</option>
                <option value="G">G — GRANDE</option>
                <option value="GG">GG — EXTRA GRANDE</option>
              </select>
            </div>
          </div>

          <div className="pt-6 border-t border-ink-muted/20 flex items-center justify-between font-mono">
            <button
              onClick={() => setStep(1)}
              className="border border-ink-muted/30 hover:border-ink-muted text-ink-muted hover:text-ink text-xs md:text-sm uppercase px-6 py-3.5 tracking-widest font-semibold transition-all duration-200 cursor-pointer"
            >
              &larr; Voltar
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!cpf.trim() || !phone.trim()}
              className="bg-emerald-500 hover:bg-emerald-600 text-black text-xs md:text-sm uppercase px-8 py-3.5 tracking-widest font-extrabold transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              Próximo Passo &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 3: REVISÃO E CUPOM */}
      {step === 3 && (
        <form onSubmit={handleSubmitRegistration} className="space-y-6">
          <div>
            <h2 className="font-heading text-xl md:text-2xl font-bold text-ink uppercase tracking-wider">Revisão do Pedido</h2>
            <p className="text-ink-muted text-sm mt-1">Revise suas escolhas e aplique cupons promocionais se houver.</p>
          </div>

          <div className="bg-surface border border-ink-muted/20 p-5 font-mono space-y-4">
            <div className="flex justify-between border-b border-ink-muted/20 pb-3 text-sm md:text-base">
              <span className="text-ink-muted uppercase">Evento</span>
              <span className="text-ink font-bold">{eventTitle}</span>
            </div>
            <div className="flex justify-between border-b border-ink-muted/20 pb-3 text-sm md:text-base">
              <span className="text-ink-muted uppercase">Categoria</span>
              <span className="text-ink font-semibold">
                {categories.find(c => c.id === selectedCategoryId)?.name}
              </span>
            </div>
            <div className="flex justify-between border-b border-ink-muted/20 pb-3 text-sm md:text-base">
              <span className="text-ink-muted uppercase">Camiseta</span>
              <span className="text-ink font-semibold">Camiseta Oficial (Tamanho {shirtSize})</span>
            </div>
            <div className="flex justify-between pb-1 text-sm md:text-base pt-2">
              <span className="text-ink-muted uppercase font-semibold">Valor da Inscrição</span>
              <span className="text-ink font-bold">{formatPrice(basePrice)}</span>
            </div>

            {couponDiscount > 0 && (
              <div className="flex justify-between pb-1 text-sm text-emerald-600 dark:text-emerald-400 border-t border-ink-muted/20 pt-2 font-semibold">
                <span>Desconto Cupom ({couponDiscount}%)</span>
                <span>-{formatPrice(discountValue)}</span>
              </div>
            )}

            {commissionRate > 0 && (
              <div className="flex justify-between pb-1 text-sm text-ink-muted border-t border-ink-muted/20 pt-2 font-semibold">
                <span>Taxa Administrativa ({commissionRate}%)</span>
                <span className="text-ink font-bold">+{formatPrice(adminFee)}</span>
              </div>
            )}

            <div className="flex justify-between pb-1 text-base md:text-lg font-bold border-t border-ink-muted/20 pt-4 text-ink">
              <span className="uppercase">TOTAL A PAGAR</span>
              <span className="text-emerald-600 dark:text-emerald-400 text-lg md:text-xl">{formatPrice(finalPrice)}</span>
            </div>
          </div>

          {/* Seção do Cupom */}
          <div className="border border-ink-muted/20 p-5 space-y-3 font-mono">
            <label htmlFor="coupon" className="text-xs md:text-sm uppercase text-ink font-semibold block tracking-wider">Possui Cupom de Desconto?</label>
            <div className="flex gap-2">
              <input
                type="text"
                id="coupon"
                placeholder="EX: RIO10"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                className="bg-surface border border-ink-muted/30 text-ink text-base px-4 py-3 flex-grow outline-none focus:border-emerald-500 transition-colors uppercase placeholder:text-ink-muted/50"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={isApplyingCoupon || !couponCode.trim()}
                className="bg-surface border border-ink-muted/30 text-ink text-xs md:text-sm uppercase px-5 py-3 hover:bg-surface-alt transition-all cursor-pointer font-bold disabled:opacity-50"
              >
                {isApplyingCoupon ? 'VALIDANDO...' : 'APLICAR'}
              </button>
            </div>
            {couponError && <p className="text-xs text-red-500 uppercase">{couponError}</p>}
            {couponSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400 uppercase">{couponSuccess}</p>}
          </div>

          {/* Método de Pagamento */}
          <div className="border border-ink-muted/20 p-5 space-y-4 font-mono">
            <label className="text-xs md:text-sm uppercase text-ink font-semibold block tracking-wider">Forma de Pagamento</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setPaymentMethod('PIX')}
                className={`flex flex-col items-center justify-center p-4 md:p-5 border text-center transition-all cursor-pointer ${paymentMethod === 'PIX'
                  ? 'border-emerald-500/60 bg-emerald-500/[0.05] text-ink'
                  : 'border-ink-muted/20 bg-surface text-ink-muted hover:border-ink-muted/40'
                  }`}
              >
                <span className="text-sm md:text-base font-bold uppercase tracking-wide">PIX</span>
                <span className="text-xs text-ink-muted mt-1">Confirmação em instantes</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('CREDIT_CARD')}
                className={`flex flex-col items-center justify-center p-4 md:p-5 border text-center transition-all cursor-pointer ${paymentMethod === 'CREDIT_CARD'
                  ? 'border-emerald-500/60 bg-emerald-500/[0.05] text-ink'
                  : 'border-ink-muted/20 bg-surface text-ink-muted hover:border-ink-muted/40'
                  }`}
              >
                <span className="text-sm md:text-base font-bold uppercase tracking-wide">Cartão de Crédito</span>
                <span className="text-xs text-ink-muted mt-1">Aprovação imediata</span>
              </button>
            </div>

            {paymentMethod === 'CREDIT_CARD' && (
              <div className="space-y-4 pt-4 border-t border-ink-muted/20">
                {/* Número do Cartão */}
                <div className="space-y-1.5">
                  <label htmlFor="cardNumber" className="text-xs md:text-sm uppercase text-ink font-semibold block tracking-wider">Número do Cartão</label>
                  <input
                    type="text"
                    id="cardNumber"
                    placeholder="0000 0000 0000 0000"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    className="w-full bg-surface border border-ink-muted/30 text-ink text-base px-4 py-3 outline-none focus:border-emerald-500 transition-colors placeholder:text-ink-muted/50 font-mono"
                  />
                </div>

                {/* Nome no Cartão */}
                <div className="space-y-1.5">
                  <label htmlFor="cardHolderName" className="text-xs md:text-sm uppercase text-ink font-semibold block tracking-wider">Nome Impresso no Cartão</label>
                  <input
                    type="text"
                    id="cardHolderName"
                    placeholder="JOÃO S SILVA"
                    value={cardHolderName}
                    onChange={(e) => setCardHolderName(e.target.value.toUpperCase())}
                    className="w-full bg-surface border border-ink-muted/30 text-ink text-base px-4 py-3 outline-none focus:border-emerald-500 transition-colors placeholder:text-ink-muted/50 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Validade */}
                  <div className="space-y-1.5">
                    <label htmlFor="cardExpiry" className="text-xs md:text-sm uppercase text-ink font-semibold block tracking-wider">Validade (MM/AA)</label>
                    <input
                      type="text"
                      id="cardExpiry"
                      placeholder="MM/AA"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                      className="w-full bg-surface border border-ink-muted/30 text-ink text-base px-4 py-3 outline-none focus:border-emerald-500 transition-colors placeholder:text-ink-muted/50 font-mono"
                    />
                  </div>

                  {/* CVV */}
                  <div className="space-y-1.5">
                    <label htmlFor="cardCcv" className="text-xs md:text-sm uppercase text-ink font-semibold block tracking-wider">CVV</label>
                    <input
                      type="text"
                      id="cardCcv"
                      placeholder="123"
                      value={cardCcv}
                      onChange={(e) => setCardCcv(e.target.value.replace(/\D/g, '').substring(0, 4))}
                      className="w-full bg-surface border border-ink-muted/30 text-ink text-base px-4 py-3 outline-none focus:border-emerald-500 transition-colors placeholder:text-ink-muted/50 font-mono"
                    />
                  </div>
                </div>

                {/* Checkbox Mesmos Dados do Participante */}
                <label className="flex gap-2.5 items-center select-none cursor-pointer font-sans text-xs md:text-sm text-ink-muted">
                  <input
                    type="checkbox"
                    checked={sameAsParticipant}
                    onChange={(e) => setSameAsParticipant(e.target.checked)}
                    className="accent-emerald-500 w-4 h-4 bg-surface border-ink-muted/30 cursor-pointer"
                  />
                  <span>Os dados cadastrais do titular são os mesmos do participante</span>
                </label>

                {/* Se não for o mesmo participante, exibir CPF do Titular */}
                {!sameAsParticipant && (
                  <div className="space-y-1.5">
                    <label htmlFor="cardHolderCpf" className="text-xs md:text-sm uppercase text-ink font-semibold block tracking-wider">CPF do Titular do Cartão</label>
                    <input
                      type="text"
                      id="cardHolderCpf"
                      placeholder="000.000.000-00"
                      value={cardHolderCpf}
                      onChange={(e) => setCardHolderCpf(e.target.value)}
                      className="w-full bg-surface border border-ink-muted/30 text-ink text-base px-4 py-3 outline-none focus:border-emerald-500 transition-colors placeholder:text-ink-muted/50 font-mono"
                    />
                  </div>
                )}

                {/* CEP do Titular (sempre obrigatório para validação cadastral) */}
                <div className="space-y-1.5">
                  <label htmlFor="cardHolderZipCode" className="text-xs md:text-sm uppercase text-ink font-semibold block tracking-wider">CEP do Titular</label>
                  <input
                    type="text"
                    id="cardHolderZipCode"
                    placeholder="00000-000"
                    value={cardHolderZipCode}
                    onChange={(e) => setCardHolderZipCode(formatZipCode(e.target.value))}
                    className="w-full bg-surface border border-ink-muted/30 text-ink text-base px-4 py-3 outline-none focus:border-emerald-500 transition-colors placeholder:text-ink-muted/50 font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          <label className="flex gap-3 items-start select-none cursor-pointer font-sans text-xs md:text-sm text-ink-muted leading-snug">
            <input
              type="checkbox"
              required
              className="accent-emerald-500 w-4 h-4 mt-0.5 bg-surface border-ink-muted/30 cursor-pointer"
            />
            <span>Declaro que aceito as regras oficiais da competição e concordo em prosseguir com o pagamento no valor de {formatPrice(finalPrice)} via {paymentMethod === 'PIX' ? 'PIX' : 'Cartão de Crédito'}.</span>
          </label>

          <div className="pt-6 border-t border-ink-muted/20 flex items-center justify-between font-mono">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="border border-ink-muted/30 hover:border-ink-muted text-ink-muted hover:text-ink text-xs md:text-sm uppercase px-6 py-3.5 tracking-widest font-semibold transition-all duration-200 cursor-pointer"
            >
              &larr; Voltar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-500 hover:bg-emerald-600 text-black text-xs md:text-sm uppercase px-8 py-4 tracking-widest font-extrabold transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'PROCESSANDO INSCRIÇÃO...' : paymentMethod === 'PIX' ? 'FINALIZAR INSCRIÇÃO & GERAR PIX' : 'FINALIZAR INSCRIÇÃO & PAGAR COM CARTÃO'}
            </button>
          </div>
        </form>
      )}

      {/* ETAPA 4: PAGAMENTO & POLLING */}
      {step === 4 && (
        <div className="space-y-8 text-center font-mono">
          {paymentStatus === 'PENDING' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-xl md:text-2xl font-bold text-ink uppercase tracking-wider">
                  {paymentMethod === 'PIX' ? 'Inscrição Reservada com Sucesso!' : 'Processando Cobrança...'}
                </h2>
                <p className="text-ink-muted text-sm mt-1 max-w-md mx-auto leading-relaxed">
                  {paymentMethod === 'PIX'
                    ? 'Sua vaga está garantida por tempo limitado. Realize o pagamento do PIX abaixo.'
                    : 'Estamos validando e processando a transação do cartão de crédito no gateway.'
                  }
                </p>
              </div>

              {paymentMethod === 'CREDIT_CARD' ? (
                <div className="py-8 space-y-4 max-w-sm mx-auto border border-ink-muted/20 bg-surface p-6">
                  <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent animate-spin rounded-full mx-auto"></div>
                  <div className="text-xs md:text-sm text-ink font-bold uppercase tracking-widest">Aguardando autorização...</div>
                  <p className="text-xs text-ink-muted leading-relaxed uppercase">
                    Por favor, não feche ou recarregue esta página. Isso pode levar alguns segundos.
                  </p>
                </div>
              ) : (
                <>
                  {/* QR Code Container */}
                  <div className="max-w-[220px] mx-auto bg-white p-3 aspect-square flex items-center justify-center border border-ink-muted/20 shadow-lg">
                    {pixQrCode ? (
                      // Usando uma imagem publica para gerar QR Code do valor copia e cola
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixQrCode)}`}
                        alt="QR Code PIX para pagamento"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-ink-muted text-xs uppercase flex flex-col items-center gap-2">
                        <span className="w-6 h-6 border-2 border-ink-muted/50 border-t-transparent animate-spin rounded-full"></span>
                        Gerando QR Code...
                      </div>
                    )}
                  </div>

                  {/* Pix Copia e Cola */}
                  {pixQrCode && (
                    <div className="space-y-2 text-left max-w-md mx-auto">
                      <label htmlFor="pixCode" className="text-xs md:text-sm uppercase text-ink font-semibold block tracking-wider">PIX Copia e Cola</label>
                      <div className="flex">
                        <input
                          type="text"
                          id="pixCode"
                          readOnly
                          value={pixQrCode}
                          className="bg-surface border border-ink-muted/30 text-ink text-sm md:text-base px-4 py-3 outline-none flex-grow font-mono truncate"
                        />
                        <button
                          onClick={handleCopyPix}
                          className="bg-surface border border-ink-muted/30 hover:bg-surface-alt text-ink text-xs md:text-sm font-bold uppercase px-6 py-3 hover:text-accent transition-all cursor-pointer"
                        >
                          {copySuccess ? 'COPIADO!' : 'COPIAR'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Loading Status */}
              <div className="border-t border-ink-muted/20 pt-6 flex flex-col items-center gap-2 text-sm">
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-2 font-semibold">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></span>
                  AGUARDANDO CONFIRMAÇÃO DE PAGAMENTO...
                </span>
                <span className="text-xs text-ink-muted uppercase">Consultando gateway (Tentativa {pollingAttempts})</span>
              </div>
            </div>
          )}

          {paymentStatus === 'PAID' && (
            <div className="py-8 space-y-6 flex flex-col items-center">
              {/* Animacao / Feedback de sucesso */}
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-2xl font-bold animate-bounce">
                ✓
              </div>

              <div>
                <h2 className="font-heading text-2xl md:text-3xl font-bold text-ink uppercase tracking-wider">Inscrição Confirmada!</h2>
                <p className="text-ink-muted text-sm md:text-base mt-2 max-w-md mx-auto leading-relaxed">
                  Seu pagamento foi aprovado pelo gateway de pagamento. Sua vaga está garantida e o kit (tamanho {shirtSize}) foi reservado.
                </p>
              </div>

              <div className="bg-surface border border-ink-muted/20 p-5 text-sm md:text-base max-w-md w-full text-left space-y-3 font-mono">
                <div className="flex justify-between text-ink-muted"><span className="uppercase">Inscrição ID</span><span className="text-ink font-bold">{registrationId.substring(0, 13)}...</span></div>
                <div className="flex justify-between text-ink-muted"><span className="uppercase">Valor Pago</span><span className="text-emerald-600 dark:text-emerald-400 font-bold">{formatPrice(amount || finalPrice)}</span></div>
                <div className="flex justify-between text-ink-muted"><span className="uppercase">Status</span><span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase">Aprovado ({paymentMethod === 'PIX' ? 'PIX' : 'Cartão'})</span></div>
              </div>

              <div className="pt-4">
                <a
                  href="/painel"
                  className="bg-emerald-500 hover:bg-emerald-600 text-black text-xs md:text-sm uppercase px-8 py-4 tracking-widest font-extrabold transition-all duration-200 inline-block cursor-pointer"
                >
                  Ir para Meu Painel
                </a>
              </div>
            </div>
          )}

          {paymentStatus === 'FAILED' && (
            <div className="py-8 space-y-6 flex flex-col items-center">
              <div className="w-16 h-16 bg-red-500/10 border border-red-500 rounded-full flex items-center justify-center text-red-500 text-2xl font-bold">
                ✕
              </div>

              <div>
                <h2 className="font-heading text-2xl md:text-3xl font-bold text-ink uppercase tracking-wider">
                  {paymentMethod === 'PIX' ? 'Tempo Esgotado!' : 'Pagamento Recusado'}
                </h2>
                <p className="text-red-500 dark:text-red-400 text-sm mt-2 max-w-md mx-auto leading-relaxed font-sans">
                  {paymentMethod === 'PIX'
                    ? 'O tempo limite para pagamento do PIX desta vaga expirou ou a inscrição foi cancelada pelo sistema.'
                    : 'A transação com o seu cartão de crédito foi recusada pelo gateway de pagamento. Verifique os dados ou tente outra forma de pagamento.'
                  }
                </p>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => setStep(3)}
                  className="bg-surface hover:bg-surface-alt text-ink text-xs md:text-sm uppercase px-8 py-4 tracking-widest font-bold transition-all duration-200 inline-block cursor-pointer border border-ink-muted/30"
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
