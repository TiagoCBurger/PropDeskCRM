"use client";
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type PosicaoDaLegenda = { top: number; left: number };

/**
 * Legenda flutuante do rail recolhido do Sidebar — o balão do design
 * importado ("CRM conversacional com agentes IA"), que substitui o `title`
 * nativo do navegador (sem estilo, sem tema).
 *
 * Vive em arquivo PRÓPRIO, fora de `Sidebar.tsx`, por um motivo estreito:
 * `tests/unit/barra-lateral-nao-flutua.test.ts` varre o TEXTO de
 * `Sidebar.tsx` inteiro caçando a palavra `fixed` (a barra já foi `position:
 * fixed` e voltou a flutuar por cima da lista de conversas — a régua é
 * literal de propósito, não geometria). A legenda usa `position: fixed` de
 * verdade, mas é sobre o PRÓPRIO balão (ele precisa desenhar fora de
 * qualquer `overflow` ancestral — ver o porquê abaixo), nunca sobre a barra;
 * separar o arquivo evita que a régua confunda os dois "fixed" sem
 * enfraquecer o que ela vigia.
 *
 * `position: fixed` calculado do `getBoundingClientRect()` do gatilho no
 * MOMENTO DO HOVER (dentro do handler, nunca durante o render — ler
 * `ref.current` durante o render é erro do `react-hooks/refs`), via portal
 * pro `<body>`. Não é `position: absolute` + `group-hover` no CSS, que seria
 * mais simples e está QUEBRADO no rail: a `<nav>` que lista os ícones é
 * `overflow-y-auto` (a lista de destinos não cabe inteira em telas baixas —
 * é a mesma razão pela qual "Configurações" já tinha virado rodapé fixo). Um
 * container com overflow não-visível num eixo recorta o OUTRO eixo também
 * (regra do CSSOM, não bug de navegador): a legenda, que precisa desenhar À
 * DIREITA de uma barra estreita, ficaria cortada bem na borda antes de
 * aparecer. `position: fixed` escapa de qualquer ancestral com overflow
 * (contanto que nenhum ancestral tenha `transform`, e o cartão não tem).
 */
export function useLegendaFlutuante<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [posicao, setPosicao] = useState<PosicaoDaLegenda | null>(null);
  const abrir = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPosicao({ top: r.top + r.height / 2, left: r.right + 8 });
  };
  const fechar = () => setPosicao(null);
  return {
    ref,
    posicao,
    gatilho: {
      onMouseEnter: abrir,
      onMouseLeave: fechar,
      onFocus: abrir,
      onBlur: fechar,
    },
  };
}

export function LegendaFlutuante({
  posicao,
  children,
}: {
  posicao: PosicaoDaLegenda;
  children: ReactNode;
}) {
  return createPortal(
    <span
      role="tooltip"
      style={{ top: posicao.top, left: posicao.left }}
      className={cn(
        "pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap",
        "rounded-lg border border-border bg-popover px-2.5 py-1.5",
        "text-xs font-medium text-popover-foreground shadow-lg",
      )}
    >
      {children}
    </span>,
    document.body,
  );
}
