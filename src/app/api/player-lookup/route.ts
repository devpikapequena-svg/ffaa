import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/* -----------------------------------------------------
   ORIGENS PERMITIDAS (ANTI-CLONE)
----------------------------------------------------- */
const allowedOrigins = [
  "http://localhost:3000",
  "https://www.recargasjogo.cc",
  "https://recargasjogo.cc",
];

function isOriginAllowed(request: NextRequest): boolean {
  const referer = request.headers.get("referer");
  if (!referer) return false;
  return allowedOrigins.some((origin) => referer.startsWith(origin));
}

/* -----------------------------------------------------
   CACHE EM MEMÓRIA (5 MIN)
----------------------------------------------------- */
const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  nickname: string;
  source: string;
  expiresAt: number;
};

const nicknameCache = new Map<string, CacheEntry>();

/* -----------------------------------------------------
   FUNÇÃO UTILITÁRIA: DELAY
----------------------------------------------------- */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -----------------------------------------------------
   EXTRAÇÃO DO NICK DO <title>
----------------------------------------------------- */
function extractNicknameFromTitle(title: string): string {
  const marker = "Perfil de ";
  const startIndex = title.indexOf(marker);
  if (startIndex === -1) return title; // fallback

  const after = title.substring(startIndex + marker.length);

  const nickname = after.split(":")[0].trim();
  return nickname;
}

/* -----------------------------------------------------
   ÚNICA FONTE DE VERDADE:
   https://www.freefiremania.com.br/perfil/{UID}.html
----------------------------------------------------- */
async function fetchFromFreeFireMania(
  uid: string
): Promise<{ nickname: string }> {
  const url = `https://www.freefiremania.com.br/perfil/${encodeURIComponent(
    uid
  )}.html`;

  const MAX_RETRIES = 2;
  const DELAY_MS = 1000;

  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;

    try {
      res = await fetch(url, {
        cache: "no-store",
        headers: {
          // força parecer navegador normal
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      });
    } catch (err) {
      console.error("❌ Erro de rede ao chamar FreeFireMania:", err);
      if (attempt < MAX_RETRIES) {
        await sleep(DELAY_MS);
        continue;
      }
      throw new Error("UPSTREAM_FETCH_ERROR");
    }

    lastStatus = res.status;

    console.log(
      `🌐 FreeFireMania tentativa ${attempt}/${MAX_RETRIES} — status: ${res.status}`
    );

    if (res.status === 404) {
      // UID não existe
      throw new Error("PLAYER_NOT_FOUND");
    }

    if (!res.ok) {
      if (attempt < MAX_RETRIES) {
        await sleep(DELAY_MS);
        continue;
      }
      throw new Error(`UPSTREAM_STATUS_${res.status}`);
    }

    const html = await res.text();

    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (!match || !match[1]) {
      console.warn("⚠️ Título não encontrado no HTML:", html.slice(0, 200));
      if (attempt < MAX_RETRIES) {
        await sleep(DELAY_MS);
        continue;
      }
      throw new Error("UPSTREAM_TITLE_NOT_FOUND");
    }

    const rawTitle = match[1].trim();
    console.log("🎯 TITLE CAPTURADO:", rawTitle);

    const nickname = extractNicknameFromTitle(rawTitle);
    console.log("🎯 NICK EXTRAÍDO:", nickname);

    return { nickname };
  }

  throw new Error(`UPSTREAM_ERROR_${lastStatus ?? "UNKNOWN"}`);
}

/* -----------------------------------------------------
   ROTA PRINCIPAL GET
----------------------------------------------------- */
export async function GET(request: NextRequest) {
  if (!isOriginAllowed(request)) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }

  const uid = new URL(request.url).searchParams.get("uid");

  if (!uid) {
    return NextResponse.json(
      { error: "O ID do jogador é obrigatório." },
      { status: 400 }
    );
  }

  const now = Date.now();

  // 1️⃣ tenta cache
  const cached = nicknameCache.get(uid);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(
      { nickname: cached.nickname, source: "cache" },
      { status: 200 }
    );
  }

  try {
    // 2️⃣ busca no FreeFireMania
    const result = await fetchFromFreeFireMania(uid);

    nicknameCache.set(uid, {
      nickname: result.nickname,
      source: "freefiremania",
      expiresAt: now + CACHE_TTL_MS,
    });

    return NextResponse.json(
      { nickname: result.nickname, source: "freefiremania" },
      { status: 200 }
    );
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Erro ao buscar no FreeFireMania:", msg);

    if (msg === "PLAYER_NOT_FOUND") {
      return NextResponse.json(
        { error: "Jogador não encontrado.", code: "PLAYER_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (msg === "UPSTREAM_FETCH_ERROR") {
      return NextResponse.json(
        {
          error:
            "Não foi possível conectar ao FreeFireMania agora. Tente novamente em alguns minutos.",
          code: "UPSTREAM_FETCH_ERROR",
        },
        { status: 503 }
      );
    }

    if (msg.startsWith("UPSTREAM_STATUS_") || msg.startsWith("UPSTREAM_")) {
      return NextResponse.json(
        {
          error:
            "O serviço do FreeFireMania está instável no momento. Tente novamente mais tarde.",
          code: msg,
        },
        { status: 502 }
      );
    }

    // fallback genérico
    return NextResponse.json(
      {
        error:
          "Erro interno ao buscar o jogador. Se persistir, fale com o suporte.",
        code: "INTERNAL",
      },
      { status: 500 }
    );
  }
}
