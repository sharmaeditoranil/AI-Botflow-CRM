'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShoppingBag, Loader2, Search, Send, Plus, Tag, Package } from 'lucide-react';
import { toast } from 'sonner';

export interface ProductItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  sku?: string;
  category?: string;
}

interface ProductCatalogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendProduct: (message: string, imageUrl?: string) => void;
}

export function ProductCatalogModal({
  open,
  onOpenChange,
  onSendProduct,
}: ProductCatalogModalProps) {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [addingProduct, setAddingProduct] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newImage, setNewImage] = useState('');
  const [newSku, setNewSku] = useState('');

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/catalog/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch (err) {
      console.error('Error loading products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchProducts();
    }
  }, [open]);

  const handleCreateProduct = async () => {
    if (!newName.trim() || !newPrice) {
      toast.error('Product name and price are required.');
      return;
    }

    try {
      const res = await fetch('/api/catalog/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          price: parseFloat(newPrice),
          description: newDesc.trim(),
          image_url: newImage.trim(),
          sku: newSku.trim(),
        }),
      });

      if (res.ok) {
        toast.success('Product added to catalog!');
        setNewName('');
        setNewPrice('');
        setNewDesc('');
        setNewImage('');
        setNewSku('');
        setAddingProduct(false);
        fetchProducts();
      } else {
        toast.error('Failed to create product.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error creating product.');
    }
  };

  const handleSelectProduct = (p: ProductItem) => {
    const formattedMessage =
      `🛍️ *${p.name}*\n\n` +
      `💰 *Price:* ₹${p.price.toLocaleString('en-IN')}\n` +
      (p.sku ? `📦 *SKU:* ${p.sku}\n` : '') +
      (p.description ? `📝 *Description:* ${p.description}\n\n` : '\n') +
      `👉 *Reply "Order ${p.name}" to confirm your order immediately!*`;

    onSendProduct(formattedMessage, p.image_url);
    toast.success(`Sent ${p.name} to customer!`);
    onOpenChange(false);
  };

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())) ||
    (p.category && p.category.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl border-border bg-card max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <ShoppingBag className="h-5 w-5 text-purple-500" />
                WhatsApp Product Catalog
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Send catalog items directly to this chat. When customer replies "Order", it lands in Inbox & Pipeline!
              </DialogDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddingProduct(!addingProduct)}
              className="text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10"
            >
              <Plus className="h-3.5 w-3.5" />
              {addingProduct ? 'View Products' : 'Add Product'}
            </Button>
          </div>
        </DialogHeader>

        {addingProduct ? (
          <div className="space-y-3 p-4 rounded-xl border border-border/70 bg-muted/20 my-2">
            <h4 className="text-xs font-bold text-foreground">Add New Catalog Product</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Product Title *</label>
                <Input
                  placeholder="e.g. Smart Wireless Earbuds"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 text-xs bg-card"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Price (₹ INR) *</label>
                <Input
                  type="number"
                  placeholder="1499"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="h-8 text-xs bg-card"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">SKU / Code</label>
                <Input
                  placeholder="e.g. EAR-01"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  className="h-8 text-xs bg-card"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Product Image URL</label>
                <Input
                  placeholder="https://... image.jpg"
                  value={newImage}
                  onChange={(e) => setNewImage(e.target.value)}
                  className="h-8 text-xs bg-card"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Description</label>
                <Input
                  placeholder="e.g. High-fidelity audio, 30-hour battery life with fast USB-C charging."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="h-8 text-xs bg-card"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="ghost" onClick={() => setAddingProduct(false)} className="text-xs">
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateProduct} className="text-xs bg-primary text-primary-foreground">
                Save to Catalog
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products by title, SKU, or category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs bg-muted/40 border-border"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 max-h-[50vh] pr-1">
              {loading ? (
                <div className="py-12 flex justify-center items-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-xs space-y-2">
                  <Package className="h-8 w-8 mx-auto opacity-40" />
                  <p>No products found in your catalog.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddingProduct(true)}
                    className="text-xs"
                  >
                    + Add Your First Product
                  </Button>
                </div>
              ) : (
                filtered.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-border/80 bg-muted/20 hover:bg-muted/40 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="h-12 w-12 rounded-lg object-cover bg-muted shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                          <ShoppingBag className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{p.name}</p>
                        {p.description && (
                          <p className="text-[11px] text-muted-foreground truncate">{p.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-extrabold text-emerald-500">
                            ₹{p.price.toLocaleString('en-IN')}
                          </span>
                          {p.sku && (
                            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                              {p.sku}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleSelectProduct(p)}
                      className="text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                    >
                      <Send className="h-3 w-3" />
                      Send to Chat
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
