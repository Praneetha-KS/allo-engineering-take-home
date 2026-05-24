"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type StockEntry = {
  warehouseId: string;
  warehouseName: string;
  location: string | null;
  available: number;
  reserved: number;
  total: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  stock: StockEntry[];
};

type Reservation = {
  id: string;
  quantity: number;
  status: string;
  expiresAt: string;
  inventory: {
    product: { id: string; name: string; price: string };
    warehouse: { id: string; name: string };
  };
};

type AppView = "listing" | "checkout";

type AlertType = "error" | "success" | "info";

type Alert = {
  type: AlertType;
  title: string;
  message: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(price: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(price));
}

function totalAvailable(product: Product): number {
  return product.stock.reduce((sum, s) => sum + s.available, 0);
}

// ─── Alert Box ───────────────────────────────────────────────────────────────

function AlertBox({
  alert,
  onClose,
}: {
  alert: Alert;
  onClose: () => void;
}) {
  const styles: Record<AlertType, { bar: string; bg: string; icon: string; title: string }> = {
    error: {
      bar: "bg-red-500",
      bg: "bg-red-50 border-red-200",
      icon: "text-red-500",
      title: "text-red-800",
    },
    success: {
      bar: "bg-emerald-500",
      bg: "bg-emerald-50 border-emerald-200",
      icon: "text-emerald-500",
      title: "text-emerald-800",
    },
    info: {
      bar: "bg-blue-500",
      bg: "bg-blue-50 border-blue-200",
      icon: "text-blue-500",
      title: "text-blue-800",
    },
  };
  const s = styles[alert.type];
  const icons: Record<AlertType, string> = {
    error: "✕",
    success: "✓",
    info: "ℹ",
  };

  return (
    <div
      className={`relative flex items-start gap-4 rounded-xl border p-5 shadow-lg animate-slide-in ${s.bg}`}
      role="alert"
    >
      {/* left colour bar */}
      <div className={`absolute left-0 top-0 h-full w-1 rounded-l-xl ${s.bar}`} />

      {/* icon */}
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-sm font-bold ${s.bar}`}
      >
        {icons[alert.type]}
      </span>

      {/* text */}
      <div className="flex-1 pr-6">
        <p className={`font-semibold tracking-tight ${s.title}`}>{alert.title}</p>
        <p className="mt-0.5 text-sm text-slate-600">{alert.message}</p>
      </div>

      {/* close */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 transition-colors text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ─── Countdown Timer ─────────────────────────────────────────────────────────

function CountdownTimer({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );
  const calledExpired = useRef(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        const next = s - 1;
        if (next <= 0 && !calledExpired.current) {
          calledExpired.current = true;
          onExpired();
        }
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [onExpired, secondsLeft]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const pct = (secondsLeft / 600) * 100; // 600 s = 10 min
  const urgent = secondsLeft < 60;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* circular ring */}
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="#e2e8f0" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke={urgent ? "#ef4444" : "#10b981"}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={`${2 * Math.PI * 44 * (1 - pct / 100)}`}
            style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.5s" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-2xl font-bold font-mono tabular-nums ${
              urgent ? "text-red-500" : "text-slate-800"
            }`}
          >
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-400 mt-0.5">
            remaining
          </span>
        </div>
      </div>
      {urgent && (
        <p className="text-xs font-semibold text-red-500 animate-pulse">
          Hurry — reservation expiring soon!
        </p>
      )}
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onReserve,
  reservingId,
}: {
  product: Product;
  onReserve: (product: Product, warehouseId: string) => void;
  reservingId: string | null;
}) {
  const available = totalAvailable(product);
  const outOfStock = available === 0;

  return (
    <article className="group flex flex-col rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
      {/* product image / placeholder */}
      <div className="relative h-48 bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-5xl select-none">📦</span>
          </div>
        )}
        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <span className="rounded-full bg-white/90 px-4 py-1 text-xs font-bold uppercase tracking-widest text-slate-700">
              Out of stock
            </span>
          </div>
        )}
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col p-5 gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800 leading-snug">{product.name}</h2>
          {product.description && (
            <p className="mt-1 text-sm text-slate-500 line-clamp-2">{product.description}</p>
          )}
        </div>

        <p className="text-xl font-extrabold text-slate-900 tracking-tight">
          {formatPrice(product.price)}
        </p>

        {/* stock per warehouse */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            Warehouse stock
          </p>
          {product.stock.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No inventory records</p>
          ) : (
            product.stock.map((s) => (
              <div
                key={s.warehouseId}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-700">{s.warehouseName}</p>
                  {s.location && (
                    <p className="text-[11px] text-slate-400">{s.location}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      s.available > 5
                        ? "bg-emerald-100 text-emerald-700"
                        : s.available > 0
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {s.available > 0 ? `${s.available} left` : "Sold out"}
                  </span>
                  {s.available > 0 && (
                    <button
                      onClick={() => onReserve(product, s.warehouseId)}
                      disabled={reservingId === `${product.id}-${s.warehouseId}`}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {reservingId === `${product.id}-${s.warehouseId}` ? (
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Reserving…
                        </span>
                      ) : (
                        "Reserve"
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Checkout View ────────────────────────────────────────────────────────────

function CheckoutView({
  reservation,
  onConfirm,
  onCancel,
  alert,
  onDismissAlert,
  loading,
}: {
  reservation: Reservation;
  onConfirm: () => void;
  onCancel: () => void;
  alert: Alert | null;
  onDismissAlert: () => void;
  loading: boolean;
}) {
  const [expired, setExpired] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900">
            <span className="text-2xl">🔒</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Complete your order
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Your item is reserved — confirm before the timer runs out.
          </p>
        </div>

        {/* alert */}
        {alert && (
          <div className="mb-5">
            <AlertBox alert={alert} onClose={onDismissAlert} />
          </div>
        )}

        {/* card */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100">
          {/* timer */}
          <div className="flex flex-col items-center py-8 gap-2">
            {expired ? (
              <div className="text-center">
                <p className="text-4xl mb-2">⏰</p>
                <p className="font-bold text-red-500">Reservation expired</p>
                <p className="text-sm text-slate-500 mt-1">
                  Your hold has been released. Please go back and reserve again.
                </p>
              </div>
            ) : (
              <CountdownTimer
                expiresAt={reservation.expiresAt}
                onExpired={() => setExpired(true)}
              />
            )}
          </div>

          {/* order summary */}
          <div className="p-5 flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Order summary
            </p>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-slate-800">
                  {reservation.inventory.product.name}
                </p>
                <p className="text-sm text-slate-500">
                  {reservation.inventory.warehouse.name} · Qty {reservation.quantity}
                </p>
              </div>
              <p className="font-bold text-slate-900">
                {formatPrice(reservation.inventory.product.price)}
              </p>
            </div>

            {/* reservation ID for reference */}
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-400">Reservation ID</p>
              <p className="font-mono text-xs text-slate-600 break-all">{reservation.id}</p>
            </div>
          </div>

          {/* actions */}
          <div className="p-5 flex flex-col gap-3">
            <button
              onClick={onConfirm}
              disabled={loading || expired}
              className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-slate-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Confirming…
                </>
              ) : (
                "✓ Confirm Purchase"
              )}
            </button>
            <button
              onClick={onCancel}
              disabled={loading}
              className="w-full rounded-xl border border-slate-200 bg-white py-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all disabled:opacity-40"
            >
              Cancel reservation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [view, setView] = useState<AppView>("listing");
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [reservingId, setReservingId] = useState<string | null>(null);
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ── Load products ────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      setProducts(data.products ?? []);
    } catch {
      setAlert({
        type: "error",
        title: "Failed to load products",
        message: "Could not reach the server. Please refresh the page.",
      });
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // ── Reserve ──────────────────────────────────────────────────
  const handleReserve = async (product: Product, warehouseId: string) => {
    const key = `${product.id}-${warehouseId}`;
    setReservingId(key);
    setAlert(null);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, warehouseId, quantity: 1 }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setAlert({
          type: "error",
          title: "Not enough stock",
          message: data.error ?? "This item is no longer available. Please try another warehouse.",
        });
        // Refresh so stock counts are up-to-date
        fetchProducts();
        return;
      }

      if (!res.ok) {
        setAlert({
          type: "error",
          title: `Reservation failed (${res.status})`,
          message: data.error ?? "An unexpected error occurred. Please try again.",
        });
        return;
      }

      setActiveReservation(data.reservation);
      setView("checkout");
    } catch {
      setAlert({
        type: "error",
        title: "Network error",
        message: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      setReservingId(null);
    }
  };

  // ── Confirm ──────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!activeReservation) return;
    setConfirmLoading(true);
    setAlert(null);

    try {
      const res = await fetch(`/api/reservations/${activeReservation.id}/confirm`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.status === 410) {
        setAlert({
          type: "error",
          title: "Reservation expired",
          message: data.error ?? "Your 10-minute hold has passed. Please reserve the item again.",
        });
        return;
      }

      if (res.status === 409) {
        setAlert({
          type: "error",
          title: "Cannot confirm",
          message: data.error ?? "This reservation has already been confirmed or cancelled.",
        });
        return;
      }

      if (!res.ok) {
        setAlert({
          type: "error",
          title: `Confirmation failed (${res.status})`,
          message: data.error ?? "An unexpected error occurred.",
        });
        return;
      }

      // Success — show a success screen
      setAlert({
        type: "success",
        title: "Order confirmed! 🎉",
        message: `Your purchase of ${activeReservation.inventory.product.name} is confirmed. Thank you!`,
      });
      // Return to listing after a short delay
      setTimeout(() => {
        setView("listing");
        setActiveReservation(null);
        setAlert(null);
        fetchProducts();
      }, 3000);
    } catch {
      setAlert({
        type: "error",
        title: "Network error",
        message: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      setConfirmLoading(false);
    }
  };

  // ── Cancel / Release ─────────────────────────────────────────
  const handleCancel = async () => {
    if (!activeReservation) return;
    setAlert(null);

    try {
      await fetch(`/api/reservations/${activeReservation.id}/release`, {
        method: "POST",
      });
    } catch {
      // Best-effort — we navigate away regardless
    } finally {
      setView("listing");
      setActiveReservation(null);
      fetchProducts();
    }
  };

  // ── Checkout view ────────────────────────────────────────────
  if (view === "checkout" && activeReservation) {
    return (
      <CheckoutView
        reservation={activeReservation}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        alert={alert}
        onDismissAlert={() => setAlert(null)}
        loading={confirmLoading}
      />
    );
  }

  // ── Product listing view ──────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-in { animation: slide-in 0.25s ease-out both; }
      `}</style>

      <div className="min-h-screen bg-slate-50">
        {/* nav */}
        <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏪</span>
              <span className="font-extrabold text-slate-900 tracking-tight text-lg">
                Allo Store
              </span>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
              {products.length} products
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-10">
          {/* page title */}
          <div className="mb-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              All Products
            </h1>
            <p className="mt-1 text-slate-500 text-sm">
              Reserve any item for 10 minutes while you complete checkout.
            </p>
          </div>

          {/* global alert */}
          {alert && (
            <div className="mb-6">
              <AlertBox alert={alert} onClose={() => setAlert(null)} />
            </div>
          )}

          {/* product grid */}
          {loadingProducts ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-80 rounded-2xl bg-slate-100 animate-pulse"
                  style={{ animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <span className="text-5xl">📭</span>
              <p className="font-bold text-slate-700">No products found</p>
              <p className="text-sm text-slate-400">
                Seed your database and refresh the page.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onReserve={handleReserve}
                  reservingId={reservingId}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}