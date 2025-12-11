import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/* -----------------------------------------------------
   ORIGENS PERMITIDAS (ANTI-CLONE)
----------------------------------------------------- */
const allowedOrigins = [
  "http://localhost:3000",
  "https://www.recargasjogo.cc",
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
   Exemplo:
   "Usuário: Perfil de malㅤㅤ: Data da criação... "
              ↑ pega isso aqui ↑ até :
----------------------------------------------------- */
function extractNicknameFromTitle(title: string): string {
  const marker = "Perfil de ";
  const startIndex = title.indexOf(marker);
  if (startIndex === -1) return title; // fallback

  const after = title.substring(startIndex + marker.length);

  // pega tudo até o primeiro ":"
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

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, { cache: "no-store" });

    console.log(
      `🌐 FreeFireMania tentativa ${attempt}/${MAX_RETRIES} — status: ${res.status}`
    );

    if (!res.ok) {
      if (attempt < MAX_RETRIES) {
        await sleep(DELAY_MS);
        continue;
      }
      throw new Error(`freefiremania status ${res.status}`);
    }

    const html = await res.text();

    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (!match || !match[1]) {
      if (attempt < MAX_RETRIES) {
        await sleep(DELAY_MS);
        continue;
      }
      throw new Error("freefiremania: título não encontrado");
    }

    const rawTitle = match[1].trim();
    console.log("🎯 TITLE CAPTURADO:", rawTitle);

    const nickname = extractNicknameFromTitle(rawTitle);
    console.log("🎯 NICK EXTRAÍDO:", nickname);

    return { nickname };
  }

  throw new Error("freefiremania: erro inesperado");
}

/* -----------------------------------------------------
   ROTA PRINCIPAL GET
----------------------------------------------------- */
export async function GET(request: NextRequest) {
  // proteção anti-clone
  if (!isOriginAllowed(request)) {
    return NextResponse.json({ error: "Erro" }, { status: 403 });
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
  } catch (error) {
    console.error("Erro ao buscar no FreeFireMania:", error);

    return NextResponse.json(
      {
        error:
          "Não foi possível buscar o jogador agora. Tente novamente mais tarde.",
      },
      { status: 502 }
    );
  }
}
