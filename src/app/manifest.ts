import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Aibotflow — WhatsApp CRM & AI Automation',
    short_name: 'Aibotflow',
    description: 'Enterprise WhatsApp CRM with AI conversation memory, dynamic broadcasts, and multi-channel automations.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0f',
    theme_color: '#7c3aed',
    icons: [
      {
        src: '/brand/app-icon-64.png',
        sizes: '64x64',
        type: 'image/png',
      },
      {
        src: '/brand/app-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/brand/app-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
