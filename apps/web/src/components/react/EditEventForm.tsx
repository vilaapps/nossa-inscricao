import React, { useState } from "react";
import { marked } from "marked";
import { uploadFileToSupabase } from "../../lib/upload-helper";
import { validateEventPayload, validateBatchPlan, sanitizeGoogleMapsEmbedUrl, sanitizeYouTubeEmbedUrl } from "@syncflow/shared";

interface BatchField {
  id?: string;
  name: string;
  type: 'DATE' | 'QUANTITY';
  position: number;
  price: string;
  startDate?: string;
  endDate?: string;
  maxQuantity?: number | '';
}

interface CategoryField {
  id?: string;
  name: string;
  gender: string;
  minAge?: number | '';
  maxAge?: number | '';
  slots: number;
  batches: BatchField[];
}

interface EditEventFormProps {
  event: {
    id: string;
    title: string;
    description: string | null;
    date: Date | string;
    registrationOpensAt?: Date | string | null;
    hasKit?: boolean;
    kitSizes?: string[];
    adminFeeRate?: string | number | null;
    availableSlots: number;
    eventType: string;
    location: string | null;
    locationUrl: string | null;
    bannerUrl: string | null;
    logoUrl: string | null;
    trailerUrl: string | null;
    contractText: string | null;
    contractPdf: string | null;
    categories: Array<{
      id?: string;
      name: string;
      gender: string;
      minAge?: number | null;
      maxAge?: number | null;
      totalSlots?: number;
      availableSlots: number;
      batches?: Array<{
        id?: string;
        name: string;
        type?: string;
        position?: number;
        price: any;
        startDate?: string | null;
        endDate?: string | null;
        maxQuantity?: number | null;
      }>;
    }>;
    batches: Array<{
      id?: string;
      name: string;
      type?: string;
      position?: number;
      price: any;
      startDate?: string | null;
      endDate?: string | null;
      maxQuantity?: number | null;
    }>;
  };
  isAdmin?: boolean;
}

const AVAILABLE_KIT_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];

