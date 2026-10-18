import React, { useState } from "react";
import { marked } from "marked";
import { uploadFileToSupabase } from "../../lib/upload-helper";

interface CategoryField {
  name: string;
  gender: string;
  slots: number;
}

interface BatchField {
  name: string;
  price: string;
}

export default function NewEventForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [availableSlots, setAvailableSlots] = useState<number>(100);

  // Caso 4: Modalidade do evento
  const [eventType, setEventType] = useState("CORRIDA");

  // Caso 2: Localização e Google Maps
  const [location, setLocation] = useState("");
  const [locationUrl, setLocationUrl] = useState("");

  // Caso 3: Mídias (Banner, Logo, Trailer)
  const [bannerUrl, setBannerUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [trailerUrl, setTrailerUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // Estados do Contrato
  const [contractType, setContractType] = useState<"TEXT" | "PDF">("TEXT");
  const [contractText, setContractText] = useState("");
  const [contractFile, setContractFile] = useState<File | null>(null);

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

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      await (window as any).cyberAlert("Por favor, selecione um arquivo no formato PDF.");
      e.target.value = "";
      return;
    }

    setContractFile(file);
  };

  // Categorias Dinâmicas (inicia com 1 default)
  const [categories, setCategories] = useState<CategoryField[]>([
    { name: "Geral Misto", gender: "OPEN", slots: 100 },
  ]);

  // Lotes Dinâmicos (inicia com 1 default)
  const [batches, setBatches] = useState<BatchField[]>([
    { name: "1º Lote", price: "99.90" },
  ]);

  // Estados de Envio
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);

  // Adicionar/Remover Categoria
  const addCategory = () => {
    setCategories([...categories, { name: "", gender: "OPEN", slots: 50 }]);
  };

  const removeCategory = (index: number) => {
    if (categories.length === 1) return;
    setCategories(categories.filter((_, i) => i !== index));
  };

  const updateCategory = (
    index: number,
    key: keyof CategoryField,
    value: any,
  ) => {
    const updated = [...categories];
    updated[index] = { ...updated[index], [key]: value };
    setCategories(updated);
  };

  // Adicionar/Remover Lote
  const addBatch = () => {
    setBatches([...batches, { name: "", price: "" }]);
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

  // Enviar formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Front-end validations
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      setErrorMessage("A data do evento não pode ser retroativa.");
      return;
    }

    const totalCategorySlots = categories.reduce((sum, cat) => sum + Number(cat.slots || 0), 0);
    if (totalCategorySlots > availableSlots) {
      setErrorMessage(`A soma das vagas das categorias (${totalCategorySlots}) não pode ultrapassar o limite geral do evento (${availableSlots}).`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      // Obter token JWT do Clerk
      const clerk = (window as any).Clerk;
      if (!clerk || !clerk.session) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }
      const token = await clerk.session.getToken();

      setIsUploading(true);
      let finalBannerUrl = bannerUrl;
      let finalLogoUrl = logoUrl;
      let finalContractPdf = contractFile ? "" : null;

      if (bannerFile) {
        finalBannerUrl = await uploadFileToSupabase(bannerFile, "banners");
      }
      if (logoFile) {
        finalLogoUrl = await uploadFileToSupabase(logoFile, "logos");
      }
      if (contractFile && contractType === "PDF") {
        finalContractPdf = await uploadFileToSupabase(contractFile, "general");
      }
      setIsUploading(false);

      const payload = {
        title,
        description,
        date,
        availableSlots: Number(availableSlots),
        eventType,
        location,
        locationUrl,
        bannerUrl: finalBannerUrl,
        logoUrl: finalLogoUrl,
        trailerUrl,
        categories,
        batches: batches.map((b) => ({
          name: b.name,
          price: Number(b.price) || 0,
        })),
        contractText: contractType === "TEXT" ? contractText : null,
        contractPdf: contractType === "PDF" ? finalContractPdf : null,
      };

      const response = await fetch("/api/eventos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response
          .json()
          .catch(() => ({ message: "Erro desconhecido." }));
        throw new Error(errData.message || "Falha ao criar evento.");
      }

      setSuccessMessage("Competição criada com sucesso! Redirecionando...");

      setTimeout(() => {
        window.location.href = "/painel-organizador";
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || "Ocorreu um erro ao salvar o evento.");
      setIsSubmitting(false);
      
      fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: err.message,
          stack: err.stack,
          form: 'NewEventForm'
        })
      }).catch(() => {});
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full bg-surface-alt border border-ink-muted/20 p-6 md:p-8 relative shadow-sm"
    >
      <div className="absolute top-0 right-0 w-12 h-12 border-t border-r border-ink-muted/20 pointer-events-none"></div>

      <div className="mb-6">
        <h2 className="font-heading text-2xl font-bold text-ink uppercase tracking-wider">
          Novo Evento
        </h2>
        <p className="text-ink-muted text-xs md:text-sm mt-1 font-mono uppercase">
          Cadastre as informações da prova esportiva.
        </p>
      </div>

      {isUploading && (
        <div className="bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs md:text-sm font-mono p-4 mb-6 uppercase flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent animate-spin rounded-full inline-block"></span>
          Fazendo upload de arquivo...
        </div>
      )}

      {/* DADOS PRINCIPAIS DO EVENTO */}
      <div className="space-y-5 font-mono text-xs md:text-sm mb-8">
        <div className="space-y-2">
          <label
            htmlFor="title"
            className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink"
          >
            Título Oficial do Evento
          </label>
          <input
            type="text"
            id="title"
            required
            placeholder="EX: 10K RIO DE JANEIRO CORRIDA"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-surface border border-ink-muted/30 text-ink text-sm md:text-base px-4 py-3 outline-none focus:border-accent transition-colors uppercase placeholder:text-ink-muted/40"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label
              htmlFor="date"
              className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink"
            >
              Data & Horário do Evento
            </label>
            <input
              type="datetime-local"
              id="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-surface border border-ink-muted/30 text-ink text-sm md:text-base px-4 py-3 outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="eventType"
              className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink"
            >
              Modalidade do Evento
            </label>
            <select
              id="eventType"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full bg-surface border border-ink-muted/30 text-ink text-sm md:text-base px-4 py-3 outline-none focus:border-accent transition-colors uppercase appearance-none"
            >
              <option value="CORRIDA">Corrida de Rua</option>
              <option value="ULTRA_TRAIL">Ultra Trail / Trilha</option>
              <option value="CICLISMO">Ciclismo</option>
              <option value="MOUNTAIN_BIKE">Mountain Bike</option>
              <option value="TRIATHLON">Triathlon</option>
              <option value="DUATHLON">Duathlon</option>
              <option value="AVENTURA">Corrida de Aventura</option>
              <option value="OUTRO">Outra Modalidade</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="slots"
            className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink"
          >
            Limite Físico Geral de Vagas
          </label>
          <input
            type="number"
            id="slots"
            required
            min="1"
            value={availableSlots}
            onChange={(e) => setAvailableSlots(Number(e.target.value))}
            className="w-full bg-surface border border-ink-muted/30 text-ink text-sm md:text-base px-4 py-3 outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label
              htmlFor="location"
              className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink"
            >
              Endereço (Texto)
            </label>
            <input
              type="text"
              id="location"
              placeholder="EX: PRAÇA PRINCIPAL, CENTRO"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-surface border border-ink-muted/30 text-ink text-sm md:text-base px-4 py-3 outline-none focus:border-accent transition-colors uppercase placeholder:text-ink-muted/40"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="locationUrl"
              className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink"
            >
              Link Iframe Google Maps
            </label>
            <input
              type="text"
              id="locationUrl"
              placeholder="https://www.google.com/maps/embed?pb=..."
              value={locationUrl}
              onChange={(e) => setLocationUrl(e.target.value)}
              className="w-full bg-surface border border-ink-muted/30 text-ink text-sm md:text-base px-4 py-3 outline-none focus:border-accent transition-colors placeholder:text-ink-muted/40"
            />
          </div>
        </div>

        {/* MÍDIAS DO EVENTO */}
        <div className="space-y-4 pt-6 border-t border-ink-muted/20">
          <h3 className="font-heading text-base md:text-lg font-bold text-ink uppercase tracking-wider">
            Mídia e Identidade Visual
          </h3>

          <div className="space-y-2">
            <label
              htmlFor="bannerUrl"
              className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink"
            >
              Banner Principal (URL ou Upload)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="bannerUrl"
                placeholder="https://..."
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
                className="flex-grow bg-surface border border-ink-muted/30 text-ink text-sm md:text-base px-4 py-3 outline-none focus:border-accent transition-colors placeholder:text-ink-muted/40"
              />
              <label className="bg-surface border border-ink-muted/30 hover:border-accent text-ink text-xs md:text-sm px-4 py-3 cursor-pointer transition-colors uppercase flex items-center justify-center font-bold tracking-wider">
                Selecionar
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setBannerFile(file);
                      setBannerUrl(URL.createObjectURL(file));
                    }
                  }}
                />
              </label>
            </div>
            {bannerUrl && (
              <img
                src={bannerUrl}
                alt="Preview Banner"
                className="h-24 w-auto object-cover border border-ink-muted/20 mt-2"
              />
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="logoUrl"
              className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink"
            >
              Logo da Organização (URL ou Upload)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="logoUrl"
                placeholder="https://..."
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="flex-grow bg-surface border border-ink-muted/30 text-ink text-sm md:text-base px-4 py-3 outline-none focus:border-accent transition-colors placeholder:text-ink-muted/40"
              />
              <label className="bg-surface border border-ink-muted/30 hover:border-accent text-ink text-xs md:text-sm px-4 py-3 cursor-pointer transition-colors uppercase flex items-center justify-center font-bold tracking-wider">
                Selecionar
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setLogoFile(file);
                      setLogoUrl(URL.createObjectURL(file));
                    }
                  }}
                />
              </label>
            </div>
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Preview Logo"
                className="h-16 w-16 object-cover border border-ink-muted/20 mt-2 rounded-full"
              />
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="trailerUrl"
              className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink"
            >
              Trailer / Vídeo Promocional (YouTube Embed URL)
            </label>
            <input
              type="text"
              id="trailerUrl"
              placeholder="https://www.youtube.com/embed/..."
              value={trailerUrl}
              onChange={(e) => setTrailerUrl(e.target.value)}
              className="w-full bg-surface border border-ink-muted/30 text-ink text-sm md:text-base px-4 py-3 outline-none focus:border-accent transition-colors placeholder:text-ink-muted/40"
            />
          </div>
        </div>

        <div className="space-y-2 font-sans pt-6 border-t border-ink-muted/20">
          <label
            htmlFor="desc"
            className="text-xs md:text-sm font-mono uppercase block tracking-wider font-semibold text-ink"
          >
            Regulamento / Informações Básicas
          </label>
          <textarea
            id="desc"
            rows={4}
            placeholder="Insira detalhes sobre regulamento, local da largada, entrega de kits, premiação..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-surface border border-ink-muted/30 text-ink px-4 py-3 outline-none focus:border-accent transition-colors text-sm md:text-base placeholder:text-ink-muted/40"
          />
        </div>

        {/* CONTRATO / REGULAMENTO */}
        <div className="space-y-4 mb-8 border-t border-ink-muted/20 pt-6 font-sans">
          <div>
            <h3 className="font-heading text-base md:text-lg font-bold text-ink uppercase tracking-wider">
              Contrato / Regulamento Oficial
            </h3>
            <p className="text-ink-muted text-xs mt-1 font-mono uppercase">
              Escolha o formato do contrato. Se ambos forem deixados em branco,
              o contrato padrão será exibido.
            </p>
          </div>

          <div className="flex gap-6 font-mono text-xs md:text-sm mb-4">
            <label className="flex items-center gap-2 cursor-pointer text-ink font-semibold">
              <input
                type="radio"
                name="contractType"
                checked={contractType === "TEXT"}
                onChange={() => setContractType("TEXT")}
                className="accent-emerald-500"
              />
              Texto / Markdown
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-ink font-semibold">
              <input
                type="radio"
                name="contractType"
                checked={contractType === "PDF"}
                onChange={() => setContractType("PDF")}
                className="accent-emerald-500"
              />
              Upload de PDF
            </label>
          </div>

          {contractType === "TEXT" && (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label
                  htmlFor="contractText"
                  className="text-xs md:text-sm font-mono uppercase tracking-wider font-semibold text-ink"
                >
                  Texto do Regulamento
                </label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setShowMarkdownPreview(!showMarkdownPreview)}
                    className="text-xs font-mono text-ink-muted hover:text-ink uppercase tracking-wider cursor-pointer border border-ink-muted/30 hover:border-ink-muted px-2.5 py-1"
                  >
                    {showMarkdownPreview ? "Editar Texto" : "Preview Markdown"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSuggestContract}
                    className="text-xs font-mono text-emerald-600 dark:text-emerald-400 hover:opacity-80 uppercase tracking-wider cursor-pointer font-bold"
                  >
                    Sugerir Contrato Padrão
                  </button>
                </div>
              </div>
              
              {showMarkdownPreview ? (
                <div 
                  className="w-full bg-surface border border-ink-muted/20 p-4 max-h-64 overflow-y-auto text-ink text-xs md:text-sm font-sans markdown-body"
                  dangerouslySetInnerHTML={{ __html: marked.parse(contractText || 'Nenhum texto inserido.') }}
                />
              ) : (
                <textarea
                  id="contractText"
                  rows={6}
                  placeholder="Insira os termos de responsabilidade do evento, regras gerais, políticas de reembolso..."
                  value={contractText}
                  onChange={(e) => setContractText(e.target.value)}
                  className="w-full bg-surface border border-ink-muted/30 text-ink px-4 py-3 outline-none focus:border-accent transition-colors text-xs md:text-sm font-mono placeholder:text-ink-muted/40"
                />
              )}
            </div>
          )}

          {contractType === "PDF" && (
            <div className="space-y-2 font-mono">
              <label className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink">
                Arquivo PDF do Regulamento
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={handlePdfUpload}
                className="w-full bg-surface border border-ink-muted/30 text-ink px-4 py-3 outline-none focus:border-accent transition-colors text-xs md:text-sm"
              />
              {contractFile && (
                <div className="text-xs text-emerald-600 dark:text-emerald-400 uppercase mt-1 font-semibold">
                  ✓ PDF Selecionado: {contractFile.name} (Pronto para salvar)
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CATEGORIAS DO EVENTO */}
      <div className="space-y-4 mb-8">
        <div className="flex items-center justify-between border-b border-ink-muted/20 pb-3">
          <h3 className="font-heading text-base md:text-lg font-bold text-ink uppercase tracking-wider">
            Categorias Oficiais
          </h3>
          <button
            type="button"
            onClick={addCategory}
            className="text-xs md:text-sm font-mono text-emerald-600 dark:text-emerald-400 hover:opacity-80 uppercase tracking-widest cursor-pointer font-bold"
          >
            + Adicionar Categoria
          </button>
        </div>

        <div className="space-y-3">
          {categories.map((cat, index) => (
            <div
              key={index}
              className="bg-surface border border-ink-muted/20 p-4 md:p-5 flex flex-col md:flex-row gap-4 items-end font-mono text-xs md:text-sm"
            >
              <div className="flex-grow space-y-2 w-full">
                <label className="text-xs text-ink-muted uppercase tracking-wider font-semibold">
                  Nome da Categoria
                </label>
                <input
                  type="text"
                  required
                  placeholder="EX: ELITE MASCULINO"
                  value={cat.name}
                  onChange={(e) =>
                    updateCategory(index, "name", e.target.value)
                  }
                  className="w-full bg-surface-alt border border-ink-muted/30 text-ink text-sm px-3 py-2.5 outline-none focus:border-accent transition-colors uppercase placeholder:text-ink-muted/40"
                />
              </div>

              <div className="w-full md:w-48 space-y-2">
                <label className="text-xs text-ink-muted uppercase tracking-wider font-semibold">
                  Gênero Aceito
                </label>
                <select
                  value={cat.gender}
                  onChange={(e) =>
                    updateCategory(index, "gender", e.target.value)
                  }
                  className="w-full bg-surface-alt border border-ink-muted/30 text-ink text-sm px-3 py-2.5 outline-none focus:border-accent transition-colors"
                >
                  <option value="OPEN">MISTO / LIVRE</option>
                  <option value="MALE">MASCULINO</option>
                  <option value="FEMALE">FEMININO</option>
                </select>
              </div>

              <div className="w-full md:w-36 space-y-2">
                <label className="text-xs text-ink-muted uppercase tracking-wider font-semibold">
                  Vagas Específicas
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={cat.slots}
                  onChange={(e) =>
                    updateCategory(index, "slots", Number(e.target.value))
                  }
                  className="w-full bg-surface-alt border border-ink-muted/30 text-ink text-sm px-3 py-2.5 outline-none focus:border-accent transition-colors"
                />
              </div>

              {categories.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCategory(index)}
                  className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 px-3 py-2.5 hover:bg-red-500/20 transition-all text-xs uppercase tracking-wider cursor-pointer font-bold"
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
        <div className="flex items-center justify-between border-b border-ink-muted/20 pb-3">
          <h3 className="font-heading text-base md:text-lg font-bold text-ink uppercase tracking-wider">
            Lotes de Inscrição
          </h3>
          <button
            type="button"
            onClick={addBatch}
            className="text-xs md:text-sm font-mono text-emerald-600 dark:text-emerald-400 hover:opacity-80 uppercase tracking-widest cursor-pointer font-bold"
          >
            + Adicionar Lote
          </button>
        </div>

        <div className="space-y-3">
          {batches.map((bat, index) => (
            <div
              key={index}
              className="bg-surface border border-ink-muted/20 p-4 md:p-5 flex flex-col md:flex-row gap-4 items-end font-mono text-xs md:text-sm"
            >
              <div className="flex-grow space-y-2 w-full">
                <label className="text-xs text-ink-muted uppercase tracking-wider font-semibold">
                  Nome do Lote
                </label>
                <input
                  type="text"
                  required
                  placeholder="EX: LOTE PROMOCIONAL ou 2º LOTE"
                  value={bat.name}
                  onChange={(e) => updateBatch(index, "name", e.target.value)}
                  className="w-full bg-surface-alt border border-ink-muted/30 text-ink text-sm px-3 py-2.5 outline-none focus:border-accent transition-colors uppercase placeholder:text-ink-muted/40"
                />
              </div>

              <div className="w-full md:w-52 space-y-2">
                <label className="text-xs text-ink-muted uppercase tracking-wider font-semibold">
                  Preço Inscrição (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  placeholder="99.90"
                  value={bat.price}
                  onChange={(e) => updateBatch(index, "price", e.target.value)}
                  className="w-full bg-surface-alt border border-ink-muted/30 text-ink text-sm px-3 py-2.5 outline-none focus:border-accent transition-colors placeholder:text-ink-muted/40"
                />
              </div>

              {batches.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeBatch(index)}
                  className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 px-3 py-2.5 hover:bg-red-500/20 transition-all text-xs uppercase tracking-wider cursor-pointer font-bold"
                >
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs md:text-sm font-mono p-4 mb-6 uppercase">
          ✕ {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs md:text-sm font-mono p-4 mb-6 uppercase flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
          {successMessage}
        </div>
      )}

      <div className="pt-6 border-t border-ink-muted/20 flex items-center justify-between font-mono">
        <a
          href="/painel-organizador"
          className="border border-ink-muted/30 hover:border-ink-muted text-ink-muted hover:text-ink text-xs md:text-sm uppercase px-6 py-3 tracking-widest font-semibold transition-all duration-200"
        >
          Cancelar
        </a>
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-emerald-500 hover:bg-emerald-600 text-black text-xs md:text-sm uppercase px-8 py-3.5 tracking-widest font-extrabold transition-all duration-200 cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? "SALVANDO EVENTO..." : "PUBLICAR COMPETIÇÃO"}
        </button>
      </div>
    </form>
  );
}
