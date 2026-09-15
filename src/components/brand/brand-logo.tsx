'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number;
  showText?: boolean;
  textClassName?: string;
  className?: string;
  imageClassName?: string;
  variant?: 'plain' | 'rounded-box' | 'glow';
  priority?: boolean;
}

const sizeMap = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 48,
  xl: 64,
  '2xl': 80,
};

export function BrandLogo({
  size = 'md',
  showText = false,
  textClassName,
  className,
  imageClassName,
  variant = 'plain',
  priority = false,
}: BrandLogoProps) {
  const pixelSize = typeof size === 'number' ? size : sizeMap[size] || 36;

  // Determine optimal image source based on display size
  const imageSrc =
    pixelSize <= 36
      ? '/brand/logo-64.png'
      : pixelSize <= 96
      ? '/brand/logo-192.png'
      : '/brand/logo-512.png';

  const logoImage = (
    <div
      className={cn(
        'relative flex items-center justify-center shrink-0 transition-transform select-none',
        variant === 'glow' &&
          'drop-shadow-[0_2px_10px_rgba(124,58,237,0.3)] dark:drop-shadow-[0_0_16px_rgba(168,85,247,0.45)]',
        variant === 'rounded-box' &&
          'rounded-xl border border-primary/20 bg-primary/5 p-1 shadow-sm backdrop-blur-sm dark:border-primary/30 dark:bg-primary/10',
        className
      )}
      style={{ width: pixelSize, height: pixelSize }}
    >
      <Image
        src={imageSrc}
        alt="Aibotflow"
        width={pixelSize}
        height={pixelSize}
        priority={priority}
        className={cn(
          'h-full w-full object-contain drop-shadow-[0_2px_6px_rgba(124,58,237,0.2)] dark:drop-shadow-[0_0_12px_rgba(168,85,247,0.35)]',
          imageClassName
        )}
      />
    </div>
  );

  if (!showText) {
    return logoImage;
  }

  return (
    <div className="flex items-center gap-2.5">
      {logoImage}
      <span
        className={cn(
          'font-bold tracking-tight text-foreground select-none',
          pixelSize <= 28 ? 'text-base' : pixelSize <= 36 ? 'text-lg' : 'text-xl',
          textClassName
        )}
      >
        Aibotflow
      </span>
    </div>
  );
}
