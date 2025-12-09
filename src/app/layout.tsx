// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { LayoutClient } from "./LayoutClient";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Recarga Jogo",
  description: "Site oficial de recarga",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        {/* ====================== GOOGLE TAG (GTAG) ====================== */}
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=AW-"
        />
        <Script id="google-gtag" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-');
          `}
        </Script>

        {/* ====================== UTMIFY PIXEL GOOGLE ====================== */}
        <Script id="utmify-pixel" strategy="afterInteractive">
          {`
            window.googlePixelId = "6935c34ff8f556b01244c7e5";
            var a = document.createElement("script");
            a.setAttribute("async", "");
            a.setAttribute("defer", "");
            a.setAttribute("src", "https://cdn.utmify.com.br/scripts/pixel/pixel-google.js");
            document.head.appendChild(a);
          `}
        </Script>

        {/* ====================== UTMIFY UTMs ====================== */}
        <Script
          src="https://cdn.utmify.com.br/scripts/utms/latest.js"
          data-utmify-prevent-xcod-sck
          data-utmify-prevent-subids
          async
          defer
        />

        {/* ====================== TIKTOK PIXEL ====================== */}
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`
            !function (w, d, t) {
              w.TiktokAnalyticsObject=t;
              var ttq=w[t]=w[t]||[];
              ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
              ttq.setAndDefer=function(t,e){
                t[e]=function(){
                  t.push([e].concat(Array.prototype.slice.call(arguments,0)))
                }
              };
              for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
              ttq.instance=function(t){
                for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);
                return e
              };
              ttq.load=function(e,n){
                var r="https://analytics.tiktok.com/i18n/pixel/events.js",
                    o=n&&n.partner;
                ttq._i=ttq._i||{},ttq._i[e]=[],
                ttq._i[e]._u=r,
                ttq._t=ttq._t||{},ttq._t[e]=+new Date,
                ttq._o=ttq._o||{},ttq._o[e]=n||{};
                n=document.createElement("script"),
                n.type="text/javascript",
                n.async=!0,
                n.src=r+"?sdkid="+e+"&lib="+t;
                e=document.getElementsByTagName("script")[0];
                e.parentNode.insertBefore(n,e)
              };

              // 🔥 SEU PIXEL ATUALIZADO
              ttq.load('');
              ttq.page();
            }(window, document, 'ttq');
          `}
        </Script>
      </head>

      <body className="min-h-screen bg-background font-sans antialiased">
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}
