import { create } from "zustand";
import type { Product } from "./types";

interface ChatFocusState {
  focused: Product | null;
  autoOpen: boolean;
  openChat: () => void;
  focusOn: (product: Product) => void;
  clear: () => void;
}

export const useChatFocus = create<ChatFocusState>((set) => ({
  focused: null,
  autoOpen: false,
  openChat: () => set({ focused: null, autoOpen: true }),
  focusOn: (product) => set({ focused: product, autoOpen: true }),
  clear: () => set({ focused: null, autoOpen: false }),
}));
