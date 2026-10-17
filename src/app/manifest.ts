import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Aibotflow — WhatsApp CRM & AI Automation',
    short_name: 'Aibotflow',
    description: 'Enterprise WhatsApp CRM with AI conversation memory, dynamic broadcasts, and multi-channel automations.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#00a884',
    icons: [
      {
        src: '/brand/app-icon-64.png?v=8',
        sizes: '64x64',
        type: 'image/png',
      },
      {
        src: '/brand/app-icon-192.png?v=8',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/app-icon-maskable-192.png?v=8',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/brand/app-icon-512.png?v=8',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/app-icon-maskable-512.png?v=8',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
