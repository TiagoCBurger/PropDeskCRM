/**
 * OS PROVEDORES QUE O SISTEMA SABE USAR — a lista que substituiu o CHECK.
 *
 * A migration 0127 removeu os três CHECKs que prendiam `provider` em
 * `anthropic|openai|google` no banco, porque eles tornavam impossível cadastrar
 * OpenRouter (ou qualquer provedor novo, ou um modelo local) e porque cada
 * provedor novo viraria uma migration. Com a coluna aberta, a garantia de que a
 * tela não oferece opção inválida passa a morar aqui.
 *
 * A defesa em profundidade é tripla, e é importante entender de onde vem cada
 * metade:
 *
 *  - **Esta lista** é o que o sistema CONHECE. Cada id aqui tem registry, e
 *    um agente já publicado nela continua executando.
 *  - **`liberadoParaEscolha`** é o que a tela OFERECE numa escolha nova
 *    (wizard, credencial nova, seletor do atendente). O resto entra aos poucos:
 *    virar a flag traz o provedor de volta sem migration.
 *  - **O registry** (`createDefaultRegistry`) é o que EXECUTA. Um provider que
 *    chegue até ele sem entrada correspondente falha com
 *    `LlmProviderUnknownError` — erro tipado que diz o que fazer, e não uma
 *    violação de constraint que o operador leria como bug do produto.
 *
 * As três metades precisam concordar no sentido "liberado ⊆ suportado ⊆
 * executável". Por isso `tests/unit/provedores-x-registry.test.ts` casa as três.
 */

/** Como a chave daquele provedor é validada e o que a tela precisa pedir. */
export interface ProvedorSuportado {
  id: string;
  /** Nome como o operador conhece. */
  rotulo: string;
  /** Uma frase sobre quando escolher este, para quem não acompanha o mercado. */
  quandoUsar: string;
  /**
   * O provedor aceita apontar para outro endpoint (é OpenAI-compatível)? É o
   * que habilita gateway próprio e, no roteiro, modelo local.
   */
  aceitaEndpointProprio: boolean;
  /** O catálogo de modelos vem de uma API pública que dá para sincronizar? */
  catalogoSincronizavel: boolean;
  /**
   * Aparece numa escolha NOVA. `false` não apaga o provedor: o registry
   * continua, um agente já publicado nele continua, e a tela do agente inclui
   * o valor atual para o campo não abrir em branco. Só não dá para escolher
   * este numa credencial nova nem no wizard — até a flag virar.
   */
  liberadoParaEscolha: boolean;
  /** Onde o operador pega a chave — a tela mostra o link. */
  ondePegarAChave: string;
}

export const PROVEDORES = [
  {
    id: "anthropic",
    rotulo: "Anthropic (Claude)",
    quandoUsar:
      "O padrão recomendado para conversar com o cliente: é o que melhor segue instruções longas e usa as ferramentas do CRM.",
    aceitaEndpointProprio: false,
    catalogoSincronizavel: false,
    liberadoParaEscolha: true,
    ondePegarAChave: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    rotulo: "OpenAI (GPT)",
    quandoUsar:
      "Necessário para transcrever áudio e para indexar o seu material — esses dois pontos usam tecnologia da OpenAI mesmo quando o resto está em outro provedor.",
    aceitaEndpointProprio: true,
    catalogoSincronizavel: false,
    liberadoParaEscolha: false,
    ondePegarAChave: "https://platform.openai.com/api-keys",
  },
  {
    id: "google",
    rotulo: "Google (Gemini)",
    quandoUsar:
      "Alternativa com contexto muito longo e custo baixo para tarefas de classificação.",
    aceitaEndpointProprio: false,
    catalogoSincronizavel: false,
    liberadoParaEscolha: false,
    ondePegarAChave: "https://aistudio.google.com/apikey",
  },
  {
    id: "openrouter",
    rotulo: "OpenRouter",
    quandoUsar:
      "Uma chave só dá acesso a centenas de modelos de dezenas de fabricantes, inclusive os gratuitos. É o caminho mais simples para experimentar sem abrir conta em cada provedor.",
    aceitaEndpointProprio: true,
    catalogoSincronizavel: true,
    liberadoParaEscolha: false,
    ondePegarAChave: "https://openrouter.ai/keys",
  },
] as const satisfies readonly ProvedorSuportado[];
// `as const satisfies` e não anotação de tipo: a anotação apagaria os literais
// e `Provider` viraria `string`, deixando o compilador aceitar qualquer texto
// como provedor — que é exatamente a garantia que esta lista existe para dar.

/**
 * Só os ids, na forma que o `z.enum` exige (tupla não-vazia de literais).
 *
 * Existe para os pontos de ESCRITA derivarem daqui em vez de repetir a lista:
 * a rota de credenciais, o schema de versão do agente e o diálogo da tela
 * tinham cada um a sua cópia, e quando a 0127 abriu o banco para a OpenRouter
 * as três continuaram recusando — o produto oferecia um provedor que não tinha
 * como ser cadastrado.
 */
export const IDS_DE_PROVEDOR = PROVEDORES.map((p) => p.id) as unknown as readonly [
  (typeof PROVEDORES)[number]["id"],
  ...(typeof PROVEDORES)[number]["id"][],
];

export const PROVEDOR_POR_ID: ReadonlyMap<string, ProvedorSuportado> = new Map(
  PROVEDORES.map((p) => [p.id, p]),
);

export function ehProvedorSuportado(id: string): boolean {
  return PROVEDOR_POR_ID.has(id);
}

export function ehProvedorLiberadoParaEscolha(id: string): boolean {
  return PROVEDOR_POR_ID.get(id)?.liberadoParaEscolha === true;
}

/** Só os que uma escolha NOVA pode pegar. */
export function provedoresLiberadosParaEscolha(): ProvedorSuportado[] {
  return PROVEDORES.filter((p) => p.liberadoParaEscolha);
}

/**
 * Lista da tela: os liberados, mais os ids que já estão em uso.
 *
 * Sem o segundo conjunto, um agente publicado em OpenRouter (antes da flag)
 * abre o seletor em branco — e o primeiro save silencioso troca o provedor
 * do dono por Anthropic.
 */
export function provedoresParaEscolha(idsJaEmUso: Iterable<string> = []): ProvedorSuportado[] {
  const vistos = new Set<string>();
  const saida: ProvedorSuportado[] = [];
  for (const p of provedoresLiberadosParaEscolha()) {
    vistos.add(p.id);
    saida.push(p);
  }
  for (const id of idsJaEmUso) {
    if (!id || vistos.has(id)) continue;
    const extra = PROVEDOR_POR_ID.get(id);
    if (!extra) continue;
    vistos.add(id);
    saida.push(extra);
  }
  return saida;
}

export const MENSAGEM_PROVEDOR_AINDA_NAO_LIBERADO =
  "Por enquanto só damos para escolher a Anthropic (Claude). Os outros entram aos poucos.";

