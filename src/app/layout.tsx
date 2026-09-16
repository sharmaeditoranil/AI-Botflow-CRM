import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/hooks/use-theme";
import { ThemedToaster } from "@/components/themed-toaster";
import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  MODE_STORAGE_KEY,
  MODES,
  STORAGE_KEY,
  THEME_IDS,
} from "@/lib/themes";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://dash.aibotflow.in";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Aibotflow — WhatsApp CRM, AI Automation & Marketing Platform",
    template: "%s | Aibotflow",
  },
  description: "Official Meta Cloud API WhatsApp CRM with autonomous AI agents, conversation memory, high-converting media broadcasts, and multi-platform webhooks without per-message markups.",
  keywords: [
    "WhatsApp CRM",
    "AI WhatsApp Agent",
    "WhatsApp Marketing",
    "WhatsApp Broadcast",
    "Meta Cloud API",
    "WhatsApp Automation",
    "Customer Support WhatsApp",
    "n8n WhatsApp Webhook",
    "Zapier WhatsApp CRM",
    "Pabbly WhatsApp Integration",
  ],
  authors: [{ name: "Aibotflow", url: siteUrl }],
  creator: "Aibotflow",
  publisher: "Aibotflow",
  category: "technology",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Aibotflow WhatsApp CRM",
    title: "Aibotflow — WhatsApp CRM, AI Automation & Marketing Platform",
    description: "Official Meta Cloud API WhatsApp CRM with autonomous AI agents, conversation memory, high-converting broadcasts, and zero message markups.",
    images: [
      {
        url: "/brand/logo-512.png",
        width: 512,
        height: 512,
        alt: "Aibotflow Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aibotflow — WhatsApp CRM & AI Automation",
    description: "Scale your sales with autonomous AI agents, WhatsApp broadcasts, and direct Meta Cloud API integration.",
    images: ["/brand/logo-512.png"],
  },
  icons: {
    icon: [
      { url: "/brand/logo-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/logo-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/logo-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  colorScheme: "dark light",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Aibotflow",
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/brand/logo-512.png`,
        width: 512,
        height: 512,
      },
      contactPoint: [
        {
          "@type": "ContactPoint",
          telephone: "+91-92949-89812",
          contactType: "customer service",
          email: "support@aibotflow.in",
          areaServed: "IN",
          availableLanguage: ["English", "Hindi"],
        },
      ],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#software`,
      name: "Aibotflow",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, Cloud",
      description: "Enterprise WhatsApp CRM & AI Marketing Automation Platform with autonomous lead qualification and Meta Cloud API integration.",
      url: siteUrl,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
        category: "14-Day Free Access",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        reviewCount: "1250",
        bestRating: "5",
        worstRating: "1",
      },
    },
  ],
};

// Inline boot script — runs before React hydrates so the user's
// chosen accent (data-theme) AND mode (data-mode) are on the <html>
// element before first paint. Without this every page load flashes
// the server-rendered defaults for a frame before the React tree
// mounts and applies the picked values.
//
// Kept dependency-free (no imports, no JSX) — must be a string the
// browser can run as a single <script>. Knowledge of valid ids is
// sourced from the THEME_IDS / MODES constants so adding one doesn't
// silently break the boot path.
const THEME_BOOT_SCRIPT = `
(function(){
  var d = document.documentElement;
  try {
    var THEME_KEY = ${JSON.stringify(STORAGE_KEY)};
    var THEME_DEFAULT = ${JSON.stringify(DEFAULT_THEME)};
    var THEMES = ${JSON.stringify(THEME_IDS)};
    var savedTheme = localStorage.getItem(THEME_KEY);
    d.dataset.theme = THEMES.indexOf(savedTheme) !== -1 ? savedTheme : THEME_DEFAULT;

    var MODE_KEY = ${JSON.stringify(MODE_STORAGE_KEY)};
    var MODE_DEFAULT = ${JSON.stringify(DEFAULT_MODE)};
    var MODES = ${JSON.stringify(MODES)};
    var savedMode = localStorage.getItem(MODE_KEY);
    d.dataset.mode = MODES.indexOf(savedMode) !== -1 ? savedMode : MODE_DEFAULT;
  } catch (_e) {
    d.dataset.theme = ${JSON.stringify(DEFAULT_THEME)};
    d.dataset.mode = ${JSON.stringify(DEFAULT_MODE)};
  }
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      data-theme={DEFAULT_THEME}
      data-mode={DEFAULT_MODE}
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full bg-background text-foreground font-sans">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ThemeProvider>
            {children}
            <ThemedToaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
