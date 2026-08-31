/**
 * A régua do design system, congelada em módulo — a fonte da derivação em RUNTIME.
 *
 * POR QUE ESTE ARQUIVO EXISTE, e não um `readFileSync("app/globals.css")`:
 *
 * A imagem de produção é `output: "standalone"` (next.config.ts) e o Dockerfile
 * copia para o runner apenas `.next/standalone`, `.next/static` e `public/`. O
 * `app/globals.css` NÃO existe no contêiner que o self-hoster roda. Um
 * `readFileSync` no caminho de render do `app/layout.tsx` daria ENOENT — 500 em
 * todas as telas, na VPS de quem a feature existe para servir, e verde em dev,
 * em teste e na Vercel. É o mesmo modo de falha que `lib/branding.ts` documenta
 * para o `NEXT_PUBLIC_*`.
 *
 * A separação também é a certa conceitualmente: a RÉGUA é do produto e nasce
 * congelada no build; a COR é da instalação e só existe em runtime. Só a segunda
 * precisa ser lida do ambiente.
 *
 * ESTE ARQUIVO É GERADO. Não edite à mão: ele é o `extrairRegua()` aplicado ao
 * `app/globals.css`. `tests/unit/branding-regua-do-produto.test.ts` compara os
 * dois a cada run e imprime o literal novo na mensagem de falha — mexeu na
 * paleta, o teste reprova e entrega o texto para colar aqui.
 */

import type { Regua } from "./contraste";

export const REGUA_DO_PRODUTO: Regua = {
  "rampaDoProduto": [
    "#f5f5f3",
    "#e3e2df",
    "#c2c0bb",
    "#97948c",
    "#706c61",
    "#4e4b40",
    "#2c2920",
    "#28261f",
    "#25231e",
    "#23211d",
    "#1d1c1a"
  ],
  "claro": {
    "nome": "claro",
    "base": [
      {
        "chave": "--color-bg",
        "hex": "#f9f8f3"
      },
      {
        "chave": "--color-surface",
        "hex": "#ffffff"
      },
      {
        "chave": "--color-surface-elevated",
        "hex": "#f1efe6"
      }
    ],
    "tingidas": [
      {
        "chave": "--color-accent-soft",
        "fonte": {
          "tipo": "grau",
          "indice": 1,
          "alfa": 1
        }
      }
    ],
    "papeis": [
      {
        "token": "--color-accent",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 6,
          "alfa": 1
        },
        "contra": null
      },
      {
        "token": "--color-accent-fg",
        "tipo": "texto",
        "fonte": {
          "tipo": "frenteCalculada",
          "sobre": {
            "tipo": "grau",
            "indice": 6,
            "alfa": 1
          }
        },
        "contra": [
          {
            "tipo": "grau",
            "indice": 6,
            "alfa": 1
          }
        ]
      },
      {
        "token": "--color-accent-hover",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 7,
          "alfa": 1
        },
        "contra": null
      },
      {
        "token": "--ring",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 5,
          "alfa": 1
        },
        "contra": null
      },
      {
        "token": "::selection/color",
        "tipo": "texto",
        "fonte": {
          "tipo": "grau",
          "indice": 10,
          "alfa": 1
        },
        "contra": [
          {
            "tipo": "grau",
            "indice": 2,
            "alfa": 1
          }
        ]
      },
      {
        "token": ":focus-visible/outline",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 5,
          "alfa": 1
        },
        "contra": null
      }
    ],
    "semanticas": [
      {
        "nome": "success",
        "hex": "#556213"
      },
      {
        "nome": "warning",
        "hex": "#92400e"
      },
      {
        "nome": "error",
        "hex": "#b42318"
      },
      {
        "nome": "info",
        "hex": "#0f766e"
      }
    ],
    "neutros": [
      "#f9f8f3",
      "#f1efe6",
      "#e5e4de",
      "#d5d2c6",
      "#b3ada0",
      "#9a958a",
      "#6b6658",
      "#524d42",
      "#3a362d",
      "#2c2920",
      "#17150f"
    ],
    "indices": {
      "accent": 6,
      "hover": 7,
      "soft": 1
    },
    "alfaDoSoft": 1
  },
  "escuro": {
    "nome": "escuro",
    "base": [
      {
        "chave": "--color-bg",
        "hex": "#17150f"
      },
      {
        "chave": "--color-surface",
        "hex": "#1e1c16"
      },
      {
        "chave": "--color-surface-elevated",
        "hex": "#28251d"
      }
    ],
    "tingidas": [
      {
        "chave": "--color-accent-soft",
        "fonte": {
          "tipo": "literal",
          "hex": "#706c61",
          "alfa": 0.1
        }
      }
    ],
    "papeis": [
      {
        "token": "--color-accent",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 3,
          "alfa": 1
        },
        "contra": null
      },
      {
        "token": "--color-accent-fg",
        "tipo": "texto",
        "fonte": {
          "tipo": "frenteCalculada",
          "sobre": {
            "tipo": "grau",
            "indice": 3,
            "alfa": 1
          }
        },
        "contra": [
          {
            "tipo": "grau",
            "indice": 3,
            "alfa": 1
          }
        ]
      },
      {
        "token": "--color-accent-hover",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 2,
          "alfa": 1
        },
        "contra": null
      },
      {
        "token": "--ring",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 3,
          "alfa": 1
        },
        "contra": null
      },
      {
        "token": "[data-theme=\"dark\"] ::selection/color",
        "tipo": "texto",
        "fonte": {
          "tipo": "grau",
          "indice": 0,
          "alfa": 1
        },
        "contra": [
          {
            "tipo": "grau",
            "indice": 7,
            "alfa": 1
          }
        ]
      },
      {
        "token": "[data-theme=\"dark\"] :focus-visible/outline-color",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 3,
          "alfa": 1
        },
        "contra": null
      }
    ],
    "semanticas": [
      {
        "nome": "success",
        "hex": "#c8e600"
      },
      {
        "nome": "warning",
        "hex": "#e8b27a"
      },
      {
        "nome": "error",
        "hex": "#f2a08c"
      },
      {
        "nome": "info",
        "hex": "#5eead4"
      }
    ],
    "neutros": [
      "#f7f5ef",
      "#e8e4d9",
      "#cec9ba",
      "#a89f8c",
      "#7d7566",
      "#423d34",
      "#322e27",
      "#28251d",
      "#1e1c16",
      "#17150f",
      "#0e0d09"
    ],
    "indices": {
      "accent": 3,
      "hover": 2,
      "soft": null
    },
    "alfaDoSoft": 0.1
  }
} as const;
