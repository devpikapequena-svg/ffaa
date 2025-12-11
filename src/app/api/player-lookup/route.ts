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
   FUNÇÃO: BUSCAR NA TSUNSTUDIO
----------------------------------------------------- */
async function fetchFromTsunStudio(uid: string): Promise<{ nickname: string }> {
  const url = `https://fffinfo.tsunstudio.pw/get?uid=${encodeURIComponent(uid)}`;

  const res = await fetch(url, {
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("PLAYER_NOT_FOUND");
    throw new Error(`UPSTREAM_STATUS_${res.status}`);
  }

  const data = await res.json();

  if (!data?.AccountInfo?.AccountName) {
    throw new Error("UPSTREAM_INVALID_DATA");
  }

  const nickname = data.AccountInfo.AccountName.trim();
  return { nickname };
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
    // 2️⃣ busca via TsuN Studio
    const result = await fetchFromTsunStudio(uid);

    nicknameCache.set(uid, {
      nickname: result.nickname,
      source: "tsunstudio",
      expiresAt: now + CACHE_TTL_MS,
    });

    return NextResponse.json(
      { nickname: result.nickname, source: "tsunstudio" },
      { status: 200 }
    );
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Erro ao buscar no TsuN Studio:", msg);

    if (msg === "PLAYER_NOT_FOUND") {
      return NextResponse.json(
        { error: "Jogador não encontrado.", code: "PLAYER_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (msg.startsWith("UPSTREAM_STATUS_") || msg === "UPSTREAM_INVALID_DATA") {
      return NextResponse.json(
        {
          error: "O serviço da TsuN Studio está instável no momento.",
          code: msg,
        },
        { status: 502 }
      );
    }

    // fallback genérico
    return NextResponse.json(
      {
        error: "Erro interno ao buscar o jogador. Se persistir, fale com o suporte.",
        code: "INTERNAL",
      },
      { status: 500 }
    );
  }
}
