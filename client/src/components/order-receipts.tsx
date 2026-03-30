import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Sale } from "@/lib/store";
import { format } from "date-fns";

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function ReceiptTab({
  sale,
  index,
  onClose,
}: {
  sale: Sale;
  index: number;
  onClose: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const label = `R${index + 1}`;
  const namePreview = sale.customerName
    ? sale.customerName.length > 5
      ? sale.customerName.slice(0, 5) + "…"
      : sale.customerName
    : label;

  return (
    <div className="relative flex flex-col items-center" data-testid={`receipt-tab-${sale.id}`}>
      <div className="w-10 h-3 bg-amber-700/80 rounded-b-sm shadow-sm z-10" />

      <div className="w-[2px] h-2 bg-amber-900/40" />

      <AnimatePresence mode="wait">
        {!expanded ? (
          <motion.button
            key="collapsed"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setExpanded(true)}
            className="cursor-pointer group"
            data-testid={`receipt-collapsed-${sale.id}`}
          >
            <div
              className="relative bg-amber-50 border border-amber-200/60 shadow-md px-2.5 py-2 min-w-[56px] text-center"
              style={{
                clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 6px), 85% 100%, 70% calc(100% - 4px), 55% 100%, 40% calc(100% - 4px), 25% 100%, 10% calc(100% - 6px), 0 calc(100% - 3px))",
              }}
            >
              <p className="text-[10px] font-bold text-amber-900/70 tracking-wide">{label}</p>
              <p className="text-[9px] text-amber-800/60 mt-0.5 font-medium truncate max-w-[52px]">{namePreview}</p>
            </div>
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="z-20"
            data-testid={`receipt-expanded-${sale.id}`}
          >
            <div
              className="relative bg-amber-50 border border-amber-200/60 shadow-lg w-[180px]"
              style={{
                clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 8px), 90% 100%, 80% calc(100% - 5px), 70% 100%, 60% calc(100% - 5px), 50% 100%, 40% calc(100% - 5px), 30% 100%, 20% calc(100% - 5px), 10% 100%, 0 calc(100% - 8px))",
              }}
            >
              <div className="px-3 pt-2 pb-1 border-b border-dashed border-amber-300/50">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-amber-900">{label}</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
                    className="text-amber-600 hover:text-amber-900 transition-colors"
                    data-testid={`receipt-minimize-${sale.id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-[11px] font-semibold text-amber-800 mt-0.5 truncate">
                  {sale.customerName || "Guest"}
                </p>
                <p className="text-[9px] text-amber-600 mt-0.5">
                  {format(sale.createdAt, "h:mm a")}
                </p>
              </div>

              <div className="px-3 py-1.5 space-y-0.5 max-h-[120px] overflow-y-auto">
                {sale.linesJson.map((line, i) => (
                  <div key={i} className="flex justify-between text-[10px] text-amber-900/80">
                    <span className="truncate flex-1 mr-1">
                      {line.qty > 1 && `${line.qty}x `}{line.productName}
                      {line.variantName && line.variantName !== line.productName && ` (${line.variantName})`}
                    </span>
                    <span className="font-medium shrink-0">{formatMoney(line.unitPrice * line.qty)}</span>
                  </div>
                ))}
              </div>

              <div className="px-3 py-1 border-t border-dashed border-amber-300/50">
                <div className="flex justify-between text-[11px] font-bold text-amber-900">
                  <span>Total</span>
                  <span>{formatMoney(sale.totalCents)}</span>
                </div>
              </div>

              <div className="px-3 pt-1 pb-4">
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full h-6 text-[10px] rounded-md"
                  onClick={(e) => { e.stopPropagation(); onClose(sale.id); }}
                  data-testid={`receipt-close-order-${sale.id}`}
                >
                  Close Order
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function OrderReceipts({
  sales,
  onCloseOrder,
}: {
  sales: Sale[];
  onCloseOrder: (id: string) => void;
}) {
  const openOrders = sales
    .filter(s => !s.closedAt && s.status === "completed")
    .sort((a, b) => a.createdAt - b.createdAt);

  if (openOrders.length === 0) return null;

  return (
    <div className="mb-3" data-testid="order-receipts-rail">
      <div className="relative bg-gradient-to-b from-amber-900/90 to-amber-800/80 rounded-lg shadow-md px-3 pt-0 pb-0 min-h-[12px]">
        <div className="absolute inset-x-0 top-0 h-[6px] bg-amber-950/30 rounded-t-lg" />
        <div className="absolute inset-x-0 top-[6px] h-[3px] bg-amber-700/20" />
      </div>

      <div className="flex gap-3 px-2 overflow-x-auto scrollbar-hide -mt-[1px]">
        {openOrders.map((sale, i) => (
          <ReceiptTab
            key={sale.id}
            sale={sale}
            index={i}
            onClose={onCloseOrder}
          />
        ))}
      </div>
    </div>
  );
}
