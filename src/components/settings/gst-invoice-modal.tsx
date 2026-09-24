'use client';

import React, { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Download, CheckCircle, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '@/components/brand/brand-logo';

export interface InvoiceRecord {
  id: string;
  invoice_number?: string;
  amount: number;
  taxable_amount?: number;
  gst_rate?: number;
  gst_amount?: number;
  business_name?: string;
  gst_number?: string;
  billing_address?: string;
  billing_state?: string;
  currency?: string;
  status: string;
  gateway_payment_id?: string;
  created_at: string;
  subscription?: {
    billing_cycle?: string;
    plan?: {
      name: string;
      slug: string;
    };
  };
}

interface GstInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceRecord | null;
  account?: {
    name?: string;
    gst_number?: string;
    business_name?: string;
    billing_address?: string;
    billing_state?: string;
  };
}

export function GstInvoiceModal({
  open,
  onOpenChange,
  invoice,
  account,
}: GstInvoiceModalProps) {
  const invoiceRef = useRef<HTMLDivElement>(null);

  if (!invoice) return null;

  const invoiceNumber = invoice.invoice_number || `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
  const invoiceDate = new Date(invoice.created_at).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const totalAmount = Number(invoice.amount) || 0;
  const taxableAmount =
    invoice.taxable_amount !== undefined && invoice.taxable_amount !== null
      ? Number(invoice.taxable_amount)
      : Math.round((totalAmount / 1.18) * 100) / 100;
  const gstAmount =
    invoice.gst_amount !== undefined && invoice.gst_amount !== null
      ? Number(invoice.gst_amount)
      : Math.round((totalAmount - taxableAmount) * 100) / 100;

  const halfGst = Math.round((gstAmount / 2) * 100) / 100;

  const planName = invoice.subscription?.plan?.name || 'Aibotflow Subscription';
  const billingCycle = invoice.subscription?.billing_cycle || 'monthly';
  const customerBusiness = invoice.business_name || account?.business_name || account?.name || 'Valued Customer';
  const customerGst = invoice.gst_number || account?.gst_number || 'Unregistered / Consumer';
  const customerAddress = invoice.billing_address || account?.billing_address || 'India';
  const customerState = invoice.billing_state || account?.billing_state || 'Delhi (07)';

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 sm:p-6 bg-background">
        <DialogHeader className="p-4 sm:p-0 flex flex-row items-center justify-between border-b pb-4">
          <div>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              Tax Invoice
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              GST Compliant Invoice ({invoiceNumber})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              className="gap-1.5 text-xs"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / Save PDF
            </Button>
          </div>
        </DialogHeader>

        {/* Printable Invoice Container */}
        <div
          ref={invoiceRef}
          id="printable-gst-invoice"
          className="p-6 bg-white text-slate-900 rounded-lg shadow-sm border border-slate-200 text-sm font-sans my-2"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-5">
            <div className="flex items-start gap-3.5">
              <img
                src="/brand/logo.png"
                alt="Aibotflow Logo"
                className="h-12 w-12 object-contain rounded-lg shrink-0 border border-slate-200 p-0.5 bg-slate-50 shadow-xs"
              />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-extrabold text-2xl tracking-tight text-purple-700">
                    Aibotflow
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    PAID
                  </span>
                </div>
                <p className="text-xs text-slate-600 font-medium">Aibotflow CRM Technologies</p>
                <p className="text-xs text-slate-500">Cloud Software & WhatsApp Automation Services</p>
                <p className="text-xs text-slate-600 mt-1">
                  <span className="font-semibold text-slate-700">GSTIN:</span> 10JLWPS8995A1ZA
                </p>
                <p className="text-xs text-slate-500">State: Bihar (10) | https://dash.aibotflow.in | support@aibotflow.in</p>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-purple-50 text-purple-800 border border-purple-200 rounded font-bold text-xs uppercase tracking-wider mb-2">
                Tax Invoice
              </span>
              <p className="text-xs text-slate-500">
                Invoice No: <span className="font-bold text-slate-800">{invoiceNumber}</span>
              </p>
              <p className="text-xs text-slate-500">
                Invoice Date: <span className="font-medium text-slate-800">{invoiceDate}</span>
              </p>
              <p className="text-xs text-slate-500">
                Payment Ref: <span className="font-mono text-[11px] text-slate-700">{invoice.gateway_payment_id || 'ONLINE'}</span>
              </p>
            </div>
          </div>

          {/* Billed To / Customer Details */}
          <div className="grid grid-cols-2 gap-4 py-4 border-b border-slate-200 text-xs">
            <div>
              <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-1">
                Billed To (Customer):
              </p>
              <p className="text-sm font-bold text-slate-800">{customerBusiness}</p>
              <p className="text-slate-600 mt-0.5">{customerAddress}</p>
              <p className="text-slate-600">
                <span className="font-semibold">State:</span> {customerState}
              </p>
              <p className="text-slate-700 mt-1">
                <span className="font-semibold">GSTIN / UIN:</span>{' '}
                <span className="font-mono font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                  {customerGst}
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-1">
                Service Details:
              </p>
              <p className="text-slate-600">
                <span className="font-semibold">SAC Code:</span> 998313 (IT & Cloud SaaS)
              </p>
              <p className="text-slate-600">
                <span className="font-semibold">Place of Supply:</span> {customerState}
              </p>
              <p className="text-slate-600">
                <span className="font-semibold">Payment Status:</span> 100% Fully Paid
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="py-4">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase font-semibold text-[10px]">
                  <th className="p-2.5 rounded-l">Item Description</th>
                  <th className="p-2.5">SAC Code</th>
                  <th className="p-2.5">Cycle</th>
                  <th className="p-2.5 text-right">Taxable Amt (₹)</th>
                  <th className="p-2.5 text-right">GST Rate</th>
                  <th className="p-2.5 text-right rounded-r">Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-2.5">
                    <p className="font-bold text-slate-800">{planName}</p>
                    <p className="text-[11px] text-slate-500">
                      WhatsApp CRM, AI Automations, Team Inbox & Broadcasts
                    </p>
                  </td>
                  <td className="p-2.5 text-slate-600 font-mono">998313</td>
                  <td className="p-2.5 text-slate-600 capitalize">{billingCycle}</td>
                  <td className="p-2.5 text-right font-medium text-slate-800">
                    ₹{taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-2.5 text-right text-slate-600">18%</td>
                  <td className="p-2.5 text-right font-bold text-slate-900">
                    ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Tax Breakdown & Total */}
          <div className="flex justify-end pt-2 pb-4 border-t border-slate-200">
            <div className="w-64 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Taxable Subtotal:</span>
                <span className="font-medium text-slate-800">
                  ₹{taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>CGST (9%):</span>
                <span>₹{halfGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>SGST (9%):</span>
                <span>₹{halfGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-slate-600 font-medium">
                <span>Total GST (18%):</span>
                <span>₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-2 border-t border-slate-300">
                <span>Grand Total (INR):</span>
                <span className="text-purple-700">
                  ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="pt-4 border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-600">Terms & Declaration:</p>
              <p>This is a computer-generated tax invoice issued under Rule 46 of CGST Act, 2017.</p>
              <p>Electronic supply of SaaS software services. Input Tax Credit (ITC) eligible for valid GSTIN.</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-700">Authorized Signatory</p>
              <p className="text-purple-600 font-mono text-[9px]">Aibotflow Systems Verified</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
