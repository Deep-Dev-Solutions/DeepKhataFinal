import { useState, useEffect } from "react";
import { X, RefreshCcw } from "lucide-react";

type Branch = { id: string; name: string; cabinets: Cabinet[] };
type Cabinet = { id: string; name: string; location?: string };
type Product = { id: string; name: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onRestock: (data: any) => Promise<void>;
  products: Product[];
  apiBaseUrl: string;
};

export default function BulkRestockModal({
  isOpen,
  onClose,
  onRestock,
  products,
  apiBaseUrl,
}: Props) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);

  const [productId, setProductId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [cabinetId, setCabinetId] = useState("");
  const [quantity, setQuantity] = useState(50);
  const [condition, setCondition] = useState("ORIGINAL_PULL");

  useEffect(() => {
    if (isOpen) {
      fetchBranches();
    }
  }, [isOpen]);

  const fetchBranches = async () => {
    try {
      const accessToken = localStorage.getItem("accessToken");
      const headers = {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      };
      const res = await fetch(`${apiBaseUrl}/product/getbranches`, { headers });
      const data = await res.json();
      if (data.success) {
        setBranches(data.branches);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const selectedBranch = branches.find((b) => b.id === branchId);
  const cabinets = selectedBranch ? selectedBranch.cabinets : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !quantity || quantity < 1) return;
    setLoading(true);
    try {
      await onRestock({ productId, branchId, cabinetId, condition, quantity });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in zoom-in-95">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-xl font-bold text-slate-900 mb-1 flex items-center gap-2">
          <RefreshCcw className="w-5 h-5 text-blue-600" />
          Bulk Restock
        </h3>
        <p className="text-sm text-slate-500 mb-6">
          Instantly populate inventory across branches.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Product
            </label>
            <select
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2.5"
            >
              <option value="">Select Product...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Branch
              </label>
              <select
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setCabinetId("");
                }}
                className="w-full border border-slate-300 rounded-lg p-2.5"
              >
                <option value="">(Default / None)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Cabinet
              </label>
              <select
                value={cabinetId}
                onChange={(e) => setCabinetId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5"
                disabled={!branchId || cabinets.length === 0}
              >
                <option value="">(Any Cabinet)</option>
                {cabinets.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Condition
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5"
              >
                <option value="ORIGINAL_PULL">Original Pull</option>
                <option value="COPY">Copy</option>
                <option value="MINOR_SCRATCHES">Minor Scratches</option>
                <option value="WORKING">Working</option>
                <option value="DEAD_DONOR">Dead Donor</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Quantity
              </label>
              <input
                required
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value))}
                className="w-full border border-slate-300 rounded-lg p-2.5"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl disabled:opacity-50"
            >
              {loading ? "Restocking..." : "Confirm Restock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
