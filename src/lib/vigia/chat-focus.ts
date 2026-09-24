import { create } from "zustand";
import type { Product } from "./types";

interface ChatFocusState {
  focused: Product | null;
  autoOpen: boolean;
  focusOn: (product: Product) => void;
  clear: () => void;
}

export const useChatFocus = create<ChatFocusState>((set) => ({
  focused: null,
  autoOpen: false,
  focusOn: (product) => set({ focused: product, autoOpen: true }),
  clear: () => set({ focused: null, autoOpen: false }),
}));
