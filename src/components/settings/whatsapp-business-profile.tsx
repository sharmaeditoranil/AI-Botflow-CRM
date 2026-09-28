'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Store,
  ShoppingBag,
  Info,
  CheckCircle2,
  Loader2,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  Globe,
  ExternalLink,
  Save,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface WhatsAppBusinessProfileData {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profile_picture_url?: string;
  websites?: string[];
  vertical?: string;
}

interface WhatsAppCommerceData {
  is_catalog_visible?: boolean;
  is_cart_enabled?: boolean;
}

const VERTICAL_OPTIONS = [
  { value: 'UNDEFINED', label: 'Other / Not Specified' },
  { value: 'OTHER', label: 'General Business' },
  { value: 'EDUCATION', label: 'Education / Academy / Coaching' },
  { value: 'ENTERTAINMENT', label: 'Photography / Studio / Entertainment' },
  { value: 'RETAIL', label: 'Retail / Shopping' },
  { value: 'PROF_SERVICES', label: 'Professional Services' },
  { value: 'FINANCE', label: 'Finance & Banking' },
  { value: 'HEALTH', label: 'Health & Medical' },
  { value: 'RESTAURANT', label: 'Restaurant / Food' },
  { value: 'TRAVEL', label: 'Travel & Tourism' },
];

export function WhatsAppBusinessProfileManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);

  // Profile Form States
  const [about, setAbout] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [vertical, setVertical] = useState('EDUCATION');
  const [profilePicUrl, setProfilePicUrl] = useState('');

  // Commerce / Catalog States
  const [isCatalogVisible, setIsCatalogVisible] = useState(true);
  const [isCartEnabled, setIsCartEnabled] = useState(true);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/whatsapp/business-profile');
      const data = await res.json();

      if (!res.ok || !data.configured) {
        setConfigured(false);
        return;
      }

      setConfigured(true);
      if (data.profile) {
        const p: WhatsAppBusinessProfileData = data.profile;
        setAbout(p.about || '');
        setDescription(p.description || '');
        setAddress(p.address || '');
        setEmail(p.email || '');
        setWebsite(p.websites && p.websites.length > 0 ? p.websites[0] : '');
        setVertical(p.vertical || 'EDUCATION');
        setProfilePicUrl(p.profile_picture_url || '');
      }

      if (data.commerce) {
        const c: WhatsAppCommerceData = data.commerce;
        setIsCatalogVisible(c.is_catalog_visible ?? true);
        setIsCartEnabled(c.is_cart_enabled ?? true);
      }
    } catch (err) {
      console.error('Failed to load WhatsApp business profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSave = async () => {
    if (about.length > 139) {
      toast.error('About text cannot exceed 139 characters.');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        about: about.trim(),
        description: description.trim(),
        address: address.trim(),
        email: email.trim(),
        websites: website.trim() ? [website.trim()] : [],
        vertical,
        is_catalog_visible: isCatalogVisible,
        is_cart_enabled: isCartEnabled,
      };

      const res = await fetch('/api/whatsapp/business-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      if (data.warning) {
        toast.warning(data.warning);
      } else {
        toast.success('WhatsApp Profile & Catalog settings updated successfully!');
      }

      // Re-fetch to confirm sync
      fetchProfile();
    } catch (err: any) {
      toast.error(err.message || 'Error updating profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="border border-border/60">
        <CardContent className="flex items-center justify-center p-8 gap-3 text-muted-foreground text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span>Loading WhatsApp Business Profile & Catalog Settings...</span>
        </CardContent>
      </Card>
    );
  }

  // Always render the card so the user can see it!

  return (
    <Card className="border border-border/70 shadow-sm overflow-hidden">
      <CardHeader className="bg-muted/20 border-b border-border/50 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-emerald-500" />
              <CardTitle className="text-base font-semibold">
                WhatsApp Business Profile & Catalog
              </CardTitle>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                Live Meta API
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Apna WhatsApp **About (Status)**, business description, address aur **Catalog visibility** yahan se live update karein.
            </CardDescription>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={fetchProfile}
            disabled={loading || saving}
            className="text-xs gap-1.5 h-8 self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-5 sm:p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Form: Edit Profile & Catalog */}
          <div className="lg:col-span-7 space-y-5">
            
            {/* 1. About / Status Field */}
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="wa-about" className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  About (WhatsApp Status)
                </Label>
                <span
                  className={`text-[11px] font-mono font-medium ${
                    about.length > 130 ? 'text-amber-500 font-bold' : 'text-muted-foreground'
                  }`}
                >
                  {about.length}/139 chars
                </span>
              </div>
              <Input
                id="wa-about"
                value={about}
                onChange={(e) => setAbout(e.target.value.slice(0, 139))}
                placeholder="e.g. Quick Art Photography Academy – Live Support WhatsApp Channel"
                className="bg-background text-sm font-medium"
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                👉 Yeh wahi text hai jo WhatsApp par aapki DP aur naam ke theek neeche dikhta hai. (Max 139 characters).
              </p>
            </div>

            {/* 2. Catalog & Commerce Settings */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">
                  WhatsApp Product Catalog Settings
                </h4>
              </div>

              <div className="flex items-start justify-between gap-4 pt-1">
                <div className="space-y-0.5">
                  <Label htmlFor="toggle-catalog" className="text-xs font-semibold cursor-pointer">
                    Show Catalog on WhatsApp (Storefront 🛍️ Icon)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Jab koi customer WhatsApp par connect/chat karega, toh unhe chat header aur profile me **Catalog button automatically** dikhega.
                  </p>
                </div>
                <Switch
                  id="toggle-catalog"
                  checked={isCatalogVisible}
                  onCheckedChange={setIsCatalogVisible}
                />
              </div>

              <div className="flex items-start justify-between gap-4 pt-2 border-t border-border/40">
                <div className="space-y-0.5">
                  <Label htmlFor="toggle-cart" className="text-xs font-semibold cursor-pointer">
                    Enable Shopping Cart
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Customers can add multiple items to their WhatsApp cart and place direct orders.
                  </p>
                </div>
                <Switch
                  id="toggle-cart"
                  checked={isCartEnabled}
                  onCheckedChange={setIsCartEnabled}
                />
              </div>

              <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  💡 Naya product add karne ke liye CRM Products list use karein.
                </span>
                <Link
                  href="/automations"
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  Auto-send Catalog setup <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* 3. Business Description */}
            <div className="space-y-1.5">
              <Label htmlFor="wa-desc" className="text-xs font-semibold text-foreground">
                Business Description
              </Label>
              <Textarea
                id="wa-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Aapke business, courses ya services ke baare me detail..."
                className="bg-background text-xs resize-none"
              />
            </div>

            {/* 4. Category / Vertical */}
            <div className="space-y-1.5">
              <Label htmlFor="wa-vertical" className="text-xs font-semibold text-foreground">
                Industry / Category
              </Label>
              <select
                id="wa-vertical"
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {VERTICAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 5. Contact Details (Address, Email, Website) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="wa-email" className="text-xs font-semibold text-foreground">
                  Support Email
                </Label>
                <Input
                  id="wa-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="support@example.com"
                  className="bg-background text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="wa-website" className="text-xs font-semibold text-foreground">
                  Website URL
                </Label>
                <Input
                  id="wa-website"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  className="bg-background text-xs"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="wa-address" className="text-xs font-semibold text-foreground">
                  Business Address / Location
                </Label>
                <Input
                  id="wa-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Shop / Office address..."
                  className="bg-background text-xs"
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving to Meta WhatsApp...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save WhatsApp Profile & Catalog
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Right Preview Card: Realistic Mobile WhatsApp Profile */}
          <div className="lg:col-span-5 bg-muted/30 border border-border/70 rounded-2xl p-4 flex flex-col items-center">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              📱 Live WhatsApp Profile Preview
            </span>

            {/* Phone Mockup Container */}
            <div className="w-full max-w-[280px] bg-background border-2 border-border/80 rounded-3xl shadow-lg overflow-hidden flex flex-col text-left">
              {/* WhatsApp Profile Top Header */}
              <div className="bg-[#008069] text-white p-3 flex items-center justify-between text-xs font-medium">
                <span className="truncate">Quick Art Photography</span>
                {isCatalogVisible && (
                  <span className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full text-[10px]">
                    <ShoppingBag className="w-3 h-3" /> Catalog
                  </span>
                )}
              </div>

              {/* Profile Image & Name Section */}
              <div className="p-4 flex flex-col items-center text-center border-b border-border/50 bg-muted/10">
                <div className="w-16 h-16 rounded-full bg-emerald-600/10 border-2 border-emerald-500/30 flex items-center justify-center overflow-hidden mb-2 shadow-sm">
                  {profilePicUrl ? (
                    <img
                      src={profilePicUrl}
                      alt="WhatsApp DP"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Store className="w-8 h-8 text-emerald-600" />
                  )}
                </div>
                <h3 className="font-bold text-sm text-foreground">
                  Quick Art Photography
                </h3>
                <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3 h-3 fill-emerald-500 text-white" /> Official Business Account
                </span>

                {isCatalogVisible && (
                  <div className="mt-2.5 w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                    <span>View Catalog</span>
                  </div>
                )}
              </div>

              {/* About Box Preview */}
              <div className="p-3 border-b border-border/50">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                  About
                </span>
                <p className="text-xs font-medium text-foreground mt-0.5 leading-snug break-words">
                  {about.trim() || 'Hey there! I am using WhatsApp.'}
                </p>
              </div>

              {/* Description & Details */}
              <div className="p-3 space-y-2 text-[11px] text-muted-foreground">
                {description && (
                  <p className="text-[11px] text-foreground/80 line-clamp-3 leading-relaxed">
                    {description}
                  </p>
                )}

                {address && (
                  <div className="flex items-start gap-1.5 pt-1">
                    <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="truncate">{address}</span>
                  </div>
                )}

                {email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{email}</span>
                  </div>
                )}

                {website && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate text-primary">{website}</span>
                  </div>
                )}
              </div>
            </div>

            <p className="text-[10px] text-center text-muted-foreground mt-3 px-2">
              Save karne par WhatsApp customer profile par ye changes turant reflect honge.
            </p>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
