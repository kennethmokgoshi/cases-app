'use client';
import { Toaster as Sonner, toast } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-zeno-navy group-[.toaster]:text-white group-[.toaster]:border-white/10 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-gray-400",
          actionButton: "group-[.toast]:bg-zeno-cyan group-[.toast]:text-zeno-navy",
          cancelButton: "group-[.toast]:bg-white/10 group-[.toast]:text-gray-300",
        },
      }}
    />
  );
}

export { toast };
