"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  List,
  Loader2,
  Download,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "@/lib/auth";

export default function BulkImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setParsedData([]);
      setErrors([]);
      setUploadSuccess(false);
      parseCSV(selectedFile);
    }
  };

  const parseCSV = (file: File) => {
    setIsParsing(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setIsParsing(false);
        const data = results.data;
        const validationErrors: string[] = [];

        if (data.length === 0) {
          validationErrors.push("The CSV file is empty.");
        } else {
          // Check headers
          const expectedHeaders = [
            "Name",
            "Category",
            "Price",
            "Quantity",
            "SKU",
            "Condition",
          ];
          const actualHeaders = Object.keys(data[0] as any);

          const missingHeaders = expectedHeaders.filter(
            (h) =>
              !actualHeaders.some((ah) => ah.toLowerCase() === h.toLowerCase()),
          );

          if (missingHeaders.length > 0) {
            validationErrors.push(
              `Missing required columns: ${missingHeaders.join(", ")}`,
            );
          }
        }

        if (validationErrors.length > 0) {
          setErrors(validationErrors);
          setParsedData([]);
        } else {
          setParsedData(data);
        }
      },
      error: (error) => {
        setIsParsing(false);
        setErrors([error.message]);
      },
    });
  };

  const handleUpload = async () => {
    if (parsedData.length === 0) return;

    setIsUploading(true);
    setErrors([]);

    try {
      const response = await fetch(`${API_BASE_URL}/product/import`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ products: parsedData }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to import products");
      }

      setUploadSuccess(true);
      setParsedData([]);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err: any) {
      setErrors([err.message || "An unexpected error occurred."]);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent =
      "data:text/csv;charset=utf-8,Name,Category,Price,Quantity,SKU,Condition\nExample Product,Accessories,500,10,SKU-1234,ORIGINAL_PULL\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "deepkhata_inventory_template.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto animate-in fade-in duration-500 pb-12 mt-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 bg-white text-slate-400 hover:text-slate-900 rounded-lg border border-slate-200 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Bulk Data Import
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Upload an Excel/CSV file to instantly populate your inventory
              catalog.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Upload Box */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center">
            <div className="max-w-md mx-auto space-y-6">
              <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
                <UploadCloud className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  Upload Inventory File
                </h3>
                <p className="text-sm text-slate-500 mb-6">
                  Select a valid CSV file. Maximum 1000 rows per import.
                </p>

                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-sm shadow-blue-200 disabled:opacity-50"
                  >
                    {isParsing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-5 h-5" />
                    )}
                    {isParsing ? "Reading File..." : "Browse CSV File"}
                  </button>
                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 px-4 py-3 text-slate-700 font-semibold bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                  >
                    <Download className="w-4 h-4" /> Template
                  </button>
                </div>
              </div>

              {file && (
                <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-2 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                      {file.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  {parsedData.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
                      <CheckCircle2 className="w-4 h-4" /> Ready to import{" "}
                      {parsedData.length} products
                    </div>
                  )}
                </div>
              )}

              {errors.length > 0 && (
                <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl text-left">
                  <h4 className="text-sm font-bold text-rose-800 flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4" /> Validation Errors
                  </h4>
                  <ul className="list-disc pl-5 text-sm text-rose-700 space-y-1">
                    {errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {uploadSuccess && (
                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-left">
                  <h4 className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" /> Import Successful!
                  </h4>
                  <p className="text-sm text-emerald-700 mt-1">
                    Your inventory has been updated. You can view the new
                    products in the inventory hub.
                  </p>
                  <button
                    onClick={() => router.push("/inventory")}
                    className="mt-3 text-sm font-bold text-emerald-700 hover:text-emerald-800 underline"
                  >
                    Go to Inventory &rarr;
                  </button>
                </div>
              )}
            </div>
          </div>

          {parsedData.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <List className="w-4 h-4 text-slate-500" /> Data Preview
                  (First 5 rows)
                </h3>
                <button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800 transition-all disabled:opacity-50"
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UploadCloud className="w-4 h-4" />
                  )}
                  {isUploading
                    ? "Importing..."
                    : `Start Import (${parsedData.length})`}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-100 text-xs uppercase font-bold text-slate-500">
                    <tr>
                      <th className="p-3">Name</th>
                      <th className="p-3">Category</th>
                      <th className="p-3 text-right">Price</th>
                      <th className="p-3 text-right">Qty</th>
                      <th className="p-3">SKU</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedData.slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-3 font-medium text-slate-900">
                          {row.Name || row.name}
                        </td>
                        <td className="p-3">{row.Category || row.category}</td>
                        <td className="p-3 text-right">
                          Rs. {row.Price || row.price}
                        </td>
                        <td className="p-3 text-right">
                          {row.Quantity || row.quantity}
                        </td>
                        <td className="p-3">{row.SKU || row.sku}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedData.length > 5 && (
                <div className="p-3 bg-slate-50 text-center text-xs text-slate-500 border-t border-slate-100">
                  Showing 5 of {parsedData.length} records
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Instructions */}
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
            <h3 className="text-base font-bold text-blue-950 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600" /> Import
              Instructions
            </h3>

            <div className="space-y-4 text-sm text-blue-900">
              <p>
                To ensure a successful import, please download the template and
                fill it out exactly as shown.
              </p>

              <div className="space-y-2">
                <h4 className="font-bold">Required Columns:</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <span className="font-mono bg-blue-100 px-1 rounded">
                      Name
                    </span>{" "}
                    - Product Name
                  </li>
                  <li>
                    <span className="font-mono bg-blue-100 px-1 rounded">
                      Category
                    </span>{" "}
                    - Auto-created if new
                  </li>
                  <li>
                    <span className="font-mono bg-blue-100 px-1 rounded">
                      Price
                    </span>{" "}
                    - Selling price (numbers only)
                  </li>
                  <li>
                    <span className="font-mono bg-blue-100 px-1 rounded">
                      Quantity
                    </span>{" "}
                    - Stock amount
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold">Optional Columns:</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <span className="font-mono bg-blue-100 px-1 rounded">
                      SKU
                    </span>{" "}
                    - Auto-generated if empty
                  </li>
                  <li>
                    <span className="font-mono bg-blue-100 px-1 rounded">
                      Condition
                    </span>{" "}
                    - e.g. ORIGINAL_PULL, COPY
                  </li>
                </ul>
              </div>

              <div className="mt-4 pt-4 border-t border-blue-200">
                <p className="text-xs">
                  <strong>Note:</strong> Very large catalogs (1000+ items)
                  should be split into multiple CSV files.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