export default function EditEventForm({ event, isAdmin = false }: EditEventFormProps) {
  const formatDatetimeLocal = (dateVal: string | Date | null | undefined) => {
    if (!dateVal) return "";
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const parseDecimal = (val: any) => {
    if (typeof val === "string" || typeof val === "number") return String(val);
    if (val && typeof val === "object" && "d" in val) {
      return val.d ? val.d.join("") : "0";
    }
    return String(val || "0");
  };

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description || "");
  const [date, setDate] = useState(formatDatetimeLocal(event.date));
  const [registrationOpensAt, setRegistrationOpensAt] = useState(formatDatetimeLocal(event.registrationOpensAt));
  const [availableSlots, setAvailableSlots] = useState(event.availableSlots);
  const [eventType, setEventType] = useState(event.eventType || "CORRIDA");
  const [adminFeeRate, setAdminFeeRate] = useState<string>(
    event.adminFeeRate !== null && event.adminFeeRate !== undefined ? String(event.adminFeeRate) : ""
  );

  // Kit / Camiseta
  const [hasKit, setHasKit] = useState(Boolean(event.hasKit));
  const [kitSizes, setKitSizes] = useState<string[]>(
    event.kitSizes && event.kitSizes.length > 0 ? event.kitSizes : ['P', 'M', 'G', 'GG']
  );

  const [location, setLocation] = useState(event.location || "");
  const [locationUrl, setLocationUrl] = useState(
    sanitizeGoogleMapsEmbedUrl(event.locationUrl) || event.locationUrl || ""
  );
  const [bannerUrl, setBannerUrl] = useState(event.bannerUrl || "");
  const [logoUrl, setLogoUrl] = useState(event.logoUrl || "");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [trailerUrl, setTrailerUrl] = useState(
    sanitizeYouTubeEmbedUrl(event.trailerUrl) || event.trailerUrl || ""
  );
  const [isUploading, setIsUploading] = useState(false);

  // Estados do Contrato
  const [contractType, setContractType] = useState<"TEXT" | "PDF">(
    event.contractPdf ? "PDF" : "TEXT"
  );
  const [contractText, setContractText] = useState(event.contractText || "");
  const [contractFile, setContractFile] = useState<File | null>(null);

  const toggleKitSize = (size: string) => {
    if (kitSizes.includes(size)) {
      setKitSizes(kitSizes.filter((s) => s !== size));
    } else {
      setKitSizes([...kitSizes, size]);
    }
  };

  // Categorias Dinâmicas com Lotes
  const [categories, setCategories] = useState<CategoryField[]>(() => {
    if (event.categories && event.categories.length > 0) {
      return event.categories.map((cat) => {
        const sourceBatches = cat.batches && cat.batches.length > 0 ? cat.batches : event.batches || [];
        return {
          id: cat.id,
          name: cat.name,
          gender: cat.gender || 'MISTO',
          minAge: cat.minAge !== null && cat.minAge !== undefined ? cat.minAge : '',
          maxAge: cat.maxAge !== null && cat.maxAge !== undefined ? cat.maxAge : '',
          slots: cat.totalSlots || cat.availableSlots || 50,
          batches: sourceBatches.map((b, idx) => ({
            id: b.id,
            name: b.name,
            type: (b.type as 'DATE' | 'QUANTITY') || 'DATE',
            position: b.position || (idx + 1),
            price: parseDecimal(b.price),
            startDate: formatDatetimeLocal(b.startDate),
            endDate: formatDatetimeLocal(b.endDate),
            maxQuantity: b.maxQuantity !== null && b.maxQuantity !== undefined ? b.maxQuantity : '',
          })),
        };
      });
    }

    return [
      {
        name: "Geral Misto",
        gender: "MISTO",
        minAge: '',
        maxAge: '',
        slots: event.availableSlots || 100,
        batches: [
          {
            name: "1º Lote",
            type: "DATE",
            position: 1,
            price: "99.90",
            startDate: "",
            endDate: "",
          },
        ],
      },
    ];
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);

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
      alert("Por favor, selecione um arquivo no formato PDF.");
      e.target.value = "";
      return;
    }

    setContractFile(file);
  };

  const addCategory = () => {
    setCategories([
      ...categories,
      {
        name: "",
        gender: "MISTO",
        minAge: '',
        maxAge: '',
        slots: 50,
        batches: [
          {
            name: "1º Lote",
            type: "DATE",
            position: 1,
            price: "99.90",
            startDate: registrationOpensAt || "",
            endDate: date || "",
          },
        ],
      },
    ]);
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

  const addBatchToCategory = (catIndex: number) => {
    const cat = categories[catIndex];
    const newPosition = cat.batches.length + 1;
    const newBatch: BatchField = {
      name: `${newPosition}º Lote`,
      type: "DATE",
      position: newPosition,
      price: "",
      startDate: "",
      endDate: date || "",
    };
    const updated = [...categories];
    updated[catIndex].batches = [...cat.batches, newBatch];
    setCategories(updated);
  };

  const removeBatchFromCategory = (catIndex: number, batchIndex: number) => {
    const cat = categories[catIndex];
    if (cat.batches.length === 1) return;
    const updatedBatches = cat.batches
      .filter((_, bIdx) => bIdx !== batchIndex)
      .map((b, idx) => ({ ...b, position: idx + 1 }));
    const updated = [...categories];
    updated[catIndex].batches = updatedBatches;
    setCategories(updated);
  };

  const updateCategoryBatch = (
    catIndex: number,
    batchIndex: number,
    key: keyof BatchField,
    value: any,
  ) => {
    const updated = [...categories];
    const targetBatch = { ...updated[catIndex].batches[batchIndex], [key]: value };
    updated[catIndex].batches[batchIndex] = targetBatch;
    setCategories(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validação com regras compartilhadas
    const payloadValidation = validateEventPayload({
      name: title,
      date,
      registrationOpensAt: registrationOpensAt || null,
      hasKit,
      kitSizes,
      adminFeeRate: adminFeeRate !== '' ? Number(adminFeeRate) : null,
    });

    if (!payloadValidation.valid) {
      setErrorMessage(payloadValidation.errors.join(' '));
      return;
    }

    const totalCategorySlots = categories.reduce((sum, cat) => sum + Number(cat.slots || 0), 0);
    if (totalCategorySlots > availableSlots) {
      setErrorMessage(`A soma das vagas das categorias (${totalCategorySlots}) não pode ultrapassar o limite geral do evento (${availableSlots}).`);
      return;
    }

    for (const cat of categories) {
      const planResult = validateBatchPlan(
        cat.batches.map((b, bIdx) => ({
          name: b.name,
          type: b.type,
          position: b.position || (bIdx + 1),
          price: Number(b.price || 0),
          startDate: b.startDate || null,
          endDate: b.endDate || null,
          maxQuantity: b.maxQuantity ? Number(b.maxQuantity) : null,
        })),
        {
          name: cat.name,
          totalSlots: Number(cat.slots),
        },
        {
          date,
          registrationOpensAt: registrationOpensAt || null,
        },
      );

      if (!planResult.valid) {
        setErrorMessage(`Categoria "${cat.name}": ${planResult.errors.join(' ')}`);
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const clerk = (window as any).Clerk;
      if (!clerk || !clerk.session) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }
      const token = await clerk.session.getToken();

      setIsUploading(true);
      let finalBannerUrl = bannerUrl;
      let finalLogoUrl = logoUrl;
      let finalContractPdf = contractFile ? "" : (event.contractPdf || null);

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
        eventId: event.id,
        title,
        description,
        date,
        registrationOpensAt: registrationOpensAt || null,
        availableSlots: Number(availableSlots),
        eventType,
        adminFeeRate: adminFeeRate !== '' ? Number(adminFeeRate) : null,
        hasKit,
        kitSizes: hasKit ? kitSizes : [],
        location,
        locationUrl: sanitizeGoogleMapsEmbedUrl(locationUrl),
        bannerUrl: finalBannerUrl,
        logoUrl: finalLogoUrl,
        trailerUrl: sanitizeYouTubeEmbedUrl(trailerUrl),
        contractText: contractType === "TEXT" ? contractText : null,
        contractPdf: contractType === "PDF" ? finalContractPdf : null,
        categories: categories.map((cat) => ({
          id: cat.id,
          name: cat.name,
          gender: cat.gender,
          minAge: cat.minAge !== '' && cat.minAge !== undefined ? Number(cat.minAge) : null,
          maxAge: cat.maxAge !== '' && cat.maxAge !== undefined ? Number(cat.maxAge) : null,
          slots: Number(cat.slots),
          batches: cat.batches.map((b, idx) => ({
            id: b.id,
            name: b.name,
            type: b.type,
            position: b.position || (idx + 1),
            price: b.price,
            startDate: b.startDate || null,
            endDate: b.endDate || null,
            maxQuantity: b.maxQuantity ? Number(b.maxQuantity) : null,
          })),
        })),
        batches: categories.flatMap((c) => c.batches).map((b, idx) => ({
          id: b.id,
          name: b.name,
          type: b.type,
          position: b.position || (idx + 1),
          price: b.price,
          startDate: b.startDate || null,
          endDate: b.endDate || null,
          maxQuantity: b.maxQuantity ? Number(b.maxQuantity) : null,
        })),
      };

      const res = await fetch("/api/admin/eventos/editar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro desconhecido ao atualizar evento.");
      }

      setSuccessMessage("Evento atualizado com sucesso!");
      setTimeout(() => {
        window.location.href = isAdmin ? "/admin/dashboard" : "/painel-organizador";
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || "Ocorreu um erro ao atualizar.");
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
      <div>
        <h2 className="font-heading text-lg md:text-xl font-bold uppercase tracking-wider text-ink">
          Editar Evento Esportivo
        </h2>
        <p className="font-mono text-xs text-ink-muted uppercase mt-1">
          Ajuste as informações da prova, kits, taxas, categorias e lotes de inscrição.
        </p>
      </div>

      {isUploading && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs md:text-sm font-mono p-4 mb-6 uppercase flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-emerald-500 border-t-transparent animate-spin rounded-full inline-block"></span>
          Fazendo upload de arquivo...
        </div>
      )}

      {/* DADOS PRINCIPAIS DO EVENTO */}
      <div className="space-y-5 font-mono text-xs md:text-sm mb-8">
        <div className="space-y-2">
          <label htmlFor="title" className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink">
            Título Oficial do Evento
          </label>
          <input
            type="text"
            id="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-surface border border-ink-muted/30 text-ink text-sm md:text-base px-4 py-3 outline-none focus:border-accent transition-colors uppercase placeholder:text-ink-muted/40"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label htmlFor="date" className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink">
              Data & Horário da Prova
            </label>
            <input
              type="datetime-local"
              id="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-4 py-3 outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="registrationOpensAt" className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink">
              Abertura das Inscrições
            </label>
            <input
              type="datetime-local"
              id="registrationOpensAt"
              value={registrationOpensAt}
              onChange={(e) => setRegistrationOpensAt(e.target.value)}
              className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-4 py-3 outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="eventType" className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink">
              Modalidade
            </label>
            <select
              id="eventType"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-4 py-3 outline-none focus:border-accent transition-colors uppercase appearance-none"
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="slots" className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink">
              Limite Geral de Vagas do Evento
            </label>
            <input
              type="number"
              id="slots"
              required
              min="1"
              value={availableSlots}
              onChange={(e) => setAvailableSlots(Number(e.target.value))}
              className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-4 py-3 outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="adminFeeRate" className="text-xs md:text-sm uppercase block tracking-wider font-semibold text-ink">
              Taxa Administrativa (%) — Opcional
            </label>
            <input
              type="number"
              id="adminFeeRate"
              min="0"
              max="100"
              step="0.1"
              placeholder="Padrão do tenant (digite 0 para isentar)"
              value={adminFeeRate}
              onChange={(e) => setAdminFeeRate(e.target.value)}
              className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-4 py-3 outline-none focus:border-accent transition-colors placeholder:text-ink-muted/40"
            />
            <span className="text-[10px] text-ink-muted block">
              Se preenchido com 0%, nenhuma taxa administrativa será repassada aos participantes.
            </span>
          </div>
        </div>

        {/* CONFIGURAÇÃO DE KIT / CAMISETA */}
        <div className="border border-ink-muted/20 bg-surface/50 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="hasKit"
              checked={hasKit}
              onChange={(e) => setHasKit(e.target.checked)}
              className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
            />
            <label htmlFor="hasKit" className="text-xs md:text-sm uppercase tracking-wider font-bold text-ink cursor-pointer">
              Este evento possui Kit do Atleta / Camiseta
            </label>
          </div>

          {hasKit && (
            <div className="space-y-2 pt-2 border-t border-ink-muted/20">
              <label className="text-xs text-ink-muted uppercase tracking-wider font-semibold block">
                Tamanhos de camiseta disponíveis para escolha no momento da inscrição:
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_KIT_SIZES.map((size) => {
                  const selected = kitSizes.includes(size);
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => toggleKitSize(size)}
                      className={`px-4 py-2 text-xs font-mono font-bold tracking-wider uppercase border transition-all cursor-pointer ${
                        selected
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500"
                          : "bg-surface border-ink-muted/30 text-ink-muted hover:border-ink-muted"
                      }`}
                    >
                      {selected ? `✓ ${size}` : size}
                    </button>
                  );
                })}
              </div>
              {kitSizes.length === 0 && (
                <span className="text-xs text-red-500">Selecione ao menos um tamanho de camiseta.</span>
              )}
            </div>
          )}
        </div>

        {/* LOCALIZAÇÃO */}
        <div className="space-y-4 pt-4 border-t border-ink-muted/20">
          <h3 className="font-heading text-sm md:text-base font-bold text-ink uppercase tracking-wider">
            Localização da Prova
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="location" className="text-xs uppercase block tracking-wider font-semibold text-ink">
                Endereço / Local por Extenso
              </label>
              <input
                type="text"
                id="location"
                placeholder="EX: ATERRO DO FLAMENGO, POSTO 2, RIO DE JANEIRO"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-4 py-3 outline-none focus:border-accent transition-colors uppercase placeholder:text-ink-muted/40"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="locationUrl" className="text-xs uppercase block tracking-wider font-semibold text-ink">
                Link ou Embed do Google Maps (Opcional)
              </label>
              <input
                type="text"
                id="locationUrl"
                placeholder="https://maps.google.com/... ou <iframe src='...'></iframe>"
                value={locationUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  const sanitized = sanitizeGoogleMapsEmbedUrl(val);
                  setLocationUrl(val.includes("<iframe") && sanitized ? sanitized : val);
                }}
                onBlur={() => {
                  const sanitized = sanitizeGoogleMapsEmbedUrl(locationUrl);
                  if (sanitized) setLocationUrl(sanitized);
                }}
                className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-4 py-3 outline-none focus:border-accent transition-colors placeholder:text-ink-muted/40 font-mono"
              />
              <p className="text-[11px] text-ink-muted font-mono">
                Aceita link direto ou a tag completa de incorporação (&lt;iframe&gt;). O mapa será extraído automaticamente.
              </p>
            </div>
          </div>
        </div>

        {/* MÍDIAS */}
        <div className="space-y-4 pt-4 border-t border-ink-muted/20">
          <h3 className="font-heading text-sm md:text-base font-bold text-ink uppercase tracking-wider">
            Mídias e Identidade Visual
          </h3>
          <div className="space-y-2">
            <label htmlFor="bannerUrl" className="text-xs uppercase block tracking-wider font-semibold text-ink">
              Banner Principal do Evento (URL ou Upload)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="bannerUrl"
                placeholder="https://..."
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
                className="flex-grow bg-surface border border-ink-muted/30 text-ink text-sm px-4 py-3 outline-none focus:border-accent transition-colors placeholder:text-ink-muted/40"
              />
              <label className="bg-surface border border-ink-muted/30 hover:border-accent text-ink text-xs px-4 py-3 cursor-pointer transition-colors uppercase flex items-center justify-center font-bold tracking-wider">
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
              <img src={bannerUrl} alt="Preview Banner" className="h-24 w-auto object-cover border border-ink-muted/20 mt-2" />
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="logoUrl" className="text-xs uppercase block tracking-wider font-semibold text-ink">
              Logo da Organização (URL ou Upload)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="logoUrl"
                placeholder="https://..."
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="flex-grow bg-surface border border-ink-muted/30 text-ink text-sm px-4 py-3 outline-none focus:border-accent transition-colors placeholder:text-ink-muted/40"
              />
              <label className="bg-surface border border-ink-muted/30 hover:border-accent text-ink text-xs px-4 py-3 cursor-pointer transition-colors uppercase flex items-center justify-center font-bold tracking-wider">
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
              <img src={logoUrl} alt="Preview Logo" className="h-16 w-16 object-cover border border-ink-muted/20 mt-2 rounded-full" />
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="trailerUrl" className="text-xs uppercase block tracking-wider font-semibold text-ink">
              Trailer / Vídeo Promocional (YouTube URL ou Embed)
            </label>
            <input
              type="text"
              id="trailerUrl"
              placeholder="https://www.youtube.com/watch?v=... ou <iframe src='...'></iframe>"
              value={trailerUrl}
              onChange={(e) => {
                const val = e.target.value;
                const sanitized = sanitizeYouTubeEmbedUrl(val);
                setTrailerUrl(val.includes("<iframe") && sanitized ? sanitized : val);
              }}
              onBlur={() => {
                const sanitized = sanitizeYouTubeEmbedUrl(trailerUrl);
                if (sanitized) setTrailerUrl(sanitized);
              }}
              className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-4 py-3 outline-none focus:border-accent transition-colors placeholder:text-ink-muted/40 font-mono"
            />
            <p className="text-[11px] text-ink-muted font-mono">
              Aceita link comum do YouTube (watch, share, shorts) ou código de incorporação (&lt;iframe&gt;).
            </p>
          </div>
        </div>

        {/* REGULAMENTO E CONTRATO */}
        <div className="space-y-4 pt-4 border-t border-ink-muted/20">
          <h3 className="font-heading text-sm md:text-base font-bold text-ink uppercase tracking-wider">
            Regulamento e Termos de Inscrição
          </h3>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="contractType"
                checked={contractType === "TEXT"}
                onChange={() => setContractType("TEXT")}
                className="accent-emerald-500"
              />
              <span>Escrever Termos / Markdown</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="contractType"
                checked={contractType === "PDF"}
                onChange={() => setContractType("PDF")}
                className="accent-emerald-500"
              />
              <span>Upload de Arquivo PDF</span>
            </label>
          </div>

          {contractType === "TEXT" && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-ink-muted uppercase tracking-wider font-semibold">Texto do Regulamento</span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowMarkdownPreview(!showMarkdownPreview)}
                    className="text-xs text-accent hover:underline uppercase"
                  >
                    {showMarkdownPreview ? "Editar Texto" : "Visualizar Markdown"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSuggestContract}
                    className="text-xs text-emerald-400 hover:underline uppercase font-bold"
                  >
                    Sugerir Modelo Padrão
                  </button>
                </div>
              </div>

              {showMarkdownPreview ? (
                <div
                  className="w-full bg-surface border border-ink-muted/20 p-4 max-h-64 overflow-y-auto text-ink text-xs font-sans markdown-body"
                  dangerouslySetInnerHTML={{ __html: marked.parse(contractText || 'Nenhum texto inserido.') }}
                />
              ) : (
                <textarea
                  rows={6}
                  placeholder="Insira as regras, termos de responsabilidade..."
                  value={contractText}
                  onChange={(e) => setContractText(e.target.value)}
                  className="w-full bg-surface border border-ink-muted/30 text-ink px-4 py-3 outline-none focus:border-accent transition-colors text-xs placeholder:text-ink-muted/40 font-mono"
                />
              )}
            </div>
          )}

          {contractType === "PDF" && (
            <div className="space-y-2">
              <label className="text-xs text-ink-muted uppercase tracking-wider font-semibold block">
                Arquivo PDF do Regulamento
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={handlePdfUpload}
                className="w-full bg-surface border border-ink-muted/30 text-ink px-4 py-3 outline-none focus:border-accent transition-colors text-xs"
              />
              {contractFile ? (
                <div className="text-xs text-emerald-400 font-semibold uppercase mt-1">
                  ✓ Novo PDF Selecionado: {contractFile.name}
                </div>
              ) : event.contractPdf ? (
                <div className="text-xs text-ink-muted font-semibold uppercase mt-1">
                  Arquivo atual cadastrado disponível.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* CATEGORIAS E SEUS LOTES */}
      <div className="space-y-6 mb-8 border-t border-ink-muted/20 pt-6">
        <div className="flex items-center justify-between border-b border-ink-muted/20 pb-3">
          <div>
            <h3 className="font-heading text-base md:text-lg font-bold text-ink uppercase tracking-wider">
              Categorias e Lotes de Inscrição
            </h3>
            <p className="font-mono text-xs text-ink-muted uppercase mt-0.5">
              Cada categoria define seus critérios (gênero, faixa etária) e seus lotes (por data ou por quantidade de vagas).
            </p>
          </div>
          <button
            type="button"
            onClick={addCategory}
            className="text-xs md:text-sm font-mono text-emerald-400 hover:text-emerald-300 uppercase tracking-widest cursor-pointer font-bold"
          >
            + Adicionar Categoria
          </button>
        </div>

        <div className="space-y-6">
          {categories.map((cat, catIdx) => (
            <div
              key={catIdx}
              className="bg-surface border border-ink-muted/20 p-5 space-y-4 font-mono text-xs md:text-sm"
            >
              <div className="flex items-center justify-between border-b border-ink-muted/10 pb-3">
                <span className="font-bold text-accent uppercase tracking-wider">
                  Categoria #{catIdx + 1}
                </span>
                {categories.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCategory(catIdx)}
                    className="text-red-400 hover:text-red-300 text-xs uppercase font-bold tracking-wider"
                  >
                    Excluir Categoria
                  </button>
                )}
              </div>

              {/* DADOS DA CATEGORIA */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs text-ink-muted uppercase tracking-wider font-semibold">
                    Nome da Categoria
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="EX: 10KM GERAL"
                    value={cat.name}
                    onChange={(e) => updateCategory(catIdx, "name", e.target.value)}
                    className="w-full bg-surface-alt border border-ink-muted/30 text-ink text-sm px-3 py-2 outline-none focus:border-accent transition-colors uppercase placeholder:text-ink-muted/40"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-ink-muted uppercase tracking-wider font-semibold">
                    Gênero Aceito
                  </label>
                  <select
                    value={cat.gender}
                    onChange={(e) => updateCategory(catIdx, "gender", e.target.value)}
                    className="w-full bg-surface-alt border border-ink-muted/30 text-ink text-sm px-3 py-2 outline-none focus:border-accent transition-colors"
                  >
                    <option value="MISTO">MISTO / LIVRE</option>
                    <option value="MASCULINO">MASCULINO</option>
                    <option value="FEMININO">FEMININO</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-ink-muted uppercase tracking-wider font-semibold">
                    Vagas da Categoria
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={cat.slots}
                    onChange={(e) => updateCategory(catIdx, "slots", Number(e.target.value))}
                    className="w-full bg-surface-alt border border-ink-muted/30 text-ink text-sm px-3 py-2 outline-none focus:border-accent transition-colors"
                  />
                </div>
              </div>

              {/* CRITÉRIOS DE IDADE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface-alt/40 p-3 border border-ink-muted/10">
                <div className="space-y-1">
                  <label className="text-xs text-ink-muted uppercase tracking-wider font-semibold">
                    Idade Mínima na data da prova (Opcional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    placeholder="Sem restrição (ex: 18)"
                    value={cat.minAge}
                    onChange={(e) => updateCategory(catIdx, "minAge", e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-3 py-2 outline-none focus:border-accent transition-colors"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-ink-muted uppercase tracking-wider font-semibold">
                    Idade Máxima na data da prova (Opcional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    placeholder="Sem restrição (ex: 99)"
                    value={cat.maxAge}
                    onChange={(e) => updateCategory(catIdx, "maxAge", e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-3 py-2 outline-none focus:border-accent transition-colors"
                  />
                </div>
              </div>

              {/* LOTES DA CATEGORIA */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold text-ink-muted tracking-wider">
                    Lotes desta Categoria ({cat.batches.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => addBatchToCategory(catIdx)}
                    className="text-xs font-mono text-emerald-400 hover:text-emerald-300 uppercase font-bold"
                  >
                    + Adicionar Lote
                  </button>
                </div>

                <div className="space-y-3">
                  {cat.batches.map((batch, bIdx) => (
                    <div
                      key={bIdx}
                      className="border border-ink-muted/20 bg-surface-alt/60 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                          Lote {batch.position}
                        </span>
                        {cat.batches.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeBatchFromCategory(catIdx, bIdx)}
                            className="text-red-400 hover:text-red-300 text-xs uppercase font-bold"
                          >
                            Remover Lote
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        {/* Linha 1: Nome do Lote (ampliado) e Preço */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="space-y-1 md:col-span-8">
                            <label className="text-xs text-ink-muted uppercase font-semibold block">
                              Nome do Lote
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="1º Lote"
                              value={batch.name}
                              onChange={(e) => updateCategoryBatch(catIdx, bIdx, "name", e.target.value)}
                              className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-3.5 py-2.5 outline-none focus:border-accent transition-colors uppercase"
                            />
                          </div>

                          <div className="space-y-1 md:col-span-4">
                            <label className="text-xs text-ink-muted uppercase font-semibold block">
                              Preço (R$)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              required
                              placeholder="99.90 (0 = Grátis)"
                              value={batch.price}
                              onChange={(e) => updateCategoryBatch(catIdx, bIdx, "price", e.target.value)}
                              className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-3.5 py-2.5 outline-none focus:border-accent transition-colors font-mono"
                            />
                          </div>
                        </div>

                        {/* Linha 2: Tipo de Virada e Datas/Vagas (100% contido, sem overflow) */}
                        {batch.type === 'DATE' ? (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="text-xs text-ink-muted uppercase font-semibold block">
                                Tipo de Virada
                              </label>
                              <select
                                value={batch.type}
                                onChange={(e) => updateCategoryBatch(catIdx, bIdx, "type", e.target.value as 'DATE' | 'QUANTITY')}
                                className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-3.5 py-2.5 outline-none focus:border-accent transition-colors"
                              >
                                <option value="DATE">Por Data (Período)</option>
                                <option value="QUANTITY">Por Quantidade de Vagas</option>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs text-ink-muted uppercase font-semibold block">
                                Data Início do Lote
                              </label>
                              <input
                                type="datetime-local"
                                required
                                value={batch.startDate || ''}
                                onChange={(e) => updateCategoryBatch(catIdx, bIdx, "startDate", e.target.value)}
                                className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-3.5 py-2.5 outline-none focus:border-accent transition-colors font-mono"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs text-ink-muted uppercase font-semibold block">
                                Data Término do Lote
                              </label>
                              <input
                                type="datetime-local"
                                required
                                value={batch.endDate || ''}
                                onChange={(e) => updateCategoryBatch(catIdx, bIdx, "endDate", e.target.value)}
                                className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-3.5 py-2.5 outline-none focus:border-accent transition-colors font-mono"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-xs text-ink-muted uppercase font-semibold block">
                                Tipo de Virada
                              </label>
                              <select
                                value={batch.type}
                                onChange={(e) => updateCategoryBatch(catIdx, bIdx, "type", e.target.value as 'DATE' | 'QUANTITY')}
                                className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-3.5 py-2.5 outline-none focus:border-accent transition-colors"
                              >
                                <option value="DATE">Por Data (Período)</option>
                                <option value="QUANTITY">Por Quantidade de Vagas</option>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs text-ink-muted uppercase font-semibold block">
                                Vagas Máximas no Lote
                              </label>
                              <input
                                type="number"
                                min="1"
                                max={cat.slots}
                                required
                                placeholder={`Máx ${cat.slots}`}
                                value={batch.maxQuantity || ''}
                                onChange={(e) => updateCategoryBatch(catIdx, bIdx, "maxQuantity", e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full bg-surface border border-ink-muted/30 text-ink text-sm px-3.5 py-2.5 outline-none focus:border-accent transition-colors font-mono"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs md:text-sm font-mono p-4 mb-6 uppercase">
          ✕ {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs md:text-sm font-mono p-4 mb-6 uppercase flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
          {successMessage}
        </div>
      )}

      <div className="pt-6 border-t border-ink-muted/20 flex items-center justify-between font-mono">
        <a
          href={isAdmin ? "/admin/dashboard" : "/painel-organizador"}
          className="border border-ink-muted/30 hover:border-ink-muted text-ink-muted hover:text-ink text-xs md:text-sm uppercase px-6 py-3 tracking-widest font-semibold transition-all duration-200"
        >
          Cancelar
        </a>
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-emerald-500 hover:bg-emerald-600 text-black text-xs md:text-sm uppercase px-8 py-3.5 tracking-widest font-extrabold transition-all duration-200 cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? "SALVANDO ALTERAÇÕES..." : "SALVAR ALTERAÇÕES"}
        </button>
      </div>
    </form>
  );
}
