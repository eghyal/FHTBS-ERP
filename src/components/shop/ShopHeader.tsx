import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, Search, Package, ArrowLeft, X, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShopHeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  cartItemCount: number;
  orderCount?: number;
  onOpenCart: () => void;
  onOpenTracking: () => void;
  customer?: any | null;
  onOpenAuth?: () => void;
  onLogoutCustomer?: () => void;
}

export function ShopHeader({
  searchQuery,
  onSearchChange,
  cartItemCount,
  orderCount = 0,
  onOpenCart,
  onOpenTracking,
  customer,
  onOpenAuth,
  onLogoutCustomer,
}: ShopHeaderProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/82 backdrop-blur-xl border-b border-stone-200/40 transition-colors">
      {/* Main Navbar Row */}
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2.5 sm:gap-4">
        {/* Brand & Prominent Back Button (Always visible on mobile & desktop) */}
        <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 py-2 px-2.5 sm:px-3 rounded-xl bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-800 font-bold text-xs border border-stone-200/80 transition-all touch-manipulation cursor-pointer shrink-0 shadow-2xs whitespace-nowrap"
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4 text-stone-700" />
            <span className="text-xs font-bold">Back</span>
          </button>

          <Link to="/shop" className="flex items-center gap-2 group shrink-0">
            <img
              src="/logo.png"
              alt="Paving Joss Logo"
              className="h-8 sm:h-9 w-auto object-contain transition-transform group-hover:scale-105"
            />
            <span className="text-sm sm:text-xl font-black text-stone-900 tracking-tight whitespace-nowrap">
              Factory Store
            </span>
          </Link>
        </div>

        {/* Global Product Search (Desktop and Tablet Row) */}
        <div className="hidden md:flex flex-1 max-w-xl mx-4 lg:mx-6">
          <div
            className={cn(
              "w-full relative flex items-center bg-stone-100/90 rounded-2xl border transition-all duration-200",
              isSearchFocused
                ? "bg-white border-stone-800 shadow-sm ring-2 ring-stone-900/5"
                : "border-stone-200 hover:border-stone-300"
            )}
          >
            <Search className="w-4 h-4 text-stone-400 ml-3.5 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder="Search paving blocks, curbstones, drainage channels..."
              className="w-full bg-transparent py-2.5 px-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-hidden"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="p-1 mr-2 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-200/60"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Actions in exact order: 1. Sign In / Customer Profile -> 2. Pesanan -> 3. Keranjang */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* 1. Customer Authentication Chip / Sign In Button */}
          {customer ? (
            <div className="flex items-center gap-1.5 p-1 bg-stone-100/90 border border-stone-200 rounded-xl shrink-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden bg-stone-200 shrink-0 border border-white">
                <img
                  src={
                    customer.avatar_url ||
                    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                      customer.customer_name || "C"
                    )}`
                  }
                  alt={customer.customer_name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="hidden lg:block text-left px-1 min-w-0 max-w-[120px]">
                <div className="text-[11px] font-bold text-stone-900 truncate">
                  {customer.customer_name}
                </div>
                <div className="text-[9px] text-stone-400 truncate">
                  {customer.company || "Customer"}
                </div>
              </div>
              {onLogoutCustomer && (
                <button
                  onClick={onLogoutCustomer}
                  title="Sign Out"
                  aria-label="Sign Out"
                  className="p-1 sm:p-1.5 text-stone-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            onOpenAuth && (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs font-bold text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-50 border border-stone-200/90 shadow-2xs transition-all touch-manipulation cursor-pointer whitespace-nowrap shrink-0"
                title="Sign In"
                aria-label="Sign In"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Sign In</span>
              </button>
            )
          )}

          {/* 2. Orders Button */}
          <button
            onClick={onOpenTracking}
            className="relative flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200/90 shadow-2xs transition-all active:scale-95 touch-manipulation cursor-pointer whitespace-nowrap shrink-0"
            title={customer ? "View My Orders" : "Sign In to View Orders"}
            aria-label="My Orders"
          >
            <Package className="w-4 h-4 text-stone-700 shrink-0" />
            <span>Orders</span>
            {customer && orderCount > 0 && (
              <span className="bg-rose-50 text-[#b02524] border border-rose-200/80 text-[10px] sm:text-[11px] font-black font-mono tabular-nums px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
                {orderCount > 99 ? "99+" : orderCount}
              </span>
            )}
          </button>

          {/* 3. Cart Button */}
          <button
            onClick={onOpenCart}
            className="relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-[#b02524] hover:bg-[#8e1d1c] text-white font-bold text-xs sm:text-sm shadow-sm hover:shadow-md transition-all active:scale-95 touch-manipulation cursor-pointer whitespace-nowrap shrink-0"
            aria-label="View Cart"
            title="Shopping Cart"
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Cart</span>
            {cartItemCount > 0 && (
              <span className="bg-white/20 text-white text-[10px] sm:text-[11px] font-black font-mono tabular-nums px-1.5 sm:px-2 py-0.5 rounded-full min-w-[18px] sm:min-w-[20px] text-center leading-tight">
                {cartItemCount > 99 ? "99+" : cartItemCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Dedicated Mobile Search Row (Clean, unclipped, easy thumb input on < md screens) */}
      <div className="md:hidden px-3 pb-2.5 pt-0 bg-white">
        <div
          className={cn(
            "relative flex items-center bg-stone-100/90 rounded-xl border transition-all duration-200",
            isSearchFocused
              ? "bg-white border-stone-800 shadow-xs ring-2 ring-stone-900/5"
              : "border-stone-200 hover:border-stone-300"
          )}
        >
          <Search className="w-4 h-4 text-stone-400 ml-3 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder="Search paving blocks, curbstones..."
            className="w-full bg-transparent py-2 px-2.5 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-hidden"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="p-1 mr-2 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-200/60"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
