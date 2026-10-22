import React, { useState, useEffect } from 'react';

interface EventRegistrationCtaProps {
  eventId: string;
  isLoggedIn: boolean;
  isClosed: boolean;
  closedReason?: string;
  opensAt?: string | null;
}

export default function EventRegistrationCta({
  eventId,
  isLoggedIn,
  isClosed,
  closedReason,
  opensAt,
}: EventRegistrationCtaProps) {
  const calculateTimeLeft = () => {
    if (!opensAt) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
    }
    const diff = new Date(opensAt).getTime() - Date.now();
    if (diff <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    return { days, hours, minutes, seconds, isPast: false };
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft);

  useEffect(() => {
    if (!opensAt || timeLeft.isPast) return;

    const interval = setInterval(() => {
      const updated = calculateTimeLeft();
      setTimeLeft(updated);
      if (updated.isPast) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [opensAt, timeLeft.isPast]);

  // Se o evento está explicitamente encerrado ou com vagas esgotadas
  if (isClosed) {
    return (
      <div className="space-y-2">
        <div className="w-full bg-surface border border-red-500/30 text-red-400 font-mono text-xs uppercase py-4 tracking-widest font-extrabold text-center block cursor-not-allowed select-none">
          ✕ {closedReason || 'Inscrições Encerradas'}
        </div>
        <span className="block text-center text-[11px] text-ink-muted font-mono uppercase">
          Não é mais possível se inscrever nesta competição
        </span>
      </div>
    );
  }

  // Se a abertura ainda não chegou (contagem regressiva)
  if (opensAt && !timeLeft.isPast) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeDisplay =
      timeLeft.days > 0
        ? `${timeLeft.days}D ${pad(timeLeft.hours)}H ${pad(timeLeft.minutes)}M ${pad(timeLeft.seconds)}S`
        : `${pad(timeLeft.hours)}H ${pad(timeLeft.minutes)}M ${pad(timeLeft.seconds)}S`;

    return (
      <div className="space-y-3 font-mono">
        <div className="w-full bg-surface-alt border border-ink-muted/30 text-ink-muted font-mono text-xs uppercase py-4 px-3 tracking-wider font-extrabold text-center block cursor-not-allowed select-none transition-all">
          <div className="flex items-center justify-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <span>Abre em: {timeDisplay}</span>
          </div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 p-3 text-center text-xs text-amber-500 dark:text-amber-400 font-mono uppercase">
          Abertura em{' '}
          {new Date(opensAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    );
  }

  // Inscrições abertas
  if (isLoggedIn) {
    return (
      <div className="space-y-2 font-mono">
        <a
          href={`/inscricao/${eventId}`}
          className="block w-full text-center bg-emerald-500 hover:bg-emerald-600 text-black font-mono text-xs uppercase py-4 tracking-widest font-extrabold transition-all duration-200 shadow-sm"
        >
          Fazer Inscrição
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2 font-mono">
      <button
        type="button"
        onClick={() => {
          if ((window as any).Clerk) {
            (window as any).Clerk.openSignIn({
              forceRedirectUrl: `/inscricao/${eventId}`,
            });
          } else {
            window.location.href = `/inscricao/${eventId}`;
          }
        }}
        className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-mono text-xs uppercase py-4 tracking-widest font-extrabold transition-all duration-200 text-center cursor-pointer shadow-sm"
      >
        Login para Fazer Inscrição
      </button>
      <span className="block text-center text-[11px] text-ink-muted font-mono uppercase mt-2">
        Faça login para garantir sua vaga de forma imediata
      </span>
    </div>
  );
}
