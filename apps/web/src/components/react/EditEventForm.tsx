import React, { useState } from 'react';

interface CategoryField {
  name: string;
  gender: string;
  slots: number;
}

interface BatchField {
  name: string;
  price: string;
}

interface EditEventFormProps {
  event: {
    id: string;
    title: string;
    description: string | null;
    date: Date | string;
    availableSlots: number;
    contractText: string | null;
    contractPdf: string | null;
    categories: Array<{
      name: string;
      gender: string;
      availableSlots: number;
    }>;
    batches: Array<{
      name: string;
      price: any; // Decimal type or string
    }>;
  };
}

export default function EditEventForm({ event }: EditEventFormProps) {
  // Helper to format Date/ISO string to YYYY-MM-DDTHH:MM
  const formatDatetimeLocal = (dateVal: string | Date) => {
    const d = new Date(dateVal);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description || '');
  const [date, setDate] = useState(formatDatetimeLocal(event.date));
  const [availableSlots, setAvailableSlots] = useState(event.availableSlots);

  // Estados do Contrato
  const [contractType, setContractType] = useState<'TEXT' | 'PDF'>(event.contractPdf ? 'PDF' : 'TEXT');
  const [contractText, setContractText] = useState(event.contractText || '');
  const [contractPdf, setContractPdf] = useState<string | null>(event.contractPdf);

  // Categorias Dinâmicas
  const [categories, setCategories] = useState<CategoryField[]>(
    event.categories.map(cat => ({
      name: cat.name,
      gender: cat.gender,
      slots: cat.availableSlots
    }))
  );

  // Lotes Dinâmicos
  const [batches, setBatches] = useState<BatchField[]>(
    event.batches.map(bat => ({
      name: bat.name,
      price: bat.price.toString()
    }))
  );

  // Estados de Envio
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSuggestContract = () => {
    setContractText(`CONTRATO E REGULAMENTO PADRÃO DE INSCRIÇÃO EM EVENTOS

1. DO OBJETIVO E ACEITE DOS TERMOS
Ao se inscrever neste evento, o participante declara estar de acordo com todas as regras e condições estabelecidas pelo organizador, bem como as normas de segurança do local da prova.

2. DAS CONDIÇÕES FÍSICAS E RESPONSABILIDADE
O participante assume total responsabilidade por suas condições de saúde física e mental, declarando-se apto a participar das atividades propostas e isentando os organizadores de qualquer responsabilidade por acidentes ou problemas de saúde ocorridos durante o evento.

3. DO CANCELAMENTO E REEMBOLSO
O cancelamento da inscrição obedecerá aos prazos e condições definidas em lei (Código de Defesa do Consumidor). Solicitações feitas fora do prazo legal não darão direito a reembolso dos valores pagos.

4. DIREITO DE IMAGEM
O participante cede gratuitamente os direitos de uso de sua imagem (fotos e vídeos capturados durante o evento) para fins de divulgação e publicidade do evento e da plataforma organizadora.`);
  };

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Por favor, selecione um arquivo no formato PDF.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setContractPdf(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Adicionar/Remover Categoria
  const addCategory = () => {
    setCategories([...categories, { name: '', gender: 'OPEN', slots: 50 }]);
  };

  const removeCategory = (index: number) => {
    if (categories.length === 1) return;
    setCategories(categories.filter((_, i) => i !== index));
  };

  const updateCategory = (index: number, key: keyof CategoryField, value: any) => {
    const updated = [...categories];
    updated[index] = { ...updated[index], [key]: value };
    setCategories(updated);
  };

  // Adicionar/Remover Lote
  const addBatch = () => {
    setBatches([...batches, { name: '', price: '' }]);
  };

  const removeBatch = (index: number) => {
    if (batches.length === 1) return;
    setBatches(batches.filter((_, i) => i !== index));
  };

  const updateBatch = (index: number, key: keyof BatchField, value: any) => {
    const updated = [...batches];
    updated[index] = { ...updated[index], [key]: value };
    setBatches(updated);
  };

  // Enviar formulário de edição
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const clerk = (window as any).Clerk;
      if (!clerk || !clerk.session) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }
      const token = await clerk.session.getToken();

      const payload = {
        eventId: event.id,
        title,
        description,
        date,
        availableSlots: Number(availableSlots),
        categories,
        batches: batches.map(b => ({
          name: b.name,
          price: Number(b.price) || 0
        })),
        contractText: contractType === 'TEXT' ? contractText : null,
        contractPdf: contractType === 'PDF' ? contractPdf : null
      };

      const response = await fetch('/api/admin/eventos/editar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: 'Erro desconhecido.' }));
        throw new Error(errData.message || 'Falha ao salvar edições do evento.');
      }

      setSuccessMessage('Evento editado com sucesso! Redirecionando...');

      setTimeout(() => {
        window.location.href = '/admin/dashboard';
      }, 1500);

    } catch (err: any) {
      setErrorMessage(err.message || 'Ocorreu um erro ao salvar o evento.');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full bg-[#15171f] border border-zinc-800 p-6 md:p-8 relative">
      <div className="absolute top-0 right-0 w-12 h-12 border-t border-r border-zinc-700 pointer-events-none"></div>

      <div className="mb-6">
        <h2 className="font-heading text-xl font-bold text-white uppercase tracking-wider">Editar Evento (Rascunho)</h2>
        <p className="text-zinc-500 text-xs mt-1 font-mono uppercase">Atualize as informações da prova esportiva.</p>
      </div>

      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono p-4 mb-6 uppercase">
          ✕ {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono p-4 mb-6 uppercase flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
          {successMessage}
        </div>
      )}

      {/* DADOS PRINCIPAIS DO EVENTO */}
      <div className="space-y-4 font-mono text-xs text-zinc-400 mb-8">
        <div className="space-y-2">
          <label htmlFor="title" className="text-[10px] uppercase block tracking-wider">Título Oficial do Evento</label>
          <input
            type="text"
            id="title"
            required
            placeholder="EX: 10K RIO DE JANEIRO CORRIDA"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-[#0d0e12] border border-zinc-800 text-zinc-300 px-4 py-3 outline-none focus:border-emerald-500 transition-colors uppercase placeholder:text-zinc-800"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <label htmlFor="date" className="text-[10px] uppercase block tracking-wider">Data & Horário do Evento</label>
            <input
              type="datetime-local"
              id="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-[#0d0e12] border border-zinc-800 text-zinc-300 px-4 py-3 outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div class="space-y-2">
            <label htmlFor="slots" className="text-[10px] uppercase block tracking-wider">Limite Físico Geral de Vagas</label>
            <input
              type="number"
              id="slots"
              required
              min="1"
              value={availableSlots}
              onChange={(e) => setAvailableSlots(Number(e.target.value))}
              className="w-full bg-[#0d0e12] border border-zinc-800 text-zinc-300 px-4 py-3 outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
        </div>

        <div className="space-y-2 font-sans">
          <label htmlFor="desc" className="text-[10px] font-mono uppercase block tracking-wider text-zinc-400">Regulamento / Informações Básicas</label>
          <textarea
            id="desc"
            rows={4}
            placeholder="Insira detalhes sobre regulamento, local da largada, entrega de kits, premiação..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-[#0d0e12] border border-zinc-800 text-zinc-300 px-4 py-3 outline-none focus:border-emerald-500 transition-colors text-xs placeholder:text-zinc-700"
          />
        </div>

        {/* CONTRATO / REGULAMENTO */}
        <div className="space-y-4 mb-8 border-t border-zinc-800/60 pt-6 font-sans">
          <div>
            <h3 className="font-heading text-xs font-bold text-white uppercase tracking-wider">Contrato / Regulamento Oficial</h3>
            <p className="text-zinc-500 text-[10px] mt-1 font-mono uppercase">Escolha o formato do contrato. Se ambos forem deixados em branco, o contrato padrão será exibido.</p>
          </div>

          <div className="flex gap-4 font-mono text-xs mb-4">
            <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
              <input
                type="radio"
                name="editContractType"
                checked={contractType === 'TEXT'}
                onChange={() => setContractType('TEXT')}
                className="accent-emerald-500"
              />
              Texto / Markdown
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
              <input
                type="radio"
                name="editContractType"
                checked={contractType === 'PDF'}
                onChange={() => setContractType('PDF')}
                className="accent-emerald-500"
              />
              Upload de PDF
            </label>
          </div>

          {contractType === 'TEXT' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="contractText" className="text-[10px] font-mono uppercase block tracking-wider text-zinc-400">Texto do Regulamento</label>
                <button
                  type="button"
                  onClick={handleSuggestContract}
                  className="text-[9px] font-mono text-emerald-400 hover:text-emerald-300 uppercase tracking-wider cursor-pointer font-bold"
                >
                  Sugerir Contrato Padrão
                </button>
              </div>
              <textarea
                id="contractText"
                rows={6}
                placeholder="Insira os termos de responsabilidade do evento, regras gerais, políticas de reembolso..."
                value={contractText}
                onChange={(e) => setContractText(e.target.value)}
                className="w-full bg-[#0d0e12] border border-zinc-800 text-zinc-300 px-4 py-3 outline-none focus:border-emerald-500 transition-colors text-xs font-mono placeholder:text-zinc-700"
              />
            </div>
          )}

          {contractType === 'PDF' && (
            <div className="space-y-2 font-mono">
              <label className="text-[10px] uppercase block tracking-wider text-zinc-400">Arquivo PDF do Regulamento</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={handlePdfUpload}
                className="w-full bg-[#0d0e12] border border-zinc-800 text-zinc-300 px-4 py-3 outline-none focus:border-emerald-500 transition-colors text-xs"
              />
              {contractPdf && (
                <div className="text-[10px] text-emerald-400 uppercase mt-1">
                  ✓ PDF Carregado com sucesso (Pronto para salvar)
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CATEGORIAS DO EVENTO */}
      <div className="space-y-4 mb-8">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="font-heading text-xs font-bold text-white uppercase tracking-wider">Categorias Oficiais</h3>
          <button
            type="button"
            onClick={addCategory}
            className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 uppercase tracking-widest cursor-pointer font-bold"
          >
            + Adicionar Categoria
          </button>
        </div>

        <div className="space-y-3">
          {categories.map((cat, index) => (
            <div key={index} className="bg-[#0d0e12] border border-zinc-900 p-4 flex flex-col md:flex-row gap-4 items-end font-mono text-xs">
              <div className="flex-grow space-y-2 w-full">
                <label className="text-[9px] text-zinc-500 uppercase tracking-wider">Nome da Categoria</label>
                <input
                  type="text"
                  required
                  placeholder="EX: ELITE MASCULINO"
                  value={cat.name}
                  onChange={(e) => updateCategory(index, 'name', e.target.value)}
                  className="w-full bg-[#15171f] border border-zinc-800 text-zinc-300 px-3 py-2 outline-none focus:border-emerald-500 transition-colors uppercase placeholder:text-zinc-800"
                />
              </div>

              <div className="w-full md:w-48 space-y-2">
                <label className="text-[9px] text-zinc-500 uppercase tracking-wider">Gênero Aceito</label>
                <select
                  value={cat.gender}
                  onChange={(e) => updateCategory(index, 'gender', e.target.value)}
                  className="w-full bg-[#15171f] border border-zinc-800 text-zinc-300 px-3 py-2 outline-none focus:border-emerald-500 transition-colors"
                >
                  <option value="OPEN">MISTO / LIVRE</option>
                  <option value="MALE">MASCULINO</option>
                  <option value="FEMALE">FEMININO</option>
                </select>
              </div>

              <div className="w-full md:w-36 space-y-2">
                <label className="text-[9px] text-zinc-500 uppercase tracking-wider">Vagas Específicas</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={cat.slots}
                  onChange={(e) => updateCategory(index, 'slots', Number(e.target.value))}
                  className="w-full bg-[#15171f] border border-zinc-800 text-zinc-300 px-3 py-2 outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {categories.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCategory(index)}
                  className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 hover:bg-red-500/20 transition-all text-[10px] uppercase tracking-wider cursor-pointer"
                >
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* LOTES DO EVENTO */}
      <div className="space-y-4 mb-8">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="font-heading text-xs font-bold text-white uppercase tracking-wider">Lotes de Inscrição</h3>
          <button
            type="button"
            onClick={addBatch}
            className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 uppercase tracking-widest cursor-pointer font-bold"
          >
            + Adicionar Lote
          </button>
        </div>

        <div className="space-y-3">
          {batches.map((bat, index) => (
            <div key={index} className="bg-[#0d0e12] border border-zinc-900 p-4 flex flex-col md:flex-row gap-4 items-end font-mono text-xs">
              <div className="flex-grow space-y-2 w-full">
                <label className="text-[9px] text-zinc-500 uppercase tracking-wider">Nome do Lote</label>
                <input
                  type="text"
                  required
                  placeholder="EX: LOTE PROMOCIONAL ou 2º LOTE"
                  value={bat.name}
                  onChange={(e) => updateBatch(index, 'name', e.target.value)}
                  className="w-full bg-[#15171f] border border-zinc-800 text-zinc-300 px-3 py-2 outline-none focus:border-emerald-500 transition-colors uppercase placeholder:text-zinc-800"
                />
              </div>

              <div className="w-full md:w-52 space-y-2">
                <label className="text-[9px] text-zinc-500 uppercase tracking-wider">Preço Inscrição (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  placeholder="99.90"
                  value={bat.price}
                  onChange={(e) => updateBatch(index, 'price', e.target.value)}
                  className="w-full bg-[#15171f] border border-zinc-800 text-zinc-300 px-3 py-2 outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-800"
                />
              </div>

              {batches.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeBatch(index)}
                  className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 hover:bg-red-500/20 transition-all text-[10px] uppercase tracking-wider cursor-pointer"
                >
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="pt-6 border-t border-zinc-800/60 flex items-center justify-between font-mono">
        <a
          href="/admin/dashboard"
          className="border border-zinc-800 hover:border-zinc-700 text-zinc-500 hover:text-white text-xs uppercase px-6 py-3 tracking-widest font-semibold transition-all duration-200"
        >
          Cancelar
        </a>
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-emerald-500 hover:bg-emerald-600 text-black text-xs uppercase px-8 py-3.5 tracking-widest font-extrabold transition-all duration-200 cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? 'SALVANDO ALTERAÇÕES...' : 'SALVAR ALTERAÇÕES'}
        </button>
      </div>
    </form>
  );
}
