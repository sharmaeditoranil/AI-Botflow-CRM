import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://dash.aibotflow.in';

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/login',
          '/signup',
          '/pricing',
          '/contact',
          '/terms',
          '/privacy',
          '/refund-policy',
          '/shipping-policy',
          '/data-deletion',
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/inbox/',
          '/contacts/',
          '/pipelines/',
          '/broadcasts/',
          '/automations/',
          '/flows/',
          '/agents/',
          '/settings/',
          '/billing/',
          '/super-admin/',
          '/join/',
          '/meta/',
          '/webhook/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
