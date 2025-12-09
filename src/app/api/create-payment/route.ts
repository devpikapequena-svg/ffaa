'use server';

import { NextRequest, NextResponse } from 'next/server';
import { gerarCPFValido } from '@/lib/utils';
import { sendOrderToUtmify, formatToUtmifyDate } from '@/lib/utmifyService';
import { UtmifyOrderPayload } from '@/interfaces/utmify';
import { PaymentPayload } from '@/interfaces/types';

const allowedOrigins = [
  'http://localhost:3000',
  'https://recargajogo.com.de',
  'https://www.recargajogo.com.de'
];

function isOriginAllowed(request: NextRequest): boolean {
  const referer = request.headers.get('referer');
  if (!referer) return false;
  return allowedOrigins.some(origin => referer.startsWith(origin));
}

export async function POST(request: NextRequest) {
  if (!isOriginAllowed(request)) {
    return new NextResponse(JSON.stringify({ error: 'Clonou errado kk' }), { status: 403 });
  }

  let requestBody: PaymentPayload;

  try {
    requestBody = await request.json();

    const { name, email, phone, amount, items, externalId, utmQuery } = requestBody;

    const apiToken = process.env.BUCKPAY_API_TOKEN;
    if (!apiToken) {
      return new NextResponse(JSON.stringify({ error: 'Configuração do servidor incompleta.' }), { status: 500 });
    }

    const parsedAmount = parseFloat(String(amount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return new NextResponse(JSON.stringify({ error: 'Valor total inválido.' }), { status: 400 });
    }

    const amountInCents = Math.round(parsedAmount * 100);

    if (!Array.isArray(items) || items.length === 0) {
      return new NextResponse(JSON.stringify({ error: 'Itens inválidos.' }), { status: 400 });
    }

    const finalCpf = (requestBody.cpf || gerarCPFValido()).replace(/\D/g, '');
    const utmParams = utmQuery || {};
    const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1';

    const payloadForBuckPay = {
      external_id: externalId,
      payment_method: 'pix',
      amount: amountInCents,
      buyer: {
        name,
        email,
        document: finalCpf,
        phone: `55${phone.replace(/\D/g, '')}`,
        ip,
      },
      items: items.map((item: any) => ({
        id: item.id || `prod_${Date.now()}`,
        name: item.title,
        amount: Math.round(item.unitPrice * 100),
        quantity: item.quantity,
      })),
      tracking: {
        ref: utmParams['ref'] || null,
        src: utmParams['src'] || utmParams['utm_source'] || null,
        sck: utmParams['sck'] || null,
        utm_source: utmParams['utm_source'] || null,
        utm_medium: utmParams['utm_medium'] || null,
        utm_campaign: utmParams['utm_campaign'] || null,
        utm_id: utmParams['utm_id'] || null,
        utm_term: utmParams['utm_term'] || null,
        utm_content: utmParams['utm_content'] || null,
      }
    };

    const buckpayResponse = await fetch('https://api.realtechdev.com.br/v1/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
        'User-Agent': 'Buckpay API'
      },
      body: JSON.stringify(payloadForBuckPay)
    });

    const responseData = await buckpayResponse.json();

    if (!buckpayResponse.ok) {
      return new NextResponse(
        JSON.stringify({
          error: responseData.error?.message || 'Falha na BuckPay.',
          details: responseData.error?.detail
        }),
        { status: buckpayResponse.status }
      );
    }

    /** --------- ENVIAR PENDENTE PARA UTMIFY ---------- **/
    const buckpayData = responseData.data;

    if (buckpayData && buckpayData.id) {
      const utmifyPayload: UtmifyOrderPayload = {
        orderId: buckpayData.id,
        platform: 'RecargaJogo',
        paymentMethod: 'pix',
        status: 'waiting_payment',
        createdAt: formatToUtmifyDate(new Date()),
        approvedDate: null,
        refundedAt: null,
        customer: {
          name,
          email,
          phone: phone.replace(/\D/g, ''),
          document: finalCpf,
          country: 'BR',
          ip
        },
        products: items.map((item: any) => ({
          id: item.id || `prod_${Date.now()}`,
          name: item.title,
          planId: null,
          planName: null,
          quantity: item.quantity,
          priceInCents: Math.round(item.unitPrice * 100),
        })),
        trackingParameters: {
          src: utmParams['src'] || utmParams['utm_source'] || null,
          sck: utmParams['sck'] || null,
          utm_source: utmParams['utm_source'] || null,
          utm_campaign: utmParams['utm_campaign'] || null,
          utm_medium: utmParams['utm_medium'] || null,
          utm_content: utmParams['utm_content'] || null,
          utm_term: utmParams['utm_term'] || null,
        },
        commission: {
          totalPriceInCents: amountInCents,
          gatewayFeeInCents: 0,
          userCommissionInCents: amountInCents,
          currency: 'BRL',
        },
        isTest: false
      };

      try {
        await sendOrderToUtmify(utmifyPayload);
      } catch (e) {
        // Não quebra o fluxo do cliente
      }
    }

    return new NextResponse(JSON.stringify(responseData), { status: 200 });

  } catch (error: any) {
    return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isOriginAllowed(request)) {
    return new NextResponse(JSON.stringify({ error: 'Clonou errado kk' }), { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const externalId = searchParams.get('externalId');

  if (!externalId) {
    return new NextResponse(JSON.stringify({ error: 'externalId é obrigatório.' }), { status: 400 });
  }

  try {
    const apiToken = process.env.BUCKPAY_API_TOKEN;

    const buckpayStatusResponse = await fetch(
      `https://api.realtechdev.com.br/v1/transactions/external_id/${externalId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Buckpay API'
        }
      }
    );

    if (buckpayStatusResponse.status === 404) {
      return new NextResponse(JSON.stringify({ status: 'PENDING' }), { status: 200 });
    }

    const statusData = await buckpayStatusResponse.json();

    if (!buckpayStatusResponse.ok) {
      return new NextResponse(JSON.stringify({
        error: statusData.error?.message || 'Falha ao consultar status.'
      }), { status: buckpayStatusResponse.status });
    }

    const paymentStatus = statusData.data?.status?.toUpperCase() || 'UNKNOWN';

    return new NextResponse(JSON.stringify({ status: paymentStatus }), { status: 200 });

  } catch (error: any) {
    return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
