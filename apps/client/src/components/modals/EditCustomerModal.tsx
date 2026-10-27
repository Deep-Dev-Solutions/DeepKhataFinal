"use client";

import { useState } from "react";
import { User, Phone, Mail, MapPin, QrCode, Save } from "lucide-react";
import { Customer } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface EditCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
  onSave: (updatedData: Customer) => void;
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
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Edit Customer Details"
      description="Update contact and KYC information."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-customer-form" loading={isSubmitting}>
            {!isSubmitting && <Save className="w-4 h-4" />}
            {isSubmitting ? "Saving..." : "Save Details"}
          </Button>
        </>
      }
    >
      <form id="edit-customer-form" onSubmit={handleSubmit} className="space-y-3">

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-caption font-medium text-gray-700">Full Name</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-2.5 top-1/2 w-4 h-4 -translate-y-1/2 text-gray-400" />
              <Input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="pl-9" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-caption font-medium text-gray-700">Phone Number</label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-2.5 top-1/2 w-4 h-4 -translate-y-1/2 text-gray-400" />
              <Input type="text" required value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-9" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-caption font-medium text-gray-700">Email Address</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-2.5 top-1/2 w-4 h-4 -translate-y-1/2 text-gray-400" />
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" className="pl-9" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-caption font-medium text-gray-700">CNIC Number</label>
            <div className="relative">
              <QrCode className="pointer-events-none absolute left-2.5 top-1/2 w-4 h-4 -translate-y-1/2 text-gray-400" />
              <Input type="text" value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="xxxxx-xxxxxxx-x" className="pl-9 font-mono" />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-caption font-medium text-gray-700">Guarantor Phone (Zamanat)</label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-2.5 top-1/2 w-4 h-4 -translate-y-1/2 text-gray-400" />
            <Input type="text" value={guarantor} onChange={(e) => setGuarantor(e.target.value)} placeholder="Optional reference number" className="pl-9" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-caption font-medium text-gray-700">Shipping Address</label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="House / Shop address..." className="w-full resize-none rounded-md border border-border bg-card py-2 pl-9 pr-2.5 text-body text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>

      </form>
    </Modal>
  );
}
