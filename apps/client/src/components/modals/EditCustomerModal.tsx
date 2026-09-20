"use client";

import { useState } from "react";
import { X, User, Phone, Mail, MapPin, QrCode, Save } from "lucide-react";

interface EditCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: any; // We pass the current customer data to pre-fill the form
  onSave: (updatedData: any) => void;
}

export default function EditCustomerModal({ isOpen, onClose, customer, onSave }: EditCustomerModalProps) {
  // Pre-fill the state with existing customer data
  const [name, setName] = useState(customer.name || "");
  const [phone, setPhone] = useState(customer.phone || "");
  const [email, setEmail] = useState(customer.email || "");
  const [cnic, setCnic] = useState(customer.cnic || "");
  const [guarantor, setGuarantor] = useState(customer.guarantorPhone || "");
  const [address, setAddress] = useState(customer.address || "");
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API Call delay
    setTimeout(() => {
      onSave({
        ...customer,
        name, phone, email, cnic, guarantorPhone: guarantor, address
      });
      setIsSubmitting(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={onClose} 
      />

      {/* Modal Card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Edit Customer Details</h2>
            <p className="text-xs text-slate-500 mt-0.5">Update contact and KYC information.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Phone Number</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input type="text" required value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">CNIC Number</label>
              <div className="relative">
                <QrCode className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input type="text" value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="xxxxx-xxxxxxx-x" className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Guarantor Phone (Zamanat)</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input type="text" value={guarantor} onChange={(e) => setGuarantor(e.target.value)} placeholder="Optional reference number" className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Shipping Address</label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="House / Shop address..." className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-70">
              {isSubmitting ? "Saving..." : "Save Details"}
              {!isSubmitting && <Save className="w-4 h-4" />}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}