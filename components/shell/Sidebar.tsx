"use client";
import Link from "next/link";
import { useT } from "@/hooks/i18n/useT";
import { usePathname } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { ArrowRight, CaretDoubleLeft, CaretDoubleRight, Gear } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { toggleSidebar } from "@/app/actions/shell/toggleSidebar";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";
import { LegendaFlutuante, useLegendaFlutuante } from "@/components/shell/LegendaFlutuante";
import { VersionFooter } from "@/components/shell/VersionFooter";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";
import { GRUPO_NO_RODAPE, NAV_GROUPS, sidebarGroups } from "@/lib/navigation/registry";

interface SidebarContentProps {
  collapsed: boolean;
  showCollapseControl?: boolean;
  onNavigate?: () => void;
}

/**
 * Classes compartilhadas por TODO destino clicável da navegação — item de
 * grupo, link do hub, o próprio botão de recolher. Um só lugar decide como é
 * "ativo" vs "neutro" nos dois modos, em vez de cada `<Link>` repetir a
 * mesma ternária (e divergir aos poucos, como estava antes do restyle).
 *
 * Recolhido: ícone sozinho, ativo = chip lime (`--color-spark`) atrás do
 * ícone — é o único lugar do produto onde esse token pinta um FUNDO sólido
 * (ver a nota grande em `app/globals.css` sobre por que ele nunca é borda/
 * anel/texto). Expandido: ativo = pílula `foreground`/`background` (tinta
 * no claro, creme no escuro — os dois papéis já invertem sozinhos por tema,
 * então não precisa de token novo).
 */
function itemClasses(collapsed: boolean, active: boolean) {
  return cn(
    "relative flex items-center transition-colors duration-fast ease-out",
    collapsed
      ? "h-10 w-10 justify-center rounded-2xl"
      : "gap-3 rounded-2xl px-3 py-1.5 text-sm font-medium",
    active
      ? collapsed
        ? "bg-[var(--color-spark)] text-[var(--color-spark-fg)] shadow-[0_4px_14px_var(--color-spark-tint)]"
        : "bg-foreground text-background shadow-sm"
      : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
  );
}

/**
 * UM link da navegação — item de grupo, hub ou o rodapé "Configurações". Só
 * existe como componente PRÓPRIO (em vez de JSX direto dentro do `.map`) por
 * causa do hover: `useLegendaFlutuante` chama `useRef`/`useState`, e um Hook
 * chamado dentro do callback de `.map()` quebraria a Regra dos Hooks — o
 * número de chamadas variaria com o tamanho da lista. Aqui cada `<RailLink>`
 * é a sua própria instância de componente, com o seu próprio par de Hooks.
 */
function RailLink({
  href,
  label,
  collapsed,
  active,
  onClick,
  icon,
  extra,
}: {
  href: string;
  label: string;
  collapsed: boolean;
  active: boolean;
  onClick?: () => void;
  icon: ReactNode;
  extra?: ReactNode;
}) {
  const { ref, posicao, gatilho } = useLegendaFlutuante<HTMLAnchorElement>();
  return (
    <li className={collapsed ? "flex justify-center" : undefined}>
      <Link
        ref={ref}
        href={href}
        aria-label={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        onClick={onClick}
        className={itemClasses(collapsed, active)}
        {...(collapsed ? gatilho : null)}
      >
        {icon}
        {!collapsed && <span className="truncate">{label}</span>}
        {extra}
      </Link>
      {collapsed && posicao && <LegendaFlutuante posicao={posicao}>{label}</LegendaFlutuante>}
    </li>
  );
}

/**
 * Navegação principal, agrupada por objetivo.
 *
 * Não decide nada: `sidebarGroups()` (lib/navigation/registry.ts) resolve quais
 * grupos e destinos este papel vê, e este componente desenha. Antes, a lista de
 * itens e sete `usePermission()` viviam aqui — e divergiam do hub de
 * Configurações e das abas de IA, que mantinham suas próprias listas.
 *
 * Fase 2 do redesenho importado (design "CRM conversacional com agentes IA"):
 * o rail deles é um cartão de vidro flutuante SÓ COM ÍCONES — sem grupos, sem
 * expandir, 5 destinos fixos. Aqui a informação é outra (bem mais que 5
 * destinos, entre atendimento/CRM/IA/canais/análise/organização) e o produto
 * já tinha uma preferência real de "recolher"/"expandir" persistida por
 * cookie — apagar isso pra caber no wireframe tiraria capacidade de quem já
 * usa. Então o que migrou foi a LINGUAGEM visual (cartão de vidro, chip lime
 * no ativo, legenda flutuante), não a arquitetura de informação: os mesmos
 * grupos e o mesmo alternador continuam os dois.
 */
export function SidebarContent({
  collapsed,
  showCollapseControl = true,
  onNavigate,
}: SidebarContentProps) {
  // A barra lateral aparece em TODA tela — traduzi-la aqui é o que faz a
  // escolha de idioma virar algo visível no primeiro clique.
  const t = useT();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const { user, activeOrg } = useAuth();
  const todos = sidebarGroups(user.is_platform_admin, activeOrg?.role ?? null);
  // Configurações sai da área que rola e vai para o rodapé fixo: medido em
  // 1280x768, ele caía fora da dobra mesmo em telas de 1080px.
  const grupos = todos.filter((g) => g.group.id !== GRUPO_NO_RODAPE);
  const rodape = NAV_GROUPS.find((g) => g.id === GRUPO_NO_RODAPE)?.hub;

  const brand = useMarcaDaInstalacao();
  /**
   * O CONSUMIDOR do nome por organização.
   *
   * Sem ele, `settings.branding.app_name` seria campo decorativo: medido, o nome
   * da org não aparece em lugar nenhum da casca para o cliente típico de um
   * revendedor — o único leitor é o `TenantSwitcher`, e ele devolve `null` com
   * uma organização só.
   *
   * A marca da INSTALAÇÃO continua embaixo: a organização que não definiu nome
   * vê exatamente o que via antes. O que mudou é POR ONDE ela chega — era
   * `branding()`, que no navegador lê `window.__PUBLIC_ENV__` e no servidor lê
   * `process.env`, e essas duas fontes passaram a divergir quando o layout raiz
   * começou a injetar a marca do BANCO. Divergência entre SSR e cliente aqui não
   * é detalhe: com logo no banco e `APP_LOGO_URL` vazio, o servidor desenhava o
   * `<span>` de baixo e o cliente desenhava o `<img>` — React #418 em toda tela.
   * Hoje a marca vem por PROP do servidor (`useMarcaDaInstalacao`), pela mesma
   * rota de `activeOrg`, e os dois lados leem o mesmo objeto por construção.
   */
  const nome = activeOrg?.marca?.nome ?? brand.name;
  /**
   * O mesmo desenho para o LOGO — e é este par de linhas que fecha o caminho do
   * `logo_url` gravado até a tela.
   *
   * `||` e não `??`: vazio é AUSÊNCIA de logo, não "logo em branco". É a regra
   * que `resolveBranding` e `primeiroDefinido` já aplicam nas camadas de baixo, e
   * com `??` um `""` vindo de cima apagaria o logo do revendedor em vez de
   * descer para ele — que é o contrário do que a precedência por campo promete.
   */
  const logo = activeOrg?.marca?.logoUrl || brand.logoUrl;

  return (
    <>
      <div className={cn("flex h-14 items-center px-3", collapsed ? "justify-center" : "justify-start gap-2.5")}>
        {collapsed ? (
          // Chip de marca do rail recolhido: o mesmo papel do glifo do design
          // (34px, canto arredondado, tinta sólida) — mas com a inicial ou o
          // logo de QUEM instalou, nunca um glifo fixo nosso.
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foreground text-background">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={nome} className="h-full w-full object-contain p-1" />
            ) : (
              <span aria-hidden className="text-sm font-bold">
                {/* Spread e não `[0]`: nome começando com emoji ou acento composto
                    quebraria no meio do code point. Mesma regra de `resolveBranding`
                    — a inicial precisa acompanhar o nome que a barra mostra, senão
                    recolher o menu troca a marca. */}
                {[...nome][0]?.toUpperCase() ?? brand.initial}
              </span>
            )}
          </div>
        ) : logo ? (
          // <img> em vez de next/image de propósito: a URL vem de quem hospeda
          // (banco ou .env), e next/image exige allowlist de domínios fechada em
          // build — a imagem pré-buildada rejeitaria o domínio do self-hoster.
          // Altura fixa e largura livre porque a arte enviada tem proporção
          // desconhecida; forçar as duas distorceria o logo de quem configurou.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={nome} className="h-7 w-auto max-w-[9.5rem] object-contain" />
        ) : (
          <span className="truncate font-display text-lg font-medium tracking-tight">{nome}</span>
        )}
      </div>
      <nav
        className={cn("min-h-0 flex-1 space-y-2.5 overflow-y-auto", collapsed ? "px-2" : "px-3")}
        aria-label={t("Navegação principal")}
      >
        {grupos.map(({ group, items }) => {
          const tituloId = `nav-grupo-${group.id}`;
          return (
            <div key={group.id} className="space-y-1">
              {/* Colapsado, o rail tem 60px: seis rótulos ali seriam ilegíveis.
                  Vira um filete separador, que preserva o agrupamento sem texto. */}
              {collapsed ? (
                <div aria-hidden className="mx-2 border-t border-border/70 first:hidden" />
              ) : (
                <h2
                  id={tituloId}
                  className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
                >
                  {t(group.label)}
                </h2>
              )}
              <ul aria-labelledby={collapsed ? undefined : tituloId} aria-label={collapsed ? t(group.label) : undefined} className="space-y-0.5">
                {items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <RailLink
                      key={item.href}
                      href={item.href}
                      label={t(item.label)}
                      collapsed={collapsed}
                      active={isActive}
                      onClick={onNavigate}
                      icon={<Icon size={collapsed ? 19 : 18} weight={isActive ? "fill" : "regular"} aria-hidden />}
                      extra={
                        item.healthDot && (
                          <ConnectionHealthDot
                            className={cn(collapsed ? "absolute right-1 top-1" : "ml-auto")}
                          />
                        )
                      }
                    />
                  );
                })}
                {group.hub && (
                  <RailLink
                    href={group.hub.href}
                    label={t(group.hub.label)}
                    collapsed={collapsed}
                    active={pathname === group.hub.href}
                    onClick={onNavigate}
                    icon={<ArrowRight size={collapsed ? 19 : 18} aria-hidden />}
                  />
                )}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className={cn("space-y-0.5 pb-2 pt-2", collapsed ? "px-2" : "px-3")}>
        {rodape && (
          <ul>
            <RailLink
              href={rodape.href}
              label={t(rodape.label)}
              collapsed={collapsed}
              active={pathname.startsWith(rodape.href)}
              onClick={onNavigate}
              icon={<Gear size={collapsed ? 19 : 18} aria-hidden />}
            />
          </ul>
        )}
        <VersionFooter collapsed={collapsed} onNavigate={onNavigate} />
        {showCollapseControl && (
          <button
            type="button"
            onClick={() => startTransition(() => toggleSidebar(collapsed))}
            disabled={isPending}
            className={cn(
              "flex w-full items-center gap-2 rounded-2xl px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
            aria-label={collapsed ? t("Expandir sidebar") : t("Recolher sidebar")}
          >
            {collapsed ? <CaretDoubleRight size={14} aria-hidden /> : <CaretDoubleLeft size={14} aria-hidden />}
            {!collapsed && <span>{t("Recolher")}</span>}
          </button>
        )}
      </div>
    </>
  );
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={cn(
        // ⚠️ `sticky`, e NUNCA `fixed`.
        //
        // Com `fixed` a barra sai do fluxo: ela não ocupa lugar nenhum na linha,
        // e quem afastava o conteúdo era um `md:ml-16`/`md:ml-60` do lado de lá.
        // Duas medidas para a mesma coisa, em componentes diferentes — e no dia
        // em que discordassem (largura de 60 com margem de 16), a barra passava
        // POR CIMA da lista de conversas, escondendo o começo de cada linha.
        //
        // Foi assim que apareceu numa instalação real: a barra expandida, com as
        // etiquetas legíveis, e a lista atrás dela cortada. Um F5 "consertava",
        // que é a assinatura de servidor e navegador terem pintado estados
        // diferentes — e `AppShell` e `Sidebar` são ambos `"use client"`.
        //
        // `sticky top-0 h-screen` dá o mesmo efeito visual (a barra não rola com
        // a página) e ela VOLTA a ocupar lugar: sobra para o conteúdo exatamente
        // o que ela não usou, e não há segunda medida para discordar.
        // `tests/unit/barra-lateral-nao-flutua.test.ts` vigia essas classes
        // literalmente — por isso `h-screen` continua AQUI, no elemento de fora,
        // e o cartão flutuante (embaixo) é um filho que só se ajusta por
        // dentro, sem mexer na altura que o flex de fora enxerga.
        //
        // `shrink-0` porque item de flex encolhe por padrão, e uma barra de 60
        // espremida para caber é o mesmo defeito por outro caminho.
        "sticky top-0 z-30 flex h-screen shrink-0 flex-col",
        "transition-[width] duration-200",
        // Largura do cartão (64px/240px — as mesmas do rail/sidebar de antes
        // do vidro) + 24px (as duas margens de `m-3` do cartão, embaixo).
        collapsed ? "w-[88px]" : "w-[264px]",
      )}
    >
      {/* O CARTÃO DE VIDRO (fase 2 do redesenho importado): a barra deixou de
          ser um painel encostado na borda (`border-r`, cantos retos, fundo
          opaco) e virou um cartão flutuante com margem própria — `m-3` em vez
          de tocar as bordas. `bg-card/70` + `backdrop-blur-xl` é o vidro,
          themed pelos tokens (claro fica creme translúcido, escuro fica
          tinta translúcida), ao contrário do `rgba(255,255,255,.55)` fixo do
          protótipo, que ficaria errado no escuro. */}
      <div
        className={cn(
          "m-3 flex h-[calc(100%-1.5rem)] flex-1 flex-col overflow-visible",
          "rounded-[22px] border border-border/60 bg-card/70 shadow-lg backdrop-blur-xl backdrop-saturate-150",
        )}
      >
        <SidebarContent collapsed={collapsed} />
      </div>
    </aside>
  );
}
